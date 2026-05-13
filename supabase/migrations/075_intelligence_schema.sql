-- Migration 075 — Intelligence schema
--
-- Phase C of the redesign reconciliation: bring tribe-v3's data
-- model in line with the canonical schema from the sibling tribe-os
-- codebase so we can wire up the AI features described in
-- AGENTIC_FEATURES_STRATEGY.md.
--
-- This is additive — every change is a new column with a safe
-- default, or a new table. No data migration; the existing
-- `status` column stays as the admin-controlled enum
-- (active/lead/lapsed/inactive). The new `health_status` is the
-- automated derived signal (HEALTHY / WATCH / AT_RISK).
--
-- Sections:
--   1. clients table — churn risk + health status + cached attendance metrics
--   2. training_partners — community graph (the moat)
--   3. community_insights + community_insight_members — AI-generated insight cards
--   4. agent_run_log — observability for every AI feature invocation
--   5. exercise_videos — curated mapping of exercise names → demo videos
--
-- RLS strategy: every new table follows the gym-scoped dual-path
-- pattern established in migration 070 (gym_id when present, else
-- a join through clients to instructor_user_id).

-- ============================================================
-- 1. CLIENTS — churn + health + attendance cache
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS churn_risk_score numeric(4, 3),
  ADD COLUMN IF NOT EXISTS churn_risk_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'HEALTHY'
    CHECK (health_status IN ('HEALTHY', 'WATCH', 'AT_RISK')),
  ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_last_30_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak_days integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clients_health_status
  ON public.clients (gym_id, health_status)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_clients_churn_risk
  ON public.clients (gym_id, churn_risk_score DESC NULLS LAST)
  WHERE archived = false AND churn_risk_score IS NOT NULL;

COMMENT ON COLUMN public.clients.churn_risk_score IS
  'AI-computed churn probability (0.000–1.000). Updated by the nightly batch and on demand via /api/tribe-os/ai/rescore-member. NULL = not scored yet.';

COMMENT ON COLUMN public.clients.health_status IS
  'Derived health label from churn_risk_score. Distinct from clients.status (which is the admin-controlled active/lead/lapsed/inactive enum) — health_status is what the AI assigns, status is what the gym owner sets.';

-- ============================================================
-- 2. TRAINING_PARTNERS — community graph
-- ============================================================

-- Co-attendance pairs are the data source for Tribe's retention
-- moat. Every time two clients attend the same session, we upsert
-- the pair here. memberAId < memberBId is enforced at the
-- application layer to keep one row per pair.

CREATE TABLE IF NOT EXISTS public.training_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_a_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  member_b_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Edge strength metrics
  shared_sessions integer NOT NULL DEFAULT 1,
  last_30_day_sessions integer NOT NULL DEFAULT 0,
  first_shared_at timestamptz NOT NULL,
  last_shared_at timestamptz NOT NULL,

  -- Derived scores (updated by the nightly job)
  compatibility_score numeric(4, 3),
  retention_correlation numeric(4, 3),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (member_a_id, member_b_id),
  CHECK (member_a_id < member_b_id)
);

CREATE INDEX IF NOT EXISTS idx_training_partners_gym ON public.training_partners (gym_id);
CREATE INDEX IF NOT EXISTS idx_training_partners_a ON public.training_partners (member_a_id);
CREATE INDEX IF NOT EXISTS idx_training_partners_b ON public.training_partners (member_b_id);

DROP TRIGGER IF EXISTS training_partners_updated_at ON public.training_partners;
CREATE TRIGGER training_partners_updated_at
  BEFORE UPDATE ON public.training_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.training_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_partners_member_select" ON public.training_partners;
CREATE POLICY "training_partners_member_select"
  ON public.training_partners FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = training_partners.gym_id AND gc.user_id = auth.uid()
    )
  );

-- Writes are service-role only — the co-attendance writer is a
-- nightly job or trigger, not a user-facing action.

COMMENT ON TABLE public.training_partners IS
  'Community graph edges: every co-attendance between two clients in the same gym. Updated by the attendance-write trigger + nightly compatibility/retention scoring job.';

-- ============================================================
-- 3. COMMUNITY_INSIGHTS — AI-generated insight cards
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,

  -- Classification
  type text NOT NULL CHECK (type IN ('CHURN_RISK', 'RETENTION_OPP', 'REVENUE', 'GROWTH')),
  severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  is_actioned boolean NOT NULL DEFAULT false,

  -- Content
  headline text NOT NULL,
  body text NOT NULL,
  action_label text,
  action_type text CHECK (action_type IN ('SEND_MESSAGE', 'CREATE_SESSION', 'CALL_MEMBER', 'REVIEW_SCHEDULE')),

  -- Backing data (for auditability)
  data_payload jsonb,
  predicted_revenue_cents integer,
  confidence_score numeric(4, 3),

  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_insights_gym_unactioned
  ON public.community_insights (gym_id, is_actioned, severity)
  WHERE expires_at > now();

CREATE INDEX IF NOT EXISTS idx_community_insights_gym_type
  ON public.community_insights (gym_id, type);

DROP TRIGGER IF EXISTS community_insights_updated_at ON public.community_insights;
CREATE TRIGGER community_insights_updated_at
  BEFORE UPDATE ON public.community_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.community_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_insights_member_select" ON public.community_insights;
CREATE POLICY "community_insights_member_select"
  ON public.community_insights FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = community_insights.gym_id AND gc.user_id = auth.uid()
    )
  );

-- Mark-as-actioned: any gym member can dismiss. (Stricter
-- "owner-only dismiss" can come later if it matters.)
DROP POLICY IF EXISTS "community_insights_member_update" ON public.community_insights;
CREATE POLICY "community_insights_member_update"
  ON public.community_insights FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = community_insights.gym_id AND gc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = community_insights.gym_id AND gc.user_id = auth.uid()
    )
  );

-- Inserts go through the service-role from the nightly job.

-- Membership table (insight ↔ clients many-to-many)

CREATE TABLE IF NOT EXISTS public.community_insight_members (
  insight_id uuid NOT NULL REFERENCES public.community_insights(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  PRIMARY KEY (insight_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_community_insight_members_client
  ON public.community_insight_members (client_id);

ALTER TABLE public.community_insight_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_insight_members_select" ON public.community_insight_members;
CREATE POLICY "community_insight_members_select"
  ON public.community_insight_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_insights ci
      JOIN public.gym_coaches gc ON gc.gym_id = ci.gym_id
      WHERE ci.id = community_insight_members.insight_id
        AND gc.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. AGENT_RUN_LOG — AI feature invocation log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,

  feature text NOT NULL,
  model text NOT NULL DEFAULT 'none',

  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,

  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,

  success boolean NOT NULL DEFAULT true,
  error_code text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_log_gym_created
  ON public.agent_run_log (gym_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_run_log_gym_feature
  ON public.agent_run_log (gym_id, feature, created_at DESC);

ALTER TABLE public.agent_run_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_run_log_member_select" ON public.agent_run_log;
CREATE POLICY "agent_run_log_member_select"
  ON public.agent_run_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = agent_run_log.gym_id AND gc.user_id = auth.uid()
    )
  );

-- Writes go through the service-role from the API/cron — never
-- directly from a user session.

COMMENT ON TABLE public.agent_run_log IS
  'Cost + latency + success log for every AI feature invocation. Powers the per-gym monthly cost dashboard, the cache-hit-rate monitor, and the error-rate alerts.';

-- ============================================================
-- 5. EXERCISE_VIDEOS — curated YouTube library
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exercise_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- gym_id NULL = global library; set = gym-specific override
  gym_id uuid REFERENCES public.gyms(id) ON DELETE CASCADE,

  exercise_name text NOT NULL,
  aliases jsonb,

  youtube_id text NOT NULL,
  video_title text,
  thumbnail_url text,

  category text,
  muscle_group text,

  is_verified boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One video per exercise per gym (NULL gym_id = global default)
  UNIQUE NULLS NOT DISTINCT (gym_id, exercise_name)
);

CREATE INDEX IF NOT EXISTS idx_exercise_videos_name ON public.exercise_videos (exercise_name);
CREATE INDEX IF NOT EXISTS idx_exercise_videos_gym ON public.exercise_videos (gym_id);
CREATE INDEX IF NOT EXISTS idx_exercise_videos_category ON public.exercise_videos (category);

DROP TRIGGER IF EXISTS exercise_videos_updated_at ON public.exercise_videos;
CREATE TRIGGER exercise_videos_updated_at
  BEFORE UPDATE ON public.exercise_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.exercise_videos ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read the global library or their gym's
-- overrides. Writes are owner-only for gym-scoped rows; global
-- rows are managed via service-role.
DROP POLICY IF EXISTS "exercise_videos_select" ON public.exercise_videos;
CREATE POLICY "exercise_videos_select"
  ON public.exercise_videos FOR SELECT
  TO authenticated
  USING (
    gym_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = exercise_videos.gym_id AND gc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exercise_videos_owner_write" ON public.exercise_videos;
CREATE POLICY "exercise_videos_owner_write"
  ON public.exercise_videos FOR INSERT
  TO authenticated
  WITH CHECK (
    gym_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = exercise_videos.gym_id AND g.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exercise_videos_owner_update" ON public.exercise_videos;
CREATE POLICY "exercise_videos_owner_update"
  ON public.exercise_videos FOR UPDATE
  TO authenticated
  USING (
    gym_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = exercise_videos.gym_id AND g.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    gym_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = exercise_videos.gym_id AND g.owner_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.exercise_videos IS
  'Curated mapping of exercise names to YouTube videos. Used by the AI workout generator (1.3) to attach demo videos. gym_id IS NULL = global library; NOT NULL = gym-specific override.';

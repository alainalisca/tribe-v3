-- 068_gym_tenant_schema.sql
-- Phase 2 Tribe.OS gym-tenant foundation. Path B: additive migration.
--
-- Background
-- ----------
-- Tribe.OS was originally implemented as an instructor-tenant model:
-- every premium feature was scoped to a single user via
-- `instructor_user_id` (or `sessions.creator_id` for payments). The
-- product reality is that real gyms have multiple coaches who share a
-- client roster, attendance log, and revenue ledger under one billing
-- subscription. This migration introduces the schema for that
-- multi-coach model WITHOUT breaking the existing instructor-tenant
-- code or data.
--
-- Strategy
-- --------
--   1. Create `gyms` (the tenant) and `gym_coaches` (many-to-many of
--      users to gyms, with role).
--   2. Add nullable `gym_id` columns to every tenant-scoped table.
--   3. Leave RLS untouched — existing policies on `instructor_user_id`
--      keep working. Backfill (migration 069) populates `gym_id` for
--      all existing rows. Dual-path RLS (migration 070) then layers a
--      second policy branch that accepts gym membership.
--   4. Eventually (Week 5+, after every Tribe.OS user has been
--      operating on the gym path) a cleanup migration drops the
--      `instructor_user_id` RLS branch. See LATER.md.
--
-- Why nullable gym_id
-- -------------------
-- Nullable lets the migration apply against existing rows without
-- requiring a backfill in the same transaction (which would have to
-- synthesize gyms inline — too coupled). Mission 3 (migration 069)
-- backfills, then a future migration can flip to NOT NULL once we're
-- confident every premium row has a gym.
--
-- Why no RLS on gyms / gym_coaches yet
-- -------------------------------------
-- We don't want gym lookup to be readable by every authenticated user
-- (gym name + owner could be sensitive in some markets), so RLS will
-- be added in migration 070 alongside the dual-path policies on the
-- tenant tables. Until then these tables are only written to by the
-- service-role backfill in migration 069.

-- ------------------------------------------------------------------
-- gyms
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  -- Slug is human-readable URL fragment. Uniqueness enforced at DB so
  -- two gyms can't collide on URL. Backfill (069) appends a 6-char
  -- hash suffix to prevent collisions during synthesis.
  slug text NOT NULL UNIQUE
    CHECK (char_length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9-]+$'),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Subscription state lives on the gym, not the user. The Stripe
  -- webhook (Mission 6) flips these fields. NULL = never subscribed.
  -- We allow NULL by leaving status nullable; the CHECK only fires
  -- when a value is present.
  tribe_os_status text
    CHECK (tribe_os_status IS NULL OR tribe_os_status IN ('active','past_due','canceled','trialing')),
  tribe_os_tier text
    CHECK (tribe_os_tier IS NULL OR tribe_os_tier IN ('solo','team_studio')),
  tribe_os_stripe_customer_id text,
  tribe_os_stripe_subscription_id text,
  tribe_os_granted_at timestamptz,
  tribe_os_granted_by text
    CHECK (tribe_os_granted_by IS NULL OR char_length(tribe_os_granted_by) <= 255),

  -- Locale / display preferences for revenue dashboard. Mirrors the
  -- columns on `users` so a gym with multiple coaches has its own
  -- presentation settings independent of any one user.
  timezone text NOT NULL DEFAULT 'America/Bogota',
  default_currency text
    CHECK (default_currency IS NULL OR default_currency IN ('USD','COP')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Soft-delete for the gym record. Hard-deleting would orphan
  -- payments / clients. Marked here for symmetry with the rest of the
  -- schema; not actively used until we have a UX for it.
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gyms_owner
  ON public.gyms (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_gyms_status_active
  ON public.gyms (tribe_os_status)
  WHERE deleted_at IS NULL;

-- Lookup by Stripe customer / subscription ID is the hot path for the
-- webhook handler (Mission 6). Partial indexes since most gyms won't
-- have these populated initially.
CREATE INDEX IF NOT EXISTS idx_gyms_stripe_customer
  ON public.gyms (tribe_os_stripe_customer_id)
  WHERE tribe_os_stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gyms_stripe_subscription
  ON public.gyms (tribe_os_stripe_subscription_id)
  WHERE tribe_os_stripe_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_gyms_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gyms_touch_updated_at ON public.gyms;
CREATE TRIGGER gyms_touch_updated_at
  BEFORE UPDATE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.touch_gyms_updated_at();

ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;

-- Minimal placeholder policies. The real dual-path policies land in
-- migration 070. Until then: a user can read their own gym(s), and
-- nobody can write except service-role.
DROP POLICY IF EXISTS "gyms_owner_select" ON public.gyms;
CREATE POLICY "gyms_owner_select"
  ON public.gyms FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gyms.id AND gc.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- gym_coaches
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gym_coaches (
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'coach'
    CHECK (role IN ('owner','coach','assistant')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gym_coaches_user
  ON public.gym_coaches (user_id);

ALTER TABLE public.gym_coaches ENABLE ROW LEVEL SECURITY;

-- A user can see the coach rows for any gym they themselves are in.
-- Write access stays service-role-only until Mission 5 / 6 add an
-- explicit coach-invite endpoint.
DROP POLICY IF EXISTS "gym_coaches_member_select" ON public.gym_coaches;
CREATE POLICY "gym_coaches_member_select"
  ON public.gym_coaches FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc2
      WHERE gc2.gym_id = gym_coaches.gym_id AND gc2.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- gym_id columns on tenant-scoped tables
-- ------------------------------------------------------------------
--
-- Inventory of tenant-scoped tables (verified by grep over
-- supabase/migrations and lib/dal):
--
--   clients              — direct instructor_user_id column
--   client_attendance    — joined through clients (no direct column)
--                          but adding gym_id here lets revenue queries
--                          skip the join and lets dual-path RLS work
--                          without an EXISTS subquery for the gym path
--   payments             — scoped via sessions.creator_id; adding
--                          gym_id denormalizes for the revenue
--                          dashboard's hot path
--
-- Tables intentionally NOT touched:
--   sessions             — pre-existing social-feature concept,
--                          shared by many users. Revenue traceability
--                          for paid sessions goes through payments.gym_id.
--   subscription_payments — user-level billing, not tenant data
--   users                — already has tribe_os_* columns; gym
--                          membership is the new source of truth but
--                          the legacy columns stay for backward compat

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS gym_id uuid REFERENCES public.gyms(id);

ALTER TABLE public.client_attendance
  ADD COLUMN IF NOT EXISTS gym_id uuid REFERENCES public.gyms(id);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gym_id uuid REFERENCES public.gyms(id);

-- Indexes on the new gym_id columns. Partial-index where it makes
-- sense (active rows, paid attendance, approved payments) to keep
-- them small.

CREATE INDEX IF NOT EXISTS idx_clients_gym_active
  ON public.clients (gym_id, created_at DESC)
  WHERE archived = false AND gym_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_attendance_gym
  ON public.client_attendance (gym_id, created_at DESC)
  WHERE gym_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_gym_approved
  ON public.payments (gym_id, created_at DESC)
  WHERE gym_id IS NOT NULL AND status = 'approved';

-- ------------------------------------------------------------------
-- Documentation
-- ------------------------------------------------------------------

COMMENT ON TABLE public.gyms IS
  'Tribe.OS premium tenant. Each gym has one or more coaches via gym_coaches. Subscription billing (status, Stripe IDs) flips on the gym, not individual coaches. Created in migration 068; backfilled from existing premium users in migration 069.';

COMMENT ON TABLE public.gym_coaches IS
  'Junction of users to gyms with a role. Dual-path RLS on tenant tables (migration 070) treats a row here as equivalent to legacy instructor_user_id ownership.';

COMMENT ON COLUMN public.clients.gym_id IS
  'Gym that owns this client. Nullable during transition; backfilled in migration 069. Once all rows have gym_id populated, future migration may flip to NOT NULL and drop the instructor_user_id RLS branch.';

COMMENT ON COLUMN public.client_attendance.gym_id IS
  'Denormalized from clients.gym_id for revenue dashboard query speed and direct RLS scoping. Kept in sync via the application DAL (no trigger to avoid write amplification).';

COMMENT ON COLUMN public.payments.gym_id IS
  'Gym that owns the revenue from this payment. Denormalized from sessions.creator_id -> users -> gyms. Nullable during transition; backfilled in migration 069.';

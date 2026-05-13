-- Migration 074 — Gym Teams
--
-- Adds the team-grouping concept to Tribe.OS. A "team" is a named
-- subset of a gym's members with an optional head coach assigned.
-- Common patterns in the Medellín market:
--   "Competition Squad"   — advanced athletes prepping for events
--   "Morning Crew"        — the 5:30 AM regulars
--   "Foundations"         — new members in onboarding
--   "Personal Training"   — 1-on-1 clients with custom programming
--
-- Two tables:
--   gym_teams         — the team itself, with name/description/color/coach
--   gym_team_members  — many-to-many join between gym_teams and clients
--
-- Both are gym-scoped and RLS-protected via the same gym_coaches
-- membership pattern used by other gym-tenant tables. Writes are
-- owner-only (we don't yet differentiate "coach can edit my own team"
-- from "coach can edit any team" — that nuance lands when we surface
-- it in the UI).

-- ---------- gym_teams ----------

CREATE TABLE IF NOT EXISTS public.gym_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- One of: lime (default), blue, amber, red, purple, slate. Used by
  -- the UI to color the top stripe of each team card.
  color text NOT NULL DEFAULT 'lime'
    CHECK (color IN ('lime', 'blue', 'amber', 'red', 'purple', 'slate')),
  -- The head coach. Nullable — a team can be unassigned, or owned by
  -- the gym at large. References users.id because coaches are
  -- platform users (members are clients, which are not users).
  coach_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A gym can't have two teams with the same name.
  UNIQUE (gym_id, name)
);

CREATE INDEX IF NOT EXISTS idx_gym_teams_gym ON public.gym_teams (gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_teams_coach ON public.gym_teams (coach_user_id) WHERE coach_user_id IS NOT NULL;

COMMENT ON TABLE public.gym_teams IS
  'Named groupings of members within a gym (e.g. Competition Squad, Morning Crew). Coach is optional; member roster lives in gym_team_members.';

-- updated_at trigger
DROP TRIGGER IF EXISTS gym_teams_updated_at ON public.gym_teams;
CREATE TRIGGER gym_teams_updated_at
  BEFORE UPDATE ON public.gym_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- gym_team_members ----------

CREATE TABLE IF NOT EXISTS public.gym_team_members (
  team_id uuid NOT NULL REFERENCES public.gym_teams(id) ON DELETE CASCADE,
  -- The client this row points at. Member of a team = client in the
  -- gym. The team and the client must belong to the same gym; this
  -- isn't enforced at the FK level but is checked in RLS / DAL.
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_gym_team_members_client ON public.gym_team_members (client_id);

COMMENT ON TABLE public.gym_team_members IS
  'Many-to-many between gym_teams and clients. A client can belong to multiple teams (e.g. someone in both Competition Squad and Personal Training).';

-- ---------- RLS ----------

ALTER TABLE public.gym_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_team_members ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the gym (owner, coach, assistant) can see
-- every team in their gym.
DROP POLICY IF EXISTS "gym_teams_member_select" ON public.gym_teams;
CREATE POLICY "gym_teams_member_select"
  ON public.gym_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_teams.gym_id
        AND gc.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: gym owner only. Multi-coach edits land later.
DROP POLICY IF EXISTS "gym_teams_owner_insert" ON public.gym_teams;
CREATE POLICY "gym_teams_owner_insert"
  ON public.gym_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_teams.gym_id
        AND g.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gym_teams_owner_update" ON public.gym_teams;
CREATE POLICY "gym_teams_owner_update"
  ON public.gym_teams FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_teams.gym_id
        AND g.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_teams.gym_id
        AND g.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gym_teams_owner_delete" ON public.gym_teams;
CREATE POLICY "gym_teams_owner_delete"
  ON public.gym_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_teams.gym_id
        AND g.owner_user_id = auth.uid()
    )
  );

-- gym_team_members: SELECT for any gym member; writes go through
-- the service-role from the API (the team add/remove flows do
-- multiple checks that are awkward to express as one RLS predicate).
DROP POLICY IF EXISTS "gym_team_members_member_select" ON public.gym_team_members;
CREATE POLICY "gym_team_members_member_select"
  ON public.gym_team_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.gym_teams gt
      JOIN public.gym_coaches gc ON gc.gym_id = gt.gym_id
      WHERE gt.id = gym_team_members.team_id
        AND gc.user_id = auth.uid()
    )
  );

-- No write policies on gym_team_members for `authenticated` —
-- service-role bypasses RLS so the API can manage memberships.

-- ---------- SECURITY DEFINER helper ----------
-- list_teams_for_gym returns each team with aggregated member counts
-- and a small avatar-preview array of client names. Mirrors the
-- pattern in list_gym_coaches (073).

CREATE OR REPLACE FUNCTION public.list_teams_for_gym(p_gym_id uuid)
RETURNS TABLE (
  id uuid,
  gym_id uuid,
  name text,
  description text,
  color text,
  coach_user_id uuid,
  coach_name text,
  member_count bigint,
  active_count bigint,
  at_risk_count bigint,
  preview_members jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be a member of the gym.
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_coaches
    WHERE gym_id = p_gym_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    gt.id,
    gt.gym_id,
    gt.name,
    gt.description,
    gt.color,
    gt.coach_user_id,
    u.name AS coach_name,
    COALESCE(stats.member_count, 0)::bigint AS member_count,
    COALESCE(stats.active_count, 0)::bigint AS active_count,
    COALESCE(stats.at_risk_count, 0)::bigint AS at_risk_count,
    COALESCE(stats.preview_members, '[]'::jsonb) AS preview_members,
    gt.created_at,
    gt.updated_at
  FROM public.gym_teams gt
  LEFT JOIN public.users u ON u.id = gt.coach_user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS member_count,
      COUNT(*) FILTER (WHERE c.status = 'active') AS active_count,
      COUNT(*) FILTER (
        WHERE c.status = 'lapsed'
          OR (c.status = 'active' AND (c.last_seen_at IS NULL OR c.last_seen_at < now() - interval '14 days'))
      ) AS at_risk_count,
      jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS preview_members
    FROM public.gym_team_members tm
    JOIN public.clients c ON c.id = tm.client_id AND c.archived = false
    WHERE tm.team_id = gt.id
  ) stats ON TRUE
  WHERE gt.gym_id = p_gym_id
  ORDER BY gt.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_teams_for_gym(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_teams_for_gym(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_teams_for_gym(uuid) IS
  'Returns every team in the gym with aggregated member counts and a preview of member names. Membership check on auth.uid() via gym_coaches.';

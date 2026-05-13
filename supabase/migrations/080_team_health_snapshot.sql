-- Migration 080 — Team health snapshot in list_teams_for_gym
--
-- Updates the RPC that powers /os/teams so each team card carries a
-- three-bucket health breakdown (healthy / watch / at_risk) using
-- the same precedence rules /os/members uses:
--
--   1. AI health_status = 'AT_RISK'                       → at_risk
--   2. AI health_status = 'WATCH'                         → watch
--   3. Manual status   = 'lapsed'                         → watch
--   4. Heuristic       (active AND last_seen > 14 days)   → at_risk
--   5. Default                                            → healthy
--
-- Why we needed to replace (vs CREATE OR REPLACE): the function's
-- RETURNS TABLE signature is changing (new healthy_count and
-- watch_count columns), and Postgres doesn't allow signature
-- changes via CREATE OR REPLACE — must DROP first.
--
-- The old `at_risk_count` column is preserved in the return shape
-- with a more accurate definition (was status='lapsed' OR heuristic;
-- is now AI + heuristic per precedence above). `active_count` is
-- kept for back-compat with existing callers — same semantic as
-- before (manual status='active' regardless of health).
--
-- inactive / lead clients are NOT counted in any of the three health
-- buckets. They're a distinct concern (sales pipeline / churned) and
-- conflating them with health makes the dashboard math confusing.
-- member_count still counts everyone non-archived.

DROP FUNCTION IF EXISTS public.list_teams_for_gym(uuid);

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
  healthy_count bigint,
  watch_count bigint,
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
    COALESCE(stats.healthy_count, 0)::bigint AS healthy_count,
    COALESCE(stats.watch_count, 0)::bigint AS watch_count,
    COALESCE(stats.at_risk_count, 0)::bigint AS at_risk_count,
    COALESCE(stats.preview_members, '[]'::jsonb) AS preview_members,
    gt.created_at,
    gt.updated_at
  FROM public.gym_teams gt
  LEFT JOIN public.users u ON u.id = gt.coach_user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS member_count,
      -- active_count: manual status = active, kept for back-compat.
      COUNT(*) FILTER (WHERE c.status = 'active') AS active_count,
      -- Three health buckets, mutually exclusive per the precedence
      -- ladder. We only count clients in active/lapsed status — leads
      -- and inactives are excluded from health math entirely (they're
      -- not actionable "is this person about to churn?" candidates).
      COUNT(*) FILTER (
        WHERE c.status IN ('active', 'lapsed')
          AND (
            c.health_status = 'AT_RISK'
            OR (
              -- Heuristic at-risk: AI hasn't flagged them but they
              -- haven't been seen in 14+ days while still nominally
              -- active. Matches the /os/members fallback.
              c.health_status IS DISTINCT FROM 'AT_RISK'
              AND c.health_status IS DISTINCT FROM 'WATCH'
              AND c.status = 'active'
              AND (c.last_seen_at IS NULL OR c.last_seen_at < now() - interval '14 days')
            )
          )
      ) AS at_risk_count,
      COUNT(*) FILTER (
        WHERE c.status IN ('active', 'lapsed')
          AND c.health_status IS DISTINCT FROM 'AT_RISK'
          AND (
            c.health_status = 'WATCH'
            OR c.status = 'lapsed'
          )
          -- A lapsed member who's also heuristic-at-risk should fall
          -- into the at_risk bucket above, not here.
          AND NOT (
            c.status = 'active'
            AND (c.last_seen_at IS NULL OR c.last_seen_at < now() - interval '14 days')
          )
      ) AS watch_count,
      COUNT(*) FILTER (
        WHERE c.status IN ('active', 'lapsed')
          AND c.health_status IS DISTINCT FROM 'AT_RISK'
          AND c.health_status IS DISTINCT FROM 'WATCH'
          AND c.status <> 'lapsed'
          AND NOT (
            c.status = 'active'
            AND (c.last_seen_at IS NULL OR c.last_seen_at < now() - interval '14 days')
          )
      ) AS healthy_count,
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
  'Returns every team in the gym with member counts plus a three-bucket health snapshot (healthy/watch/at_risk) derived from AI health_status + manual status + heuristic. Membership check on auth.uid() via gym_coaches.';

-- Verification:
--   SELECT id, name, member_count, healthy_count, watch_count, at_risk_count
--   FROM public.list_teams_for_gym('<your_gym_id>'::uuid);

-- Migration 078 — bump_longest_streak helper
--
-- The intelligence scoring pipeline (lib/ai/data-access.ts ::
-- persistMemberScore) computes a member's current attendance streak
-- on every rescore. We want to also track their lifetime longest
-- streak (clients.longest_streak_days, added in migration 075) so
-- surfaces can celebrate milestones + identify members on PRs.
--
-- A naïve UPDATE longest_streak_days = X would silently overwrite a
-- higher historical value if the current run lost a row (e.g. a
-- transient query failure). This SECURITY DEFINER helper uses
-- GREATEST() so longest_streak_days only ever ratchets up.
--
-- Called from persistMemberScore() once per scored member. The TS
-- side already logs + tolerates failure here, so this is a
-- best-effort write.

CREATE OR REPLACE FUNCTION public.bump_longest_streak(
  p_client_id uuid,
  p_streak integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clients
  SET longest_streak_days = GREATEST(longest_streak_days, p_streak)
  WHERE id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_longest_streak(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_longest_streak(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.bump_longest_streak(uuid, integer) IS
  'Monotonically bumps clients.longest_streak_days to GREATEST(existing, p_streak). Called by the intelligence pipeline on every rescore. Idempotent + safe under transient failures.';

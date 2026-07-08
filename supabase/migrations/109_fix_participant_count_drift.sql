-- 109_fix_participant_count_drift.sql
-- T-COUNT1: sessions.current_participants drifted (a confirmed-row delete drove
-- it to -1).
--
-- LIVE DIAGNOSIS: two triggers maintained the count on session_participants —
--   1. trg_sync_session_participant_count -> sync_session_participant_count()
--      (migration 087, correct: RECOMPUTE count(confirmed) from scratch), and
--   2. update_participant_count -> update_session_participant_count()
--      (a LEGACY, live-only hand-rolled +/-1 DELTA trigger, never in the repo —
--      pure schema drift from a pre-087 schema).
-- Both are AFTER INSERT/UPDATE/DELETE FOR EACH ROW. Postgres fires same-timing
-- row triggers ALPHABETICALLY, so update_participant_count runs AFTER
-- trg_sync_session_participant_count: the recompute sets the true count, then
-- the delta applies a stale +/-1 on top.
--   - confirmed-row DELETE: recompute -> N, then N - 1  => N-1  (empty -> -1)
--   - confirmed INSERT:     recompute -> N, then N + 1  => N+1  (over-count,
--     masked only when an RPC recomputes as its final statement)
--
-- FIX: drop the legacy delta trigger and its function so the single recompute
-- trigger is the source of truth, then backfill any rows that already drifted.
--
-- ROLLING-SAFE: dropping the redundant delta trigger is safe with any client
-- version — nothing depends on it, and the recompute trigger remains and is
-- authoritative. The recompute function/trigger is re-asserted (CREATE OR
-- REPLACE, idempotent) so this migration guarantees the correct end state on
-- its own, even on a DB where 087 somehow never landed.

-- 1. Remove the legacy delta trigger + function (the drift source).
DROP TRIGGER IF EXISTS update_participant_count ON public.session_participants;
DROP FUNCTION IF EXISTS public.update_session_participant_count();

-- 2. Re-assert the authoritative recompute (identical to migration 087).
CREATE OR REPLACE FUNCTION public.sync_session_participant_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_session_id := OLD.session_id;
  ELSE
    v_session_id := NEW.session_id;
  END IF;

  UPDATE public.sessions
  SET current_participants = (
    SELECT count(*) FROM public.session_participants
    WHERE session_id = v_session_id AND status = 'confirmed'
  )
  WHERE id = v_session_id;

  -- An UPDATE that moved a participant between sessions must also
  -- recount the session they left.
  IF TG_OP = 'UPDATE' AND OLD.session_id IS DISTINCT FROM NEW.session_id THEN
    UPDATE public.sessions
    SET current_participants = (
      SELECT count(*) FROM public.session_participants
      WHERE session_id = OLD.session_id AND status = 'confirmed'
    )
    WHERE id = OLD.session_id;
  END IF;

  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_session_participant_count ON public.session_participants;
CREATE TRIGGER trg_sync_session_participant_count
AFTER INSERT OR UPDATE OR DELETE ON public.session_participants
FOR EACH ROW EXECUTE FUNCTION public.sync_session_participant_count();

-- 3. One-time backfill: correct every session whose cached count drifted under
-- the double-trigger regime (e.g. the -1 session). Safe — recompute from truth.
UPDATE public.sessions s
SET current_participants = (
  SELECT count(*) FROM public.session_participants sp
  WHERE sp.session_id = s.id AND sp.status = 'confirmed'
)
WHERE current_participants IS DISTINCT FROM (
  SELECT count(*) FROM public.session_participants sp
  WHERE sp.session_id = s.id AND sp.status = 'confirmed'
);

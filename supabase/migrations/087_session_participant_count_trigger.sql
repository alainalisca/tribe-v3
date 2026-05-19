-- 087_session_participant_count_trigger.sql
-- Tier-3 audit fix (Crit-3): sessions.current_participants split-brain.
--
-- current_participants was kept in sync only by SOME mutation paths:
--   - join_session RPC (042) recomputes correctly
--   - finalize_payment RPC (047/086) recomputes correctly
--   - waitlist accept: never incremented it at all
--   - leave / kick / guest-add: hand-rolled non-atomic +/-1, and
--     removeUserFromSession decremented even when the user was never a
--     confirmed participant
-- so the cached count drifted from the real confirmed-participant
-- count, producing wrong "X / Y spots", false "Session is full", and
-- ghost capacity.
--
-- Fix (same approach migration 079 took for the clients counters, and
-- exactly what the audit recommended): make the count a single source
-- of truth via an AFTER trigger that RECOMPUTES from the actual rows
-- on every session_participants write. Recompute-from-scratch (vs
-- +/-1 deltas) stays correct under every edit path — including the
-- hand-rolled ones, whose now-redundant +/-1 writes are simply
-- overwritten by the authoritative recompute in the same transaction.
--
-- 'confirmed' is the seat-consuming status (matches join_session and
-- finalize_payment); 'pending' requests do not consume a seat.

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

-- One-time backfill: correct every session whose cached count already
-- drifted under the old hand-rolled paths. Safe — recompute from truth.
UPDATE public.sessions s
SET current_participants = (
  SELECT count(*) FROM public.session_participants sp
  WHERE sp.session_id = s.id AND sp.status = 'confirmed'
);

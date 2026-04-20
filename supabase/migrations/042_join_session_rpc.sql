-- 042_join_session_rpc.sql
-- LOGIC-01: lib/sessions.ts:joinSession() calls rpc('join_session', ...) as
-- its only path after migration 042 landed. This RPC is the atomic
-- capacity-check-and-insert that replaces the racy client-side fallback.
--
-- Depends on migration 041 (unique constraint) for the ON CONFLICT path.
--
-- NOTE: `CREATE OR REPLACE FUNCTION` in Postgres cannot change the return
-- type of an existing function. Some deployments had a pre-existing
-- `join_session` with a different signature — dropping first guarantees we
-- land on the jsonb-returning version regardless of prior state.
DROP FUNCTION IF EXISTS join_session(uuid, uuid, text);

CREATE OR REPLACE FUNCTION join_session(
  p_session_id uuid,
  p_user_id uuid,
  p_status text DEFAULT 'confirmed'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_participants int;
  v_status text;
  v_current_count int;
  v_participant_id uuid;
BEGIN
  -- Lock the session row so parallel joins serialize.
  SELECT max_participants, status
    INTO v_max_participants, v_status
    FROM sessions
    WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_cancelled');
  END IF;

  -- Count confirmed seats AFTER the lock. Pending requests don't consume a seat.
  SELECT count(*) INTO v_current_count
    FROM session_participants
    WHERE session_id = p_session_id
      AND status = 'confirmed';

  IF p_status = 'confirmed' AND v_current_count >= v_max_participants THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is full');
  END IF;

  -- Idempotent insert. If the user already has a row, surface success without
  -- changing status so a retry doesn't demote a confirmed user to pending.
  INSERT INTO session_participants (session_id, user_id, status)
    VALUES (p_session_id, p_user_id, p_status)
    ON CONFLICT (session_id, user_id) DO NOTHING
    RETURNING id INTO v_participant_id;

  IF v_participant_id IS NULL THEN
    -- They were already in. Return the existing status.
    SELECT id INTO v_participant_id
      FROM session_participants
      WHERE session_id = p_session_id AND user_id = p_user_id;
  END IF;

  -- Keep sessions.current_participants in sync for listing queries.
  UPDATE sessions
  SET current_participants = (
    SELECT count(*) FROM session_participants
    WHERE session_id = p_session_id AND status = 'confirmed'
  )
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'participant_id', v_participant_id,
    'status', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION join_session(uuid, uuid, text) TO authenticated;

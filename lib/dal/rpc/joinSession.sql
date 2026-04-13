-- Run this in Supabase SQL Editor to create atomic join_session RPC.
-- This prevents race conditions on capacity checks.
CREATE OR REPLACE FUNCTION join_session(
  p_session_id uuid,
  p_user_id uuid,
  p_status text DEFAULT 'confirmed'
)
RETURNS json AS $$
DECLARE
  v_max int;
  v_current int;
BEGIN
  -- Lock the session row to prevent concurrent joins
  SELECT max_participants INTO v_max
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_max IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session not found');
  END IF;

  -- Count current confirmed participants
  SELECT COUNT(*) INTO v_current
  FROM session_participants
  WHERE session_id = p_session_id AND status = 'confirmed';

  -- Check capacity
  IF v_max > 0 AND v_current >= v_max THEN
    RETURN json_build_object('success', false, 'error', 'Session is full');
  END IF;

  -- Insert participant (upsert to handle duplicates)
  INSERT INTO session_participants (session_id, user_id, status, joined_at)
  VALUES (p_session_id, p_user_id, p_status, now())
  ON CONFLICT (session_id, user_id) DO UPDATE SET status = p_status, joined_at = now();

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

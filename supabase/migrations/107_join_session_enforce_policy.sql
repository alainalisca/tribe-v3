-- 107_join_session_enforce_policy.sql
-- T-SEC1: make the join_session RPC the single authority on the join outcome.
--
-- Before: the RPC accepted a caller-supplied p_status and never read
-- join_policy. Enforcement lived only in the client (lib/sessions.ts), so a
-- direct RPC call could bypass it entirely — join an invite-only session with
-- no token, or skip curated/paid approval by asking for 'confirmed'.
--
-- After: the RPC derives the status from the session's OWN join_policy and
-- paid state, validates the invite token for invite-only sessions server-side,
-- and ignores any client-supplied status. The client can no longer be the only
-- gate. Every existing safeguard (row lock, capacity, duplicate ON CONFLICT,
-- current_participants recompute) is preserved.
--
-- LIVE VERIFICATION (T-SEC1): the deployed function body was diffed against
-- migration 042 before this change and confirmed byte-identical (no drift), so
-- this migration is a safe, scoped replacement of the known-good 042 body.
--
-- Signature change: p_status (text, trusted) is REPLACED by p_invite_token
-- (text, validated). Same (uuid, uuid, text) type slot, but the parameter NAME
-- changes, which CREATE OR REPLACE cannot do — so we DROP then CREATE. The
-- only caller is lib/sessions.ts, updated in the same PR.

DROP FUNCTION IF EXISTS public.join_session(uuid, uuid, text);

CREATE FUNCTION public.join_session(
  p_session_id uuid,
  p_user_id uuid,
  p_invite_token text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_participants int;
  v_status text;            -- session lifecycle status (active/cancelled)
  v_join_policy text;
  v_is_paid boolean;
  v_price_cents int;
  v_current_count int;
  v_participant_id uuid;
  v_effective_status text;  -- 'confirmed' | 'pending', derived server-side
  v_token_session uuid;
  v_token_expires timestamptz;
BEGIN
  -- Lock the session row so parallel joins serialize. Read the policy inputs
  -- in the same locked SELECT so the outcome is decided from server state.
  SELECT max_participants, status, join_policy, is_paid, price_cents
    INTO v_max_participants, v_status, v_join_policy, v_is_paid, v_price_cents
    FROM sessions
    WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_cancelled');
  END IF;

  -- SECURITY (T-SEC1): invite-only sessions require a valid, unexpired token
  -- for THIS session, validated here — not just in the client. Tokens are
  -- multi-use (T-INV1), so there is no single-use bookkeeping; a repeat join
  -- is caught by the ON CONFLICT idempotency below.
  IF v_join_policy = 'invite_only' THEN
    IF p_invite_token IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_only');
    END IF;

    SELECT session_id, expires_at
      INTO v_token_session, v_token_expires
      FROM invite_tokens
      WHERE token = p_invite_token;

    IF NOT FOUND OR v_token_session IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_invalid');
    END IF;

    IF v_token_expires IS NOT NULL AND v_token_expires < now() THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
    END IF;
  END IF;

  -- SECURITY (T-SEC1): derive the outcome from the session's own policy, never
  -- from client input.
  --   curated           -> pending (host approval required)
  --   paid (price > 0)   -> pending (awaiting off-platform payment, T-PAY1)
  --   open / invite-only -> confirmed (unless also paid)
  IF v_join_policy = 'curated'
     OR (COALESCE(v_is_paid, false) AND COALESCE(v_price_cents, 0) > 0) THEN
    v_effective_status := 'pending';
  ELSE
    v_effective_status := 'confirmed';
  END IF;

  -- Count confirmed seats AFTER the lock. Pending requests don't consume a seat.
  SELECT count(*) INTO v_current_count
    FROM session_participants
    WHERE session_id = p_session_id
      AND status = 'confirmed';

  IF v_effective_status = 'confirmed' AND v_current_count >= v_max_participants THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is full');
  END IF;

  -- Idempotent insert. If the user already has a row, surface success without
  -- changing status so a retry doesn't demote a confirmed user to pending.
  INSERT INTO session_participants (session_id, user_id, status)
    VALUES (p_session_id, p_user_id, v_effective_status)
    ON CONFLICT (session_id, user_id) DO NOTHING
    RETURNING id INTO v_participant_id;

  IF v_participant_id IS NULL THEN
    -- They were already in. Return the existing row's real status.
    SELECT id, status INTO v_participant_id, v_effective_status
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
    'status', v_effective_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_session(uuid, uuid, text) TO authenticated;

-- 119_join_session_enforce_policy_and_owner.sql
-- T-SEC1 (rebuilt): make the join_session RPC the single, server-side authority
-- on the join outcome AND enforce that a user can only join THEMSELVES.
--
-- Supersedes the never-merged PR #77 / migration 107 (closed). Reuses 107's
-- policy-derivation + token-validation body verbatim, and adds the owner check
-- 107 lacked (p_user_id was trusted blindly, so the SECURITY DEFINER RPC could
-- add an ARBITRARY user to a session).
--
-- GATE 1 of the rolling-safe sequence — ADDITIVE, removes nothing:
--   * keeps p_status as an accepted-but-IGNORED compat param (the CURRENT live
--     client still sends it), and adds p_invite_token DEFAULT NULL.
--   * PostgREST resolves the single join_session unambiguously by named args.
-- Gate 2 (client: pass p_invite_token, move training-now off direct insert) and
-- Gate 3 (remove the direct session_participants INSERT RLS) follow separately.
--
-- Baseline note: the deployed body is still migration 042 (no drift; 087/098
-- only reference join_session). This is a scoped replacement of that known body.
--
-- The parameter NAME set changes, which CREATE OR REPLACE cannot do, so DROP the
-- old shapes then CREATE the new (uuid, uuid, text, text) one.

DROP FUNCTION IF EXISTS public.join_session(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.join_session(uuid, uuid, text, text);

CREATE FUNCTION public.join_session(
  p_session_id uuid,
  p_user_id uuid,
  -- DEPRECATED (T-SEC1): accepted but IGNORED. Kept only so the pre-T-SEC1
  -- client (which still sends p_status) resolves during a rolling deploy.
  -- A later cleanup migration will drop this. Status is derived below.
  p_status text DEFAULT NULL,
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
  -- SECURITY (T-SEC1): a user may only join THEMSELVES. Reject an anonymous
  -- caller, and reject any p_user_id that is not the authenticated caller. This
  -- closes the force-join-arbitrary-user hole — the RPC is SECURITY DEFINER and
  -- previously trusted the caller-supplied p_user_id with no check.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  -- p_status is intentionally never read: the join outcome is derived below
  -- from the session's own policy. It exists only for rolling-deploy
  -- compatibility with the pre-T-SEC1 client (see header).

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

-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon on new public
-- functions, so revoke it explicitly — join_session is for authenticated joins
-- only (it fails closed for a null auth.uid(), but anon should not hold the
-- grant). The guest door, join_session_as_guest, intentionally keeps anon below.
REVOKE EXECUTE ON FUNCTION public.join_session(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_session(uuid, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- join_session_as_guest — the guest door (T-SEC1 Gate 1, additive).
-- ---------------------------------------------------------------------------
-- Guests have no auth.uid(), so they cannot use join_session (which now requires
-- p_user_id = auth.uid()). The INVITE TOKEN is the credential: a valid, unexpired
-- token for THIS session authorizes writing a guest row. This is strictly safer
-- than today's blanket guest-INSERT RLS (which validates nothing) and becomes the
-- ONLY guest write path once Gate 3 removes the direct-insert policies.
--
-- Granted to anon (guests are unauthenticated) AND authenticated — the token, not
-- the role, is the gate. No dedup: a guest has no user_id, matching current
-- behavior (a later ticket may add a (session_id, guest_phone) constraint).

CREATE OR REPLACE FUNCTION public.join_session_as_guest(
  p_session_id uuid,
  p_invite_token text,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int; v_status text; v_join_policy text; v_is_paid boolean; v_price int;
  v_current int; v_tok_session uuid; v_tok_expires timestamptz;
  v_effective_status text; v_participant_id uuid;
BEGIN
  -- No auth.uid() for guests: require the token + minimal guest details.
  IF p_invite_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_required');
  END IF;
  IF COALESCE(btrim(p_guest_name), '') = '' OR COALESCE(btrim(p_guest_phone), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'guest_details_required');
  END IF;

  -- Lock the session; read policy inputs from server state.
  SELECT max_participants, status, join_policy, is_paid, price_cents
    INTO v_max, v_status, v_join_policy, v_is_paid, v_price
    FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_cancelled');
  END IF;

  -- Token must exist, match THIS session, and be unexpired (server-side).
  SELECT session_id, expires_at INTO v_tok_session, v_tok_expires
    FROM invite_tokens WHERE token = p_invite_token;
  IF NOT FOUND OR v_tok_session IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_invalid');
  END IF;
  IF v_tok_expires IS NOT NULL AND v_tok_expires < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
  END IF;

  -- Same server-side derivation as join_session.
  IF v_join_policy = 'curated' OR (COALESCE(v_is_paid, false) AND COALESCE(v_price, 0) > 0) THEN
    v_effective_status := 'pending';
  ELSE
    v_effective_status := 'confirmed';
  END IF;

  SELECT count(*) INTO v_current FROM session_participants
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_effective_status = 'confirmed' AND v_current >= v_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is full');
  END IF;

  INSERT INTO session_participants (session_id, user_id, is_guest, guest_name, guest_phone, guest_email, status)
    VALUES (p_session_id, NULL, true, btrim(p_guest_name), btrim(p_guest_phone), p_guest_email, v_effective_status)
    RETURNING id INTO v_participant_id;

  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id, 'status', v_effective_status);
END $$;

REVOKE ALL ON FUNCTION public.join_session_as_guest(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_session_as_guest(uuid, text, text, text, text) TO anon, authenticated;

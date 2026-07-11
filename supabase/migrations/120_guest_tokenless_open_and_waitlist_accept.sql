-- 120_guest_tokenless_open_and_waitlist_accept.sql
-- T-SEC1 Gate 2.5b. Two changes, both additive/replacing-in-place:
--
--   1. Amend join_session_as_guest (migration 119) so the invite token is
--      OPTIONAL: a token authorizes a guest on ANY policy; WITHOUT a token a
--      guest may join ONLY an open session. invite_only / curated with no token
--      fail closed to 'invite_required'. This preserves today's in-app guest
--      modal (open sessions, no token) while closing the guest bypass on
--      curated/invite_only. Also RETURNs guest_token — the shipped 119 version
--      omitted it, which silently breaks guest-leave once the client switches
--      onto the RPC (the leave flow reads the stored guest_token).
--
--   2. New accept_waitlist_offer RPC — the reserved-seat door. A waitlist offer
--      is the authorization; the seat was already reserved, so it inserts as
--      confirmed WITHOUT a capacity check. Kept OUT of join_session on purpose:
--      a capacity-SKIP branch inside the capacity-ENFORCING function would make
--      any bug there a capacity bypass on every join. Contained here instead.
--
-- Gate 3 (remove the direct session_participants INSERT RLS) still follows
-- separately, after a third writer sweep.

-- ---------------------------------------------------------------------------
-- 1. join_session_as_guest — optional token + guest_token return
-- ---------------------------------------------------------------------------
-- Same signature as 119, so CREATE OR REPLACE (grants persist; re-asserted below).

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
  v_effective_status text; v_participant_id uuid; v_guest_token uuid;
BEGIN
  -- Minimal guest details are always required.
  IF COALESCE(btrim(p_guest_name), '') = '' OR COALESCE(btrim(p_guest_phone), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'guest_details_required');
  END IF;

  -- Lock the session; read policy inputs from server state (v_join_policy is
  -- needed by the authorization branch below).
  SELECT max_participants, status, join_policy, is_paid, price_cents
    INTO v_max, v_status, v_join_policy, v_is_paid, v_price
    FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_cancelled');
  END IF;

  -- AUTHORIZATION (T-SEC1 Gate 2.5b): a valid invite token authorizes a guest on
  -- ANY policy. WITHOUT a token, a guest may join ONLY an open session. Anything
  -- else fails closed. Curated/invite_only without a token is rejected — closing
  -- the guest bypass that the permissive direct-insert RLS allowed.
  IF p_invite_token IS NOT NULL THEN
    SELECT session_id, expires_at INTO v_tok_session, v_tok_expires
      FROM invite_tokens WHERE token = p_invite_token;
    IF NOT FOUND OR v_tok_session IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_invalid');
    END IF;
    IF v_tok_expires IS NOT NULL AND v_tok_expires < now() THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
    END IF;
  ELSIF v_join_policy IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_required');
  END IF;

  -- Same server-side status derivation as join_session.
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

  -- guest_token has a column DEFAULT gen_random_uuid(); RETURN it so the client
  -- can store it for the guest-leave flow.
  INSERT INTO session_participants (session_id, user_id, is_guest, guest_name, guest_phone, guest_email, status)
    VALUES (p_session_id, NULL, true, btrim(p_guest_name), btrim(p_guest_phone), p_guest_email, v_effective_status)
    RETURNING id, guest_token INTO v_participant_id, v_guest_token;

  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'participant_id', v_participant_id,
    'guest_token', v_guest_token,
    'status', v_effective_status
  );
END $$;

-- Grants persist across CREATE OR REPLACE; re-assert to be explicit. The token,
-- not the role, is the gate, so anon keeps EXECUTE (guests are unauthenticated).
REVOKE ALL ON FUNCTION public.join_session_as_guest(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_session_as_guest(uuid, text, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. accept_waitlist_offer — the reserved-seat door
-- ---------------------------------------------------------------------------
-- Authenticated user accepts THEIR OWN waitlist offer. The offer is the
-- authorization; the seat was reserved, so the insert SKIPS the capacity check.
-- All writes (participant insert, offer -> accepted, count recompute) run in one
-- transaction, fixing the previous non-atomic read+insert+update in the DAL.

CREATE FUNCTION public.accept_waitlist_offer(
  p_session_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer_id uuid;
  v_offer_status text;
  v_offer_expires timestamptz;
  v_participant_id uuid;
BEGIN
  -- Only the offer's owner may accept it. Reject anon and any spoofed p_user_id.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  -- Lock the waitlist row for this user+session (UNIQUE (session_id, user_id)).
  SELECT id, status, offer_expires_at
    INTO v_offer_id, v_offer_status, v_offer_expires
    FROM session_waitlist
    WHERE session_id = p_session_id AND user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_offer');
  END IF;
  IF v_offer_status IS DISTINCT FROM 'offered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_offer');
  END IF;
  IF v_offer_expires IS NOT NULL AND v_offer_expires < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_expired');
  END IF;

  -- Reserved seat: insert as confirmed WITHOUT a capacity check. If a prior row
  -- exists (e.g. a cancelled participation), upgrade it to confirmed — accepting
  -- the offer means they are in.
  INSERT INTO session_participants (session_id, user_id, status)
    VALUES (p_session_id, p_user_id, 'confirmed')
    ON CONFLICT (session_id, user_id) DO UPDATE SET status = 'confirmed'
    RETURNING id INTO v_participant_id;

  -- Flip the offer to accepted (atomic with the insert above).
  UPDATE session_waitlist SET status = 'accepted' WHERE id = v_offer_id;

  -- Recompute confirmed count (may exceed max_participants — a reserved seat is
  -- an intentional overflow).
  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants
    WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id, 'status', 'confirmed');
END $$;

-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon on new public
-- functions — revoke it explicitly (the T-SEC3 lesson). Waitlist acceptance is
-- for the authenticated offer owner only; it fails closed for a null auth.uid(),
-- but anon should not hold the grant.
REVOKE EXECUTE ON FUNCTION public.accept_waitlist_offer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_waitlist_offer(uuid, uuid) TO authenticated;

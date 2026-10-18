-- 221_t_join1_guest_join_hardening.sql
--
-- T-JOIN1 Part B: a guest asks for a spot with name and WhatsApp only, so the
-- guest door has to hold on the server. NOT APPLIED when written (2026-10-18).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT CHANGES IN public.join_session_as_guest
-- ═══════════════════════════════════════════════════════════════════════════
--
--   1. The phone must be E.164 (+ and 8 to 15 digits), and a Colombian number
--      must be a mobile (+573 and 9 digits). Anything else: 'invalid_phone'.
--      The route normalises what the guest typed (lib/guestPhone.ts); this is
--      the database refusing anything that did not come through it.
--   2. One join per phone per session: a second guest row with the same phone
--      on the same session is refused with 'already_joined'. The check runs
--      after the session row is locked FOR UPDATE (as it already was), so two
--      simultaneous joins with one phone cannot both pass it.
--   3. EXECUTE is withdrawn from anon and authenticated and kept by
--      service_role only. Every guest join now goes through
--      /api/sessions/[id]/guest, which rate-limits 5 joins per IP per hour
--      (the database cannot see the visitor's IP) and calls this function with
--      the service role. A guest has no account, so nothing about identity is
--      lost by the function not running on the guest's own JWT.
--
-- Everything else in the body is 185's, unchanged: the invite rules
-- (addressed tokens refused, token-less guests only on open sessions), the
-- derived status (paid or curated: pending), capacity, the guest_token.
--
-- Old rows keep the phone as it was typed, so a legacy duplicate is not
-- detected; the rule holds for every join from 221 on.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ORDER: THE CODE FIRST, THEN THIS FILE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The reverse of the usual order. The code that calls this function through
-- the route works against 185's version and against this one. The code before
-- it calls the function from the browser as anon, which this file forbids. So
-- deploy the T-JOIN1 code, then apply 221; applied first, it would stop guest
-- joins until the deploy.

BEGIN;

-- Pre-flight (the capture rule, CLAUDE.md): replace only 185's version, or
-- this file's own on a re-run. Anything else means a later change this file
-- would silently revert.
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.join_session_as_guest(uuid, text, text, text, text)');
  IF v_src IS NULL OR length(v_src) < 1000 THEN
    RAISE EXCEPTION '221 ABORTED: could not read join_session_as_guest (% chars).', coalesce(length(v_src), 0);
  END IF;
  IF v_src !~ 'invite_not_for_you' OR v_src !~ 'v_tok_recipient IS NOT NULL' THEN
    RAISE EXCEPTION '221 ABORTED: join_session_as_guest is not 185''s version (the addressed-invite refusal is missing); a later change would be reverted.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.join_session_as_guest(p_session_id uuid, p_invite_token text, p_guest_name text, p_guest_phone text, p_guest_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max int; v_status text; v_join_policy text; v_is_paid boolean; v_price int;
  v_current int; v_tok_session uuid; v_tok_expires timestamptz;
  v_effective_status text; v_participant_id uuid; v_guest_token uuid;
  v_tok_recipient uuid; v_phone text;
BEGIN
  -- Minimal guest details are always required.
  IF COALESCE(btrim(p_guest_name), '') = '' OR COALESCE(btrim(p_guest_phone), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'guest_details_required');
  END IF;

  -- 221: E.164 only, and a Colombian number must be a mobile.
  v_phone := btrim(p_guest_phone);
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' OR (v_phone LIKE '+57%' AND v_phone !~ '^\+573[0-9]{9}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_phone');
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
    SELECT session_id, expires_at, recipient_id
      INTO v_tok_session, v_tok_expires, v_tok_recipient
      FROM invite_tokens WHERE token = p_invite_token;
    IF NOT FOUND OR v_tok_session IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_invalid');
    END IF;
    IF v_tok_expires IS NOT NULL AND v_tok_expires < now() THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
    END IF;
    -- 185: an ADDRESSED token cannot be accepted by a guest AT ALL. A guest is
    -- not signed into any account, so there is nothing to match the recipient
    -- against, and "cannot verify" must fail closed rather than open. Without
    -- this, the guest route is a complete bypass of the recipient check in
    -- join_session -- a gate on one path is not a gate.
    IF v_tok_recipient IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_not_for_you');
    END IF;
  ELSIF v_join_policy IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_required');
  END IF;

  -- 221: one join per phone per session. After the FOR UPDATE above, so two
  -- simultaneous joins with one phone are serialised on the session row.
  IF EXISTS (SELECT 1 FROM session_participants
              WHERE session_id = p_session_id AND is_guest AND guest_phone = v_phone) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_joined');
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
    VALUES (p_session_id, NULL, true, btrim(p_guest_name), v_phone, p_guest_email, v_effective_status)
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
END $function$;

REVOKE ALL ON FUNCTION public.join_session_as_guest(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_session_as_guest(uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_session_as_guest(uuid, text, text, text, text) TO service_role;

-- Post-flight: what the route and the guard rely on.
DO $$
DECLARE
  v_fn  oid := to_regprocedure('public.join_session_as_guest(uuid, text, text, text, text)');
  v_src text;
BEGIN
  SELECT pg_get_functiondef(v_fn) INTO v_src;
  IF v_src !~ 'invalid_phone' OR v_src !~ 'already_joined' OR v_src !~ 'invite_not_for_you' THEN
    RAISE EXCEPTION '221 ABORTED: the new body is missing the phone check, the dedupe or 185''s invite refusal.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '221 ABORTED: join_session_as_guest lost SECURITY DEFINER.';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '221 ABORTED: a client role can still call join_session_as_guest and skip the rate limit.';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '221 ABORTED: service_role cannot call join_session_as_guest; the guest route would fail.';
  END IF;
  RAISE NOTICE '221: guest joins are E.164, one per phone per session, server-only.';
END $$;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('221_t_join1_guest_join_hardening',
        'T-JOIN1 Part B: join_session_as_guest E.164 phone, one join per phone per session, service_role only (route rate-limits by IP)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

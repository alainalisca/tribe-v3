-- 185_invite_tokens_recipient_REHEARSAL.sql
--
-- Rehearsal for 185. Run in the Supabase SQL editor BEFORE 185 itself.
-- Everything is inside BEGIN ... ROLLBACK; production is not modified.
-- ONE result set of PASS/FAIL rows.
--
-- It APPLIES 185's column and BOTH replaced functions in-transaction, spliced
-- byte-identical from the migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PRESENCE BEFORE ABSENCE, ON BOTH PATHS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- What 185 adds is a REFUSAL. A refusal arm passes in three worlds: the check
-- works, the function refuses everyone, or nobody could join in the first
-- place. It cannot tell them apart alone.
--
-- So P1..P4 run first and prove joining still WORKS -- an ordinary open join,
-- a bearer-token join on an invite_only session, a bearer-token GUEST join,
-- and an ADDRESSED token used by its rightful recipient. Only then do R1 and
-- R2 mean anything.
--
-- P4 is the one most easily forgotten: without it, a function that refused
-- EVERY addressed token would pass P1-P3 and both refusal arms.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IT USES REAL USERS AND A THROWAWAY SESSION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- auth.uid() reads request.jwt.claims, so set_config makes each call answer as
-- a chosen user. The session and tokens are created INSIDE the transaction and
-- vanish with the ROLLBACK. Triggers that fire on insert are exercised exactly
-- as they would be in production, which is the point of doing it this way
-- rather than against fixtures.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- ↓↓↓ spliced verbatim from 185 ↓↓↓
ALTER TABLE public.invite_tokens
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.invite_tokens.recipient_id IS
  'The account this invite is addressed to. NULL means a bearer token (public '
  'share links, migration 141) and preserves pre-185 behaviour on both join '
  'paths. When set, only that account may join, and the guest path refuses it.';

CREATE INDEX IF NOT EXISTS invite_tokens_recipient_id_idx
  ON public.invite_tokens (recipient_id)
  WHERE recipient_id IS NOT NULL;

-- ── 2. join_session: an addressed token admits only its recipient ──────────
-- Live body, captured 2026-09-21. Added: v_token_recipient, its SELECT, and
-- the one IF below. Nothing else changed.
CREATE OR REPLACE FUNCTION public.join_session(p_session_id uuid, p_user_id uuid, p_status text DEFAULT NULL::text, p_invite_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_participants int;
  v_status text;
  v_join_policy text;
  v_is_paid boolean;
  v_price_cents int;
  v_current_count int;
  v_participant_id uuid;
  v_effective_status text;
  v_token_session uuid;
  v_token_expires timestamptz;
  v_token_recipient uuid;
BEGIN
  -- SECURITY (T-SEC1): a user may only join THEMSELVES. Reject anon + mismatched p_user_id.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT max_participants, status, join_policy, is_paid, price_cents
    INTO v_max_participants, v_status, v_join_policy, v_is_paid, v_price_cents
    FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_cancelled');
  END IF;

  -- invite_only: require a valid, unexpired token for THIS session (server-side).
  IF v_join_policy = 'invite_only' THEN
    IF p_invite_token IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_only');
    END IF;
    SELECT session_id, expires_at, recipient_id
      INTO v_token_session, v_token_expires, v_token_recipient
      FROM invite_tokens WHERE token = p_invite_token;
    IF NOT FOUND OR v_token_session IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_invalid');
    END IF;
    IF v_token_expires IS NOT NULL AND v_token_expires < now() THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
    END IF;
    -- 185: an ADDRESSED token admits only the account it names. NULL is a
    -- bearer token (public share links) and behaves exactly as before.
    IF v_token_recipient IS NOT NULL AND v_token_recipient IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'invite_not_for_you');
    END IF;
  END IF;

  -- Derive status from the session's own policy (never from client input).
  IF v_join_policy = 'curated'
     OR (COALESCE(v_is_paid, false) AND COALESCE(v_price_cents, 0) > 0) THEN
    v_effective_status := 'pending';
  ELSE
    v_effective_status := 'confirmed';
  END IF;

  SELECT count(*) INTO v_current_count
    FROM session_participants
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_effective_status = 'confirmed' AND v_current_count >= v_max_participants THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is full');
  END IF;

  INSERT INTO session_participants (session_id, user_id, status)
    VALUES (p_session_id, p_user_id, v_effective_status)
    ON CONFLICT (session_id, user_id) DO NOTHING
    RETURNING id INTO v_participant_id;

  IF v_participant_id IS NULL THEN
    SELECT id, status INTO v_participant_id, v_effective_status
      FROM session_participants
      WHERE session_id = p_session_id AND user_id = p_user_id;
  END IF;

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
$function$;

-- ── 3. join_session_as_guest: an addressed token is refused outright ───────
-- Live body, captured 2026-09-21. Added: v_tok_recipient, its SELECT, and the
-- one IF below. Nothing else changed.
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
  v_tok_recipient uuid;
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
END $function$;
-- ↑↑↑ end spliced block ↑↑↑

DO $outer$
DECLARE
  a_ok boolean := false; a_err text := '(never ran)';
  v_host uuid; v_recipient uuid; v_other uuid;
  v_open_session uuid; v_invite_session uuid;
  v_bearer text := 'reh_bearer_' || substr(md5(random()::text), 1, 20);
  v_addressed text := 'reh_addr_' || substr(md5(random()::text), 1, 20);
  r jsonb;
BEGIN

  -- ── A1: the body applied ─────────────────────────────────────────────────
  BEGIN
    a_ok := EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='invite_tokens'
                       AND column_name='recipient_id')
        AND (SELECT pg_get_functiondef(p.oid) ~ 'invite_not_for_you' FROM pg_proc p
              WHERE p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure)
        AND (SELECT pg_get_functiondef(p.oid) ~ 'invite_not_for_you' FROM pg_proc p
              WHERE p.oid = 'public.join_session_as_guest(uuid, text, text, text, text)'::regprocedure);
    a_err := CASE WHEN a_ok THEN '(none)' ELSE 'column or a function check missing after apply' END;
  EXCEPTION WHEN OTHERS THEN
    a_ok := false; a_err := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (1, 'A1 185 applies: column present and BOTH join paths enforce', a_err, a_ok);
  IF NOT a_ok THEN
    INSERT INTO reh_probe VALUES (99, 'REHEARSAL STOPPED', 'A1 failed', false);
    RETURN;
  END IF;

  -- ── Three live users ─────────────────────────────────────────────────────
  SELECT id INTO v_host FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
   ORDER BY id LIMIT 1;
  SELECT id INTO v_recipient FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
     AND id <> v_host ORDER BY id LIMIT 1;
  SELECT id INTO v_other FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
     AND id NOT IN (v_host, v_recipient) ORDER BY id LIMIT 1;

  IF v_other IS NULL THEN
    INSERT INTO reh_probe VALUES (98, 'NOT ENOUGH USERS',
      'need three distinct live users to play host, recipient and interloper', false);
    RETURN;
  END IF;

  -- ── Two throwaway sessions, rolled back with everything else ─────────────
  INSERT INTO public.sessions (creator_id, sport, title, date, start_time, duration,
                               location, max_participants, join_policy, status)
  VALUES (v_host, 'Running', 'REHEARSAL open', current_date + 7, '08:00', 60,
          'REHEARSAL', 20, 'open', 'active')
  RETURNING id INTO v_open_session;

  INSERT INTO public.sessions (creator_id, sport, title, date, start_time, duration,
                               location, max_participants, join_policy, status)
  VALUES (v_host, 'Running', 'REHEARSAL invite_only', current_date + 7, '09:00', 60,
          'REHEARSAL', 20, 'invite_only', 'active')
  RETURNING id INTO v_invite_session;

  INSERT INTO public.invite_tokens (session_id, token, created_by, recipient_id)
  VALUES (v_invite_session, v_bearer, v_host, NULL),
         (v_invite_session, v_addressed, v_host, v_recipient);

  -- ══ PRESENCE ARMS ════════════════════════════════════════════════════════

  -- P1: an ordinary open join, no token involved at all.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  r := public.join_session(v_open_session, v_other, NULL, NULL);
  INSERT INTO reh_probe VALUES
    (2, 'P1 PRESENCE: an ordinary open-session join still succeeds',
     'result=' || r::text, (r->>'success')::boolean IS TRUE);

  -- P2: a BEARER token (recipient_id NULL) on an invite_only session. This is
  -- the public-share-link path and must be untouched by 185.
  r := public.join_session(v_invite_session, v_other, NULL, v_bearer);
  INSERT INTO reh_probe VALUES
    (3, 'P2 PRESENCE: a bearer token still admits any signed-in user (share links)',
     'result=' || r::text, (r->>'success')::boolean IS TRUE);

  -- P3: a BEARER token still admits a GUEST. Guests have no account, and the
  -- share-link flow depends on this.
  r := public.join_session_as_guest(v_invite_session, v_bearer, 'REHEARSAL Guest', '+570000000');
  INSERT INTO reh_probe VALUES
    (4, 'P3 PRESENCE: a bearer token still admits a GUEST',
     'result=' || r::text, (r->>'success')::boolean IS TRUE);

  -- P4: THE ARM MOST EASILY FORGOTTEN. An ADDRESSED token must still work for
  -- the person it names. Without this, a function refusing every addressed
  -- token would pass P1-P3 and both refusal arms below.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recipient)::text, true);
  r := public.join_session(v_invite_session, v_recipient, NULL, v_addressed);
  INSERT INTO reh_probe VALUES
    (5, 'P4 PRESENCE: an ADDRESSED token admits the account it names',
     'result=' || r::text, (r->>'success')::boolean IS TRUE);

  -- ══ REFUSAL ARMS ═════════════════════════════════════════════════════════

  -- R1: the wrong signed-in account.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  r := public.join_session(v_invite_session, v_other, NULL, v_addressed);
  INSERT INTO reh_probe VALUES
    (6, 'R1 REFUSAL: an addressed token is refused for a DIFFERENT account',
     'result=' || r::text,
     (r->>'success')::boolean IS FALSE AND r->>'error' = 'invite_not_for_you');

  -- R2: the guest route, which is the bypass. A guest is signed into nothing,
  -- so the recipient cannot be verified and it must fail closed.
  r := public.join_session_as_guest(v_invite_session, v_addressed, 'REHEARSAL Guest2', '+570000001');
  INSERT INTO reh_probe VALUES
    (7, 'R2 REFUSAL: an addressed token is refused on the GUEST path (the bypass)',
     'result=' || r::text,
     (r->>'success')::boolean IS FALSE AND r->>'error' = 'invite_not_for_you');

  -- R3: the refusal must not be a blanket one. Asserted by re-checking that the
  -- bearer token still works AFTER the refusals, on the same session, so a
  -- function that started refusing everything cannot hide behind ordering.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host)::text, true);
  r := public.join_session(v_invite_session, v_host, NULL, v_bearer);
  INSERT INTO reh_probe VALUES
    (8, 'R3 the refusal is targeted: a bearer token still works after the refusals',
     'result=' || r::text, (r->>'success')::boolean IS TRUE);

END $outer$;

-- The one result set. Every row must read PASS. 8 of 8.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

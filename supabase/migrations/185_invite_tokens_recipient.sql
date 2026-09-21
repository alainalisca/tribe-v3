-- 185_invite_tokens_recipient.sql
--
-- An invite becomes ADDRESSED rather than bearer.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT A TOKEN MEANS TODAY, AND WHY THAT IS NOT ENOUGH
-- ═══════════════════════════════════════════════════════════════════════════
--
-- invite_tokens has id, session_id, token, created_by, created_at, expires_at.
-- It records who MINTED a token and for which session -- never for whom. So:
--
--   * you cannot tell whether an invite was accepted by the intended person or
--     by anyone they forwarded it to
--   * you cannot revoke one person's invite without invalidating the others
--   * you cannot answer "has this athlete already been invited", which the
--     per-instructor quota design depends on
--
-- recipient_id is NULLABLE and that is load-bearing. Migration 141 widened this
-- table to serve PUBLIC SHARE LINKS, which have no recipient by definition.
-- NULL keeps today's bearer behaviour exactly, on both join paths.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BOTH WRITE PATHS, BECAUSE A GATE ON ONE PATH IS NOT A GATE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- join_session_as_guest ALSO accepts an invite token (migration 120), and a
-- guest has no user id -- so an addressed token has nothing to match against
-- there. Enforcing only in join_session would be bypassable by taking the
-- guest route.
--
-- That is the T-SEC1 shape exactly: join_session once never checked
-- join_policy, so a direct RPC call joined private sessions while the UI
-- looked correct. A check in one path and not its sibling is not a check.
--
-- DECIDED: the guest path REFUSES an addressed token outright. An invite
-- addressed to a specific account cannot be accepted by someone not signed
-- into it, and a guest is by definition not signed into anything.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE BODIES BELOW ARE THE LIVE ONES, CAPTURED, NOT THE REPO'S
-- ═══════════════════════════════════════════════════════════════════════════
--
-- capture_join_session_live.sql reported matches_repo_marker = FALSE for
-- join_session. The live body is a COMPRESSED variant of migration 119 -- same
-- logic, far terser comments. Writing this migration from 119 would have
-- replaced the running function with different text.
--
-- This repository has been bitten by repo-vs-live drift three times before:
-- protect_verified_instructor is live and in no migration (177 captures it),
-- invite_tokens was live with no repo record until 131, and users has six live
-- policies against two in the repo. Between them these two functions gate every
-- join in the app, for accounts and for guests.
--
-- So each body below is pg_get_functiondef output from production, with the
-- recipient check added and NOTHING else touched.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DOES NOT DO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- validate_invite_token (the READ path, /invite/[token]) is NOT changed here.
-- It was in the plan, but its live body was not captured, and rewriting a third
-- function from a possibly-stale repo file is the mistake this migration's
-- header is about.
--
-- The consequence is a UX one, not a security one: a signed-in user who is not
-- the recipient sees the invite page normally and is refused at JOIN time with
-- invite_not_for_you. It fails closed. Making the page say so up front needs
-- its own capture and its own migration.

-- ── 1. The column ──────────────────────────────────────────────────────────
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

-- ── 4. Guards ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col       boolean;
  v_js_src    text;
  v_guest_src text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='invite_tokens'
       AND column_name='recipient_id' AND data_type='uuid'
  ) INTO v_col;

  IF NOT v_col THEN
    RAISE EXCEPTION '185 ABORTED: invite_tokens.recipient_id is missing or not uuid.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_js_src
    FROM pg_proc p WHERE p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure;
  SELECT pg_get_functiondef(p.oid) INTO v_guest_src
    FROM pg_proc p
   WHERE p.oid = 'public.join_session_as_guest(uuid, text, text, text, text)'::regprocedure;

  -- NON-VACUITY FIRST. Every assertion below is true of an empty string, which
  -- is how a guard reports green about a function it never read.
  IF v_js_src IS NULL OR length(v_js_src) < 1000
     OR v_guest_src IS NULL OR length(v_guest_src) < 1000 THEN
    RAISE EXCEPTION
      '185 ABORTED: could not read one of the join functions (join_session=% chars, '
      'guest=% chars), so the checks below would pass vacuously.',
      coalesce(length(v_js_src), 0), coalesce(length(v_guest_src), 0);
  END IF;

  -- BOTH paths, named separately. A gate on one path is not a gate: this is the
  -- T-SEC1 shape, where join_session never checked join_policy while the UI
  -- looked correct.
  IF v_js_src !~ 'invite_not_for_you' THEN
    RAISE EXCEPTION
      '185 ABORTED: join_session does not refuse a mismatched recipient. An '
      'addressed invite would be accepted by anyone holding the token.';
  END IF;

  IF v_guest_src !~ 'invite_not_for_you' THEN
    RAISE EXCEPTION
      '185 ABORTED: join_session_as_guest does not refuse an addressed token. '
      'A guest is signed into no account, so the recipient cannot be verified '
      'there -- and the guest route would be a complete bypass of the check in '
      'join_session.';
  END IF;

  -- The NULL case must stay permissive, or every public share link breaks. A
  -- guard that only asserted the refusal would be satisfied by a function that
  -- refuses EVERYTHING.
  IF v_js_src !~ 'v_token_recipient IS NOT NULL' THEN
    RAISE EXCEPTION
      '185 ABORTED: join_session does not guard the refusal on recipient_id '
      'being NON-NULL. A bearer token (public share link) must still work.';
  END IF;

  IF v_guest_src !~ 'v_tok_recipient IS NOT NULL' THEN
    RAISE EXCEPTION
      '185 ABORTED: join_session_as_guest does not guard the refusal on '
      'recipient_id being NON-NULL. Public share links must still admit guests.';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p
           WHERE p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure)
     OR NOT (SELECT p.prosecdef FROM pg_proc p
              WHERE p.oid = 'public.join_session_as_guest(uuid, text, text, text, text)'::regprocedure) THEN
    RAISE EXCEPTION '185 ABORTED: a join function lost SECURITY DEFINER.';
  END IF;

  RAISE NOTICE '185: invites are addressable; both join paths enforce it.';
END $$;

-- ── 5. Record this migration as applied (convention from 184) ──────────────
-- DO NOTHING, not DO UPDATE: these files are re-run, and the FIRST run is the
-- time that answers "when did this reach production".
INSERT INTO public.migrations_applied (migration, note)
VALUES ('185_invite_tokens_recipient',
        'addressed invites; bodies written from a live capture, not the repo -- '
        'join_session had drifted from migration 119')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invite_tokens' AND column_name='recipient_id')
                                                                          AS recipient_id_type,
  (SELECT count(*) FROM public.invite_tokens WHERE recipient_id IS NOT NULL)
                                                                          AS addressed_tokens,
  (SELECT count(*) FROM public.invite_tokens WHERE recipient_id IS NULL)
                                                                          AS bearer_tokens,
  (SELECT pg_get_functiondef(p.oid) ~ 'invite_not_for_you' FROM pg_proc p
    WHERE p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure)
                                                                          AS join_session_enforces_ok,
  (SELECT pg_get_functiondef(p.oid) ~ 'invite_not_for_you' FROM pg_proc p
    WHERE p.oid = 'public.join_session_as_guest(uuid, text, text, text, text)'::regprocedure)
                                                                          AS guest_path_enforces_ok,
  (SELECT pg_get_functiondef(p.oid) ~ 'v_token_recipient IS NOT NULL' FROM pg_proc p
    WHERE p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure)
                                                                          AS bearer_tokens_still_work_ok,
  (SELECT applied_at FROM public.migrations_applied WHERE migration = '185_invite_tokens_recipient')
                                                                          AS recorded_at;

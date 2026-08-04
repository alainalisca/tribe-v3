-- 141_tc1_gate4_widen_invite_mint.sql
--
-- T-C1 Gate 4 (decision D7 = Option B): the session creator AND confirmed
-- participants may mint a session invite. Three additive changes, one
-- transaction:
--
--   1. create_session_invite: widen the authorization check from creator-only
--      to creator-or-confirmed-participant. Everything else byte-identical.
--   2. invite_tokens INSERT policy: same widening, renamed to match. Both
--      production mints bypass RLS, so this governs direct PostgREST only.
--   3. validate_invite_token: add creator_id to the returned session object.
--      Gate 3 dependency — the guest confirmation email needs the HOST's
--      identity, and created_by is the INVITER (9 of 31 live tokens were
--      already minted by non-creators via /api/invites/session).
--
-- Live-state provenance (verified 2026-08-03 via read-only catalog queries):
-- the function bodies below are the verbatim pg_get_functiondef() output from
-- production with ONLY the stated change applied. session_participants.status
-- has exactly two live values ('confirmed' 79, 'pending' 6).
--
-- ─────────────────────────────────────────────────────────────────────────
-- REHEARSAL FIRST. Before applying, run the companion file
--
--     141_tc1_gate4_widen_invite_mint.REHEARSAL.sql
--
-- in the Supabase SQL Editor. It is byte-identical to this file except its
-- final COMMIT; is ROLLBACK;, so it exercises the preflight, all three
-- changes, and the postflight, then undoes everything — one paste, one
-- submission, one atomic transaction. Never type BEGIN or ROLLBACK as
-- separate submissions: the SQL Editor wraps each submission in its own
-- implicit transaction, so a BEGIN sent alone does not span the next paste,
-- and an operator can commit while believing they rolled back. Whole file in,
-- one run, done.
--
-- The real apply is then a single paste of THIS file, unedited.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- PREFLIGHT: fail loudly if live state differs from what was mapped. A drifted
-- function or an already-renamed policy means this file was written against
-- stale state — stop before changing anything. Definition checks compare with
-- all whitespace stripped, so reformatting cannot produce false drift reports.
DO $$
DECLARE v_def text;
BEGIN
  IF to_regprocedure('public.create_session_invite(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: create_session_invite(uuid) not found';
  END IF;
  v_def := regexp_replace(
    pg_get_functiondef('public.create_session_invite(uuid)'::regprocedure), '\s', '', 'g');
  IF v_def NOT LIKE '%creator_id=auth.uid()%' THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: create_session_invite does not contain the expected creator check; live state has drifted';
  END IF;
  IF v_def LIKE '%session_participants%' THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: create_session_invite already references session_participants; migration appears to be applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invite_tokens'
      AND policyname = 'Session creators can create invite tokens' AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: expected INSERT policy "Session creators can create invite tokens" not found on invite_tokens';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'invite_tokens') <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: invite_tokens has a policy beyond the one this file expects; re-map before applying';
  END IF;

  IF to_regprocedure('public.validate_invite_token(text)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: validate_invite_token(text) not found';
  END IF;
  IF regexp_replace(
       pg_get_functiondef('public.validate_invite_token(text)'::regprocedure), '\s', '', 'g')
     LIKE '%''creator_id''%' THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: validate_invite_token already projects creator_id; migration appears to be applied';
  END IF;
END $$;

-- ── 1. create_session_invite: creator OR confirmed participant ──────────────
-- Verbatim live definition; ONLY the authorization check is replaced. The
-- explicit auth.uid() IS NULL branch keeps anon/no-JWT callers out even
-- though EXECUTE is already revoked from anon (defense in depth, and it makes
-- the NOT EXISTS pair below safe: with a NULL uid both would be false-y in a
-- way that must still reject).
CREATE OR REPLACE FUNCTION public.create_session_invite(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized to create an invite for this session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sessions s
     WHERE s.id = p_session_id AND s.creator_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.session_participants sp
     WHERE sp.session_id = p_session_id
       AND sp.user_id = auth.uid()
       AND sp.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'not authorized to create an invite for this session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_token := replace(gen_random_uuid()::text, '-', '');   -- 32 hex chars, crypto-secure
  INSERT INTO public.invite_tokens (session_id, token, created_by) VALUES (p_session_id, v_token, auth.uid());
  RETURN v_token;
END;
$function$;

-- ── 2. invite_tokens INSERT policy: same widening, renamed ──────────────────
-- NOTE: both production mints BYPASS RLS — create_session_invite runs as
-- SECURITY DEFINER (owner), and /api/invites/session inserts via the service
-- role. This policy therefore governs ONLY a direct PostgREST insert by an
-- authenticated user. It is widened anyway so the three gates (RPC, route,
-- policy) state the same rule and an auditor reading pg_policies sees the
-- real Option B semantics, not a stale creator-only claim.
-- The participant EXISTS runs under the caller's own RLS on
-- session_participants; own-row visibility (migration 127/129 model) is
-- exactly what the predicate needs.
DROP POLICY "Session creators can create invite tokens" ON public.invite_tokens;

CREATE POLICY "Creator or confirmed participant can create invite tokens"
  ON public.invite_tokens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
       WHERE s.id = invite_tokens.session_id AND s.creator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM session_participants sp
       WHERE sp.session_id = invite_tokens.session_id
         AND sp.user_id = auth.uid()
         AND sp.status = 'confirmed'
    )
  );

-- ── 3. validate_invite_token: expose the session HOST (creator_id) ──────────
-- Verbatim live definition; the ONLY change is the added 'creator_id' field in
-- the session jsonb. created_by (top level) remains the INVITER who minted the
-- token; creator_id is the session HOST. Gate 3's guest confirmation email
-- must use creator_id for hostName — under Option B they differ routinely.
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.invite_tokens%ROWTYPE; v_session jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO v_row FROM public.invite_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired', 'session_id', v_row.session_id);
  END IF;
  SELECT jsonb_build_object(
    'id', s.id, 'creator_id', s.creator_id, 'sport', s.sport, 'title', s.title, 'date', s.date,
    'start_time', s.start_time, 'duration', s.duration, 'description', s.description,
    'location', s.location,
    'location_lat', round(s.location_lat::numeric, 3),
    'location_lng', round(s.location_lng::numeric, 3),
    'is_paid', s.is_paid, 'price_cents', s.price_cents, 'currency', s.currency,
    'current_participants', s.current_participants, 'max_participants', s.max_participants,
    'join_policy', s.join_policy
  ) INTO v_session
  FROM public.sessions s WHERE s.id = v_row.session_id;
  RETURN jsonb_build_object(
    'valid', true, 'session_id', v_row.session_id, 'created_by', v_row.created_by,
    'expires_at', v_row.expires_at, 'session', v_session
  );
END;
$function$;

-- POSTFLIGHT: all three changes landed as intended. The RPC check is
-- whitespace-insensitive (distinctive tokens only); the validate check is
-- BEHAVIORAL — it calls the function on a real token and inspects the result,
-- so no amount of reformatting can fool it.
DO $$
DECLARE
  v_def text;
  v_policy_count int;
  v_with_check text;
  v_token text;
  v_result jsonb;
  v_session_id uuid;
  v_expected_creator uuid;
BEGIN
  -- a. Widened RPC: the body now references BOTH sessions and
  --    session_participants (the preflight proved the old body had no
  --    session_participants reference, so its presence is the widening).
  v_def := regexp_replace(
    pg_get_functiondef('public.create_session_invite(uuid)'::regprocedure), '\s', '', 'g');
  IF v_def NOT LIKE '%session_participants%' OR v_def NOT LIKE '%sessions%' THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: create_session_invite does not reference both sessions and session_participants';
  END IF;

  -- b. Exactly one INSERT policy on invite_tokens, carrying the new predicate.
  --    (pg_policies normalizes these expressions, so text matching is stable.)
  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'invite_tokens' AND cmd = 'INSERT';
  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: expected exactly 1 INSERT policy on invite_tokens, found %', v_policy_count;
  END IF;
  SELECT with_check INTO v_with_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'invite_tokens' AND cmd = 'INSERT';
  IF v_with_check NOT LIKE '%creator_id = auth.uid()%'
     OR v_with_check NOT LIKE '%status = ''confirmed''%' THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: invite_tokens INSERT policy does not carry the creator-or-confirmed-participant predicate';
  END IF;

  -- c. validate_invite_token, BEHAVIORAL and data-independent: mint a scratch
  --    token INSIDE this transaction, validate it, assert the session object
  --    exposes creator_id with the correct value, then delete the scratch row.
  --    v1 of this check selected the newest LIVE token — but every live token
  --    was expired (31/31 on 2026-08-03), so the function correctly returned
  --    the {valid:false, reason:'expired'} object with no session key, and the
  --    first apply attempt aborted here with a misleading NULL message. A
  --    scratch token gets the column-default expiry (now() + 7 days), so this
  --    path cannot depend on live token freshness.
  SELECT s.id, s.creator_id INTO v_session_id, v_expected_creator
    FROM public.sessions s
   WHERE s.creator_id IS NOT NULL
   LIMIT 1;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: sessions has no rows with a creator_id, so the behavioral creator_id check could not run.';
  END IF;
  v_token := 'postflight' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.invite_tokens (session_id, token, created_by)
    VALUES (v_session_id, v_token, v_expected_creator);
  v_result := public.validate_invite_token(v_token);
  DELETE FROM public.invite_tokens WHERE token = v_token;

  IF (v_result->>'valid')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: scratch token did not validate (valid=%, reason=%)',
      v_result->>'valid', v_result->>'reason';
  END IF;
  -- NULL-safe key check: `NULL ? key` yields NULL, and IF NOT NULL is not
  -- taken, so a missing session object must be tested for explicitly.
  IF v_result->'session' IS NULL OR NOT ((v_result->'session') ? 'creator_id') THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: validate_invite_token result''s session object is missing or has no creator_id key';
  END IF;
  IF (v_result->'session'->>'creator_id')::uuid IS DISTINCT FROM v_expected_creator THEN
    RAISE EXCEPTION 'POSTFLIGHT FAILED: validate_invite_token returned creator_id % but sessions.creator_id is %',
      v_result->'session'->>'creator_id', v_expected_creator;
  END IF;
END $$;

COMMIT;

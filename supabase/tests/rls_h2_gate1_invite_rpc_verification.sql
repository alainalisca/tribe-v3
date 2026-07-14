-- RLS-H2 Gate 1 verification for migration 131. Run in the SQL editor AFTER
-- applying 131. BEGIN ... ROLLBACK — nothing persists. Proves the RPCs + that the
-- backfill was a no-op against the live table.

BEGIN;

-- ── Check 1: validate_invite_token exists and is SECURITY DEFINER ─────────────
DO $$
DECLARE v_secdef boolean;
BEGIN
  SELECT p.prosecdef INTO v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='validate_invite_token';
  IF v_secdef IS NULL THEN RAISE EXCEPTION 'FAIL(1): validate_invite_token does not exist'; END IF;
  IF NOT v_secdef THEN RAISE EXCEPTION 'FAIL(1): validate_invite_token is not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'PASS(1): validate_invite_token exists and is SECURITY DEFINER';
END$$;

-- ── Check 2: grants — anon AND authenticated EXECUTE validate; create is auth-only ─
DO $$
BEGIN
  IF NOT has_function_privilege('anon','public.validate_invite_token(text)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL(2): anon cannot EXECUTE validate_invite_token'; END IF;
  IF NOT has_function_privilege('authenticated','public.validate_invite_token(text)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL(2): authenticated cannot EXECUTE validate_invite_token'; END IF;
  IF has_function_privilege('anon','public.create_session_invite(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL(2): anon should NOT EXECUTE create_session_invite'; END IF;
  IF NOT has_function_privilege('authenticated','public.create_session_invite(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL(2): authenticated cannot EXECUTE create_session_invite'; END IF;
  RAISE NOTICE 'PASS(2): validate=anon+authenticated; create=authenticated only (anon revoked)';
END$$;

-- Fixture: a session + a valid token + an expired token (as owner; rolled back).
CREATE TEMP TABLE _h2 (k text PRIMARY KEY, v text) ON COMMIT DROP;
WITH s AS (
  INSERT INTO public.sessions (creator_id, date, duration, location, max_participants, sport, start_time, join_policy)
  SELECT id, '2030-01-01', 60, 'h2probe', 10, 'running', '08:00', 'invite_only' FROM public.users LIMIT 1 RETURNING id
)
INSERT INTO _h2 SELECT 'sess', id::text FROM s;
WITH t AS (
  INSERT INTO public.invite_tokens (session_id, token, created_by)
  SELECT (SELECT v::uuid FROM _h2 WHERE k='sess'), 'h2-valid-'||gen_random_uuid()::text,
         (SELECT creator_id FROM public.sessions WHERE id=(SELECT v::uuid FROM _h2 WHERE k='sess'))
  RETURNING token
)
INSERT INTO _h2 SELECT 'valid', token FROM t;
WITH t AS (
  INSERT INTO public.invite_tokens (session_id, token, created_by, expires_at)
  SELECT (SELECT v::uuid FROM _h2 WHERE k='sess'), 'h2-expired-'||gen_random_uuid()::text,
         (SELECT creator_id FROM public.sessions WHERE id=(SELECT v::uuid FROM _h2 WHERE k='sess')),
         now() - interval '1 day'
  RETURNING token
)
INSERT INTO _h2 SELECT 'expired', token FROM t;

-- ── Check 3: a VALID token returns the session ────────────────────────────────
DO $$
DECLARE r jsonb; v_sess uuid := (SELECT v::uuid FROM _h2 WHERE k='sess');
BEGIN
  r := public.validate_invite_token((SELECT v FROM _h2 WHERE k='valid'));
  IF NOT (r->>'valid')::boolean THEN RAISE EXCEPTION 'FAIL(3): valid token reported invalid: %', r; END IF;
  IF (r->>'session_id')::uuid <> v_sess THEN RAISE EXCEPTION 'FAIL(3): wrong session_id'; END IF;
  IF r->'session' IS NULL OR r->'session'='null'::jsonb THEN RAISE EXCEPTION 'FAIL(3): session data missing'; END IF;
  RAISE NOTICE 'PASS(3): valid token returns valid=true + session data';
END$$;

-- ── Check 4: an EXPIRED token is rejected ─────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.validate_invite_token((SELECT v FROM _h2 WHERE k='expired'));
  IF (r->>'valid')::boolean THEN RAISE EXCEPTION 'FAIL(4): expired token reported valid'; END IF;
  IF r->>'reason' <> 'expired' THEN RAISE EXCEPTION 'FAIL(4): expected reason=expired, got %', r->>'reason'; END IF;
  RAISE NOTICE 'PASS(4): expired token rejected (reason=expired)';
END$$;

-- ── Check 5: a NONEXISTENT token is rejected ──────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.validate_invite_token('definitely-not-a-real-token-'||gen_random_uuid()::text);
  IF (r->>'valid')::boolean THEN RAISE EXCEPTION 'FAIL(5): nonexistent token reported valid'; END IF;
  IF r->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'FAIL(5): expected reason=not_found, got %', r->>'reason'; END IF;
  RAISE NOTICE 'PASS(5): nonexistent token rejected (reason=not_found)';
END$$;

-- ── Check 6: the backfill was a NO-OP against the live table ──────────────────
-- (CREATE TABLE IF NOT EXISTS skipped; the 4 live constraints + BOTH live policies
-- are untouched — nothing dropped or altered.)
DO $$
DECLARE c int; ins int; sel int;
BEGIN
  SELECT count(*) INTO c FROM pg_constraint WHERE conrelid='public.invite_tokens'::regclass
    AND conname IN ('invite_tokens_pkey','invite_tokens_token_key',
                    'invite_tokens_session_id_fkey','invite_tokens_created_by_fkey');
  IF c <> 4 THEN RAISE EXCEPTION 'FAIL(6): expected 4 named constraints intact, found %', c; END IF;
  SELECT count(*) INTO ins FROM pg_policies WHERE schemaname='public' AND tablename='invite_tokens'
    AND policyname='Session creators can create invite tokens';
  IF ins <> 1 THEN RAISE EXCEPTION 'FAIL(6): INSERT policy missing (backfill altered it)'; END IF;
  SELECT count(*) INTO sel FROM pg_policies WHERE schemaname='public' AND tablename='invite_tokens'
    AND policyname='Anyone can view invite tokens';
  IF sel <> 1 THEN RAISE EXCEPTION 'FAIL(6): the live SELECT policy was touched by the backfill (should still be present, Gate 3 drops it)'; END IF;
  RAISE NOTICE 'PASS(6): backfill no-op — 4 constraints + INSERT policy + (still-present) qual:true SELECT policy all intact';
END$$;

ROLLBACK;

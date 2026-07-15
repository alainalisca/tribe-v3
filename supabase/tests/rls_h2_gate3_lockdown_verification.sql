-- RLS-H2 Gate 3 verification for migration 134. Run in the SQL editor AFTER
-- applying 134. BEGIN ... ROLLBACK — nothing persists.

BEGIN;

-- Surviving policies (only the INSERT one should remain).
SELECT CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                       WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd, pol.polname
FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='invite_tokens' ORDER BY cmd;

-- Fixture: host + recipient + bystander; invite-only session; a token; a
-- session_invite notification to the recipient. (as owner; rolled back.)
CREATE TEMP TABLE _g (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO _g SELECT 'host',  id FROM public.users ORDER BY created_at LIMIT 1;
INSERT INTO _g SELECT 'recip', id FROM public.users WHERE id NOT IN (SELECT v FROM _g) ORDER BY created_at LIMIT 1;
INSERT INTO _g SELECT 'other', id FROM public.users WHERE id NOT IN (SELECT v FROM _g) ORDER BY created_at LIMIT 1;
WITH s AS (
  INSERT INTO public.sessions (creator_id, date, duration, location, max_participants, sport, start_time, join_policy)
  SELECT (SELECT v FROM _g WHERE k='host'), '2030-01-01', 60, 'g3probe', 10, 'running', '08:00', 'invite_only' RETURNING id
)
INSERT INTO _g SELECT 'sess', id FROM s;
INSERT INTO public.invite_tokens (session_id, token, created_by)
  SELECT (SELECT v FROM _g WHERE k='sess'), 'g3-'||gen_random_uuid()::text, (SELECT v FROM _g WHERE k='host');
INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, message)
  SELECT (SELECT v FROM _g WHERE k='recip'), (SELECT v FROM _g WHERE k='host'),
         'session_invite', 'session', (SELECT v FROM _g WHERE k='sess'), 'invited';

GRANT SELECT ON _g TO anon, authenticated;

-- Check 1: no SELECT ('r') or ALL ('*') policy survives (the FOR ALL trap).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
   JOIN pg_namespace nn ON nn.oid=c.relnamespace
   WHERE nn.nspname='public' AND c.relname='invite_tokens' AND pol.polcmd IN ('r','*');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL(1): % SELECT/ALL policy(ies) still on invite_tokens', n; END IF;
  RAISE NOTICE 'PASS(1): no SELECT or FOR ALL policy remains';
END$$;

-- Check 2: grants — anon AND authenticated have NO table SELECT.
DO $$
BEGIN
  IF has_table_privilege('anon','public.invite_tokens','SELECT')
  THEN RAISE EXCEPTION 'FAIL(2): anon still has SELECT grant'; END IF;
  IF has_table_privilege('authenticated','public.invite_tokens','SELECT')
  THEN RAISE EXCEPTION 'FAIL(2): authenticated still has SELECT grant'; END IF;
  RAISE NOTICE 'PASS(2): SELECT revoked from anon AND authenticated';
END$$;

-- Check 3: anon behavioral — a raw SELECT is denied (42501).
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.invite_tokens;
    RAISE EXCEPTION 'FAIL(3): anon READ the raw table (% rows)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS(3): anon raw read denied (42501)';
  END;
  RESET ROLE;
END$$;

-- Check 4: authenticated behavioral — a raw SELECT is denied.
DO $$
DECLARE v_recip uuid := (SELECT v FROM _g WHERE k='recip'); n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recip::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO n FROM public.invite_tokens;
    RAISE EXCEPTION 'FAIL(4): authenticated READ the raw table (% rows)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS(4): authenticated raw read denied (42501)';
  END;
  RESET ROLE;
END$$;

-- Check 5: validate_invite_token still works for anon (definer reads as owner).
DO $$
DECLARE v_sess uuid := (SELECT v FROM _g WHERE k='sess'); v_tok text; r jsonb;
BEGIN
  SELECT token INTO v_tok FROM public.invite_tokens WHERE session_id = v_sess LIMIT 1;  -- as owner, ok
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  r := public.validate_invite_token(v_tok);
  IF NOT (r->>'valid')::boolean THEN RAISE EXCEPTION 'FAIL(5): validate_invite_token failed for anon: %', r; END IF;
  IF (r->>'session_id')::uuid <> v_sess THEN RAISE EXCEPTION 'FAIL(5): wrong session'; END IF;
  RAISE NOTICE 'PASS(5): validate_invite_token still returns the session (anon, via RPC)';
  RESET ROLE;
END$$;

-- Check 6: get_invite_token_for_notification still works for the recipient.
DO $$
DECLARE v_recip uuid := (SELECT v FROM _g WHERE k='recip'); v_sess uuid := (SELECT v FROM _g WHERE k='sess'); v_tok text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recip::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_tok := public.get_invite_token_for_notification(v_sess);
  IF v_tok IS NULL THEN RAISE EXCEPTION 'FAIL(6): recipient got NULL from the notification RPC'; END IF;
  RAISE NOTICE 'PASS(6): get_invite_token_for_notification still returns the token (recipient)';
  RESET ROLE;
END$$;

-- Check 7: create_session_invite still works for the creator + the INSERT policy
-- still lets the creator mint directly.
DO $$
DECLARE v_host uuid := (SELECT v FROM _g WHERE k='host'); v_sess uuid := (SELECT v FROM _g WHERE k='sess'); v_new text; n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_new := public.create_session_invite(v_sess);
  IF v_new IS NULL OR length(v_new) < 16 THEN RAISE EXCEPTION 'FAIL(7): create_session_invite did not return a token'; END IF;
  -- direct INSERT under the untouched INSERT policy (no RETURNING → no SELECT needed)
  INSERT INTO public.invite_tokens (session_id, token, created_by)
    VALUES (v_sess, 'g3-direct-'||gen_random_uuid()::text, v_host);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL(7): creator direct INSERT blocked'; END IF;
  RAISE NOTICE 'PASS(7): create_session_invite works AND the creator INSERT policy still allows minting';
  RESET ROLE;
END$$;

ROLLBACK;

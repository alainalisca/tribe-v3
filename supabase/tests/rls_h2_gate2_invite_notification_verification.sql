-- RLS-H2 Gate 2 verification for get_invite_token_for_notification (migrations
-- 132 + 133). Run in the SQL editor AFTER applying 133. BEGIN ... ROLLBACK.
-- NOTE: notifications.entity_id is UUID — the fixture inserts a uuid, not text.

BEGIN;

-- Fixture: host + recipient + a bystander; an invite-only session with a token;
-- a session_invite notification to the recipient. (as owner; rolled back.)
CREATE TEMP TABLE _n (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO _n SELECT 'host',  id FROM public.users ORDER BY created_at LIMIT 1;
INSERT INTO _n SELECT 'recip', id FROM public.users WHERE id NOT IN (SELECT v FROM _n) ORDER BY created_at LIMIT 1;
INSERT INTO _n SELECT 'other', id FROM public.users WHERE id NOT IN (SELECT v FROM _n) ORDER BY created_at LIMIT 1;
WITH s AS (
  INSERT INTO public.sessions (creator_id, date, duration, location, max_participants, sport, start_time, join_policy)
  SELECT (SELECT v FROM _n WHERE k='host'), '2030-01-01', 60, 'nprobe', 10, 'running', '08:00', 'invite_only' RETURNING id
)
INSERT INTO _n SELECT 'sess', id FROM s;
INSERT INTO public.invite_tokens (session_id, token, created_by)
  SELECT (SELECT v FROM _n WHERE k='sess'), 'n2-'||gen_random_uuid()::text, (SELECT v FROM _n WHERE k='host');
INSERT INTO public.notifications (recipient_id, actor_id, type, entity_type, entity_id, message)
  SELECT (SELECT v FROM _n WHERE k='recip'), (SELECT v FROM _n WHERE k='host'),
         'session_invite', 'session', (SELECT v FROM _n WHERE k='sess'), 'invited';  -- entity_id = uuid

GRANT SELECT ON _n TO anon, authenticated;

DO $$
DECLARE b boolean;
BEGIN
  SELECT p.prosecdef INTO b FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_invite_token_for_notification';
  IF b IS NULL THEN RAISE EXCEPTION 'FAIL(1): function missing'; END IF;
  IF NOT b THEN RAISE EXCEPTION 'FAIL(1): not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'PASS(1): exists and is SECURITY DEFINER';
END$$;

DO $$
BEGIN
  IF has_function_privilege('anon','public.get_invite_token_for_notification(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL(2): anon can EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated','public.get_invite_token_for_notification(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL(2): authenticated cannot EXECUTE'; END IF;
  RAISE NOTICE 'PASS(2): anon revoked, authenticated granted';
END$$;

-- Check 3: the RECIPIENT (holds the notification) gets the token (proves the body
-- RUNS — the uuid=uuid fix; the old ::text version threw here).
DO $$
DECLARE v_recip uuid := (SELECT v FROM _n WHERE k='recip'); v_sess uuid := (SELECT v FROM _n WHERE k='sess'); v_tok text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recip::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_tok := public.get_invite_token_for_notification(v_sess);
  IF v_tok IS NULL THEN RAISE EXCEPTION 'FAIL(3): recipient got NULL (expected the token)'; END IF;
  RAISE NOTICE 'PASS(3): recipient with a session_invite notification receives the token';
  RESET ROLE;
END$$;

-- Check 4: a bystander WITHOUT the notification is blocked (42501)
DO $$
DECLARE v_other uuid := (SELECT v FROM _n WHERE k='other'); v_sess uuid := (SELECT v FROM _n WHERE k='sess');
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.get_invite_token_for_notification(v_sess);
    RAISE EXCEPTION 'FAIL(4): non-recipient was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS(4): non-recipient blocked (42501)';
  END;
  RESET ROLE;
END$$;

ROLLBACK;

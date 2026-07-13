-- Migration 123 verification — run in the Supabase SQL editor. Expect 4 rows, all PASS.
--
-- SELF-CONTAINED: seeds synthetic fixtures, installs the guard trigger, and tests
-- every case inside a BEGIN ... ROLLBACK — running it does NOT apply the migration
-- and touches no real data (all writes rolled back). It exercises the real
-- authenticated-role path via SET LOCAL ROLE + a transaction-local JWT claim,
-- which is exactly what an anon/authenticated REST call does under the hood.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._conv_guard_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_a uuid; v_b uuid; v_c uuid;
  v_n uuid; v_e uuid;
  v_ok boolean; v_cnt int; v_err text;
BEGIN
  -- 3 distinct real users (ids only, never their data)
  SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  SELECT id INTO v_c FROM public.users WHERE id NOT IN (v_a, v_b) ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL THEN
    check_name := 'fixture'; result := 'FAIL (need 3 users)'; RETURN NEXT; RETURN;
  END IF;

  -- Fresh empty conversation N; existing conversation E with members B + C (A is NOT in E).
  -- Seeded BEFORE the trigger is created, so seeding is unaffected by it.
  INSERT INTO conversations (type) VALUES ('direct') RETURNING id INTO v_n;
  INSERT INTO conversations (type) VALUES ('direct') RETURNING id INTO v_e;
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (v_e, v_b), (v_e, v_c);

  -- Install the migration-123 guard (function + trigger) inside the txn.
  CREATE OR REPLACE FUNCTION public.guard_conversation_participant_insert()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE v_existing int;
  BEGIN
    SELECT count(*) INTO v_existing FROM conversation_participants WHERE conversation_id = NEW.conversation_id;
    IF v_existing = 0 THEN RETURN NEW; END IF;
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = NEW.conversation_id AND user_id = auth.uid())
      THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'not authorized to join conversation %', NEW.conversation_id USING ERRCODE = 'insufficient_privilege';
  END $f$;
  DROP TRIGGER IF EXISTS trg_guard_conversation_participant_insert ON public.conversation_participants;
  CREATE TRIGGER trg_guard_conversation_participant_insert
    BEFORE INSERT ON public.conversation_participants
    FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_participant_insert();

  -- 1. structural
  check_name := '1. guard trigger + SECURITY DEFINER function installed';
  result := CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_conversation_participant_insert')
    AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'guard_conversation_participant_insert' AND prosecdef)
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 2. LEGIT: user A creates a fresh 2-person conversation (both rows, self first) -> allowed
  check_name := '2. legit new-conversation batch [A,B] into empty conv -> allowed';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      INSERT INTO conversation_participants (conversation_id, user_id) VALUES (v_n, v_a), (v_n, v_b);
      v_ok := true;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := sqlstate || ' ' || sqlerrm; END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', NULL, true);
    SELECT count(*) INTO v_cnt FROM conversation_participants WHERE conversation_id = v_n;
    result := CASE WHEN v_ok AND v_cnt = 2 THEN 'PASS'
                   ELSE 'FAIL (ok=' || v_ok || ' rows=' || v_cnt || ' ' || COALESCE(v_err, '') || ')' END;
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; result := 'ERROR ' || sqlerrm; END;
  RETURN NEXT;

  -- 3. ATTACK: user A inserts self into EXISTING conversation E (members B,C; not A) -> blocked
  check_name := '3. attacker joins existing conversation -> BLOCKED (42501)';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      INSERT INTO conversation_participants (conversation_id, user_id) VALUES (v_e, v_a);
      result := 'FAIL (attacker join SUCCEEDED — vuln open)';
    EXCEPTION
      WHEN insufficient_privilege THEN result := 'PASS (42501 blocked)';
      WHEN OTHERS THEN result := 'PASS (blocked, sqlstate=' || sqlstate || ')';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', NULL, true);
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; result := 'ERROR ' || sqlerrm; END;
  RETURN NEXT;

  -- 4. SERVER PATH: owner / service_role (auth.uid() NULL) may still write -> allowed
  check_name := '4. service-role/owner (auth.uid NULL) write to existing conv -> allowed';
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    INSERT INTO conversation_participants (conversation_id, user_id) VALUES (v_e, v_a);
    result := 'PASS (allowed)';
  EXCEPTION WHEN OTHERS THEN result := 'FAIL (blocked ' || sqlstate || ' ' || sqlerrm || ')'; END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._conv_guard_verify();

ROLLBACK;

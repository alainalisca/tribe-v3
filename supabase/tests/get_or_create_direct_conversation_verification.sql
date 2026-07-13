-- Migration 124 verification — run in the Supabase SQL editor. Expect 6 rows, all PASS.
--
-- SELF-CONTAINED BEGIN ... ROLLBACK. Impersonates a test user via a
-- transaction-local JWT claim (the RPC reads auth.uid()); all writes rolled back.
-- Runs against the live DB, so it also confirms the RPC is compatible with the
-- live migration-123 guard trigger (the RPC's participant inserts must pass it).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._goc_dm_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_a uuid; v_b uuid;
  v_cid uuid; v_cid2 uuid; v_res text;
BEGIN
  SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN
    check_name := 'fixture'; result := 'FAIL (need 2 users)'; RETURN NEXT; RETURN;
  END IF;

  -- 1. exists, SECURITY DEFINER, authenticated=EXEC / anon=DENY
  check_name := '1. RPC exists, definer, authenticated=EXEC anon=DENY';
  result := CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_or_create_direct_conversation' AND p.prosecdef)
    AND has_function_privilege('authenticated','public.get_or_create_direct_conversation(uuid)','EXECUTE')
    AND NOT has_function_privilege('anon','public.get_or_create_direct_conversation(uuid)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- impersonate A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);

  -- 2. create: returns a conversation with BOTH A and B, type=direct
  check_name := '2. create -> conversation includes self + target, type=direct';
  v_cid := public.get_or_create_direct_conversation(v_b);
  result := CASE WHEN v_cid IS NOT NULL
    AND (SELECT type FROM conversations WHERE id = v_cid) = 'direct'
    AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = v_cid AND user_id = v_a)
    AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = v_cid AND user_id = v_b)
    AND (SELECT count(*) FROM conversation_participants WHERE conversation_id = v_cid) = 2
    THEN 'PASS' ELSE 'FAIL (cid=' || COALESCE(v_cid::text,'null') || ')' END;
  RETURN NEXT;

  -- 3. idempotent: second call returns the SAME conversation (no duplicate)
  check_name := '3. idempotent -> same conversation id, no duplicate';
  v_cid2 := public.get_or_create_direct_conversation(v_b);
  result := CASE WHEN v_cid2 = v_cid
    AND (SELECT count(*) FROM conversations c
         JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = v_a
         JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = v_b
         WHERE c.type='direct') = 1
    THEN 'PASS' ELSE 'FAIL (cid2=' || COALESCE(v_cid2::text,'null') || ')' END;
  RETURN NEXT;

  -- 4. self target rejected (cannot fabricate a self-only / arbitrary conversation)
  check_name := '4. target = self -> rejected';
  BEGIN
    PERFORM public.get_or_create_direct_conversation(v_a);
    result := 'FAIL (self target accepted)';
  EXCEPTION WHEN OTHERS THEN result := 'PASS (' || sqlstate || ')'; END;
  RETURN NEXT;

  -- 5. non-existent target rejected
  check_name := '5. non-existent target -> rejected';
  BEGIN
    PERFORM public.get_or_create_direct_conversation(gen_random_uuid());
    result := 'FAIL (ghost target accepted)';
  EXCEPTION WHEN OTHERS THEN result := 'PASS (' || sqlstate || ')'; END;
  RETURN NEXT;

  -- 6. anon caller (no auth.uid()) rejected
  check_name := '6. anon (no auth.uid()) -> rejected';
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.get_or_create_direct_conversation(v_b);
    result := 'FAIL (anon accepted)';
  EXCEPTION WHEN OTHERS THEN result := 'PASS (' || sqlstate || ')'; END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._goc_dm_verify();

ROLLBACK;

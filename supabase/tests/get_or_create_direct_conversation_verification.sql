-- Migration 124 verification — run in the Supabase SQL editor. Expect 8 rows, all PASS.
--
-- SELF-CONTAINED BEGIN ... ROLLBACK. Impersonates test users via a
-- transaction-local JWT claim (the RPC reads auth.uid()); all writes rolled back.
-- Runs against the LIVE db, so it also proves the RPC coexists with the live
-- migration-123 guard trigger (the RPC's two-row insert must pass it).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._goc_dm_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_a uuid; v_b uuid; v_c uuid;
  v_ab uuid; v_ab2 uuid; v_ac uuid;
BEGIN
  SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  SELECT id INTO v_c FROM public.users WHERE id NOT IN (v_a, v_b) ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL THEN
    check_name := 'fixture'; result := 'FAIL (need 3 users)'; RETURN NEXT; RETURN;
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

  -- impersonate A for the create calls
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);

  -- 2. create NEW (A,B): both rows inserted, type=direct, exactly 2 participants
  check_name := '2. create (A,B) -> both participant rows, type=direct, count=2';
  v_ab := public.get_or_create_direct_conversation(v_b);
  result := CASE WHEN v_ab IS NOT NULL
    AND (SELECT type FROM conversations WHERE id = v_ab) = 'direct'
    AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = v_ab AND user_id = v_a)
    AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = v_ab AND user_id = v_b)
    AND (SELECT count(*) FROM conversation_participants WHERE conversation_id = v_ab) = 2
    THEN 'PASS' ELSE 'FAIL (ab=' || COALESCE(v_ab::text,'null') || ')' END;
  RETURN NEXT;

  -- 3. idempotent: same pair (A,B) again -> SAME conversation, no duplicate
  check_name := '3. same pair (A,B) again -> same id, no duplicate';
  v_ab2 := public.get_or_create_direct_conversation(v_b);
  result := CASE WHEN v_ab2 = v_ab
    AND (SELECT count(*) FROM conversations c
         JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = v_a
         JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = v_b
         WHERE c.type='direct'
           AND (SELECT count(*) FROM conversation_participants x WHERE x.conversation_id = c.id) = 2) = 1
    THEN 'PASS' ELSE 'FAIL (ab2=' || COALESCE(v_ab2::text,'null') || ')' END;
  RETURN NEXT;

  -- 4. DEDUPE/PRIVACY: a DM to a different person (C) -> DIFFERENT conversation,
  --    and B is NOT in the A-C thread (no thread hijack).
  check_name := '4. different person (A,C) -> different conversation, B not in it';
  v_ac := public.get_or_create_direct_conversation(v_c);
  result := CASE WHEN v_ac IS NOT NULL AND v_ac <> v_ab
    AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = v_ac AND user_id = v_a)
    AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = v_ac AND user_id = v_c)
    AND NOT EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = v_ac AND user_id = v_b)
    THEN 'PASS' ELSE 'FAIL (ac=' || COALESCE(v_ac::text,'null') || ' ab=' || v_ab::text || ')' END;
  RETURN NEXT;

  -- 5. fails closed: self target and non-existent target both rejected
  check_name := '5. self target AND ghost target -> both rejected';
  DECLARE v_self_rej boolean := false; v_ghost_rej boolean := false;
  BEGIN
    BEGIN PERFORM public.get_or_create_direct_conversation(v_a);
    EXCEPTION WHEN OTHERS THEN v_self_rej := true; END;
    BEGIN PERFORM public.get_or_create_direct_conversation(gen_random_uuid());
    EXCEPTION WHEN OTHERS THEN v_ghost_rej := true; END;
    result := CASE WHEN v_self_rej AND v_ghost_rej THEN 'PASS'
                   ELSE 'FAIL (self_rej=' || v_self_rej || ' ghost_rej=' || v_ghost_rej || ')' END;
  END;
  RETURN NEXT;

  -- 6. caller is ALWAYS a participant: no conversation of exactly {B,C} can exist
  --    (the RPC has no param to exclude the caller -> can't create between two others).
  check_name := '6. cannot create a conversation between two OTHER users (B,C)';
  result := CASE WHEN NOT EXISTS (
      SELECT 1 FROM conversations c
      JOIN conversation_participants pb ON pb.conversation_id = c.id AND pb.user_id = v_b
      JOIN conversation_participants pc ON pc.conversation_id = c.id AND pc.user_id = v_c
      WHERE c.type='direct'
        AND NOT EXISTS (SELECT 1 FROM conversation_participants px WHERE px.conversation_id = c.id AND px.user_id = v_a)
        AND (SELECT count(*) FROM conversation_participants x WHERE x.conversation_id = c.id) = 2)
    THEN 'PASS' ELSE 'FAIL (a {B,C} conversation exists)' END;
  RETURN NEXT;

  -- 7. anon caller (no auth.uid()) rejected
  check_name := '7. anon (no auth.uid()) -> rejected';
  PERFORM set_config('request.jwt.claims', NULL, true);
  DECLARE v_anon_rej boolean := false;
  BEGIN
    BEGIN PERFORM public.get_or_create_direct_conversation(v_b);
    EXCEPTION WHEN OTHERS THEN v_anon_rej := true; END;
    result := CASE WHEN v_anon_rej THEN 'PASS' ELSE 'FAIL (anon accepted)' END;
  END;
  RETURN NEXT;

  -- 8. guard-trigger COEXISTENCE: the live 123 trigger is present AND the RPC's
  --    two-row create above still succeeded (checks 2 & 4 created conversations
  --    while the BEFORE INSERT trigger was active). Proves the trigger does not
  --    block the RPC's legitimate insert.
  check_name := '8. live 123 guard trigger present AND RPC create succeeded under it';
  result := CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_guard_conversation_participant_insert')
    AND v_ab IS NOT NULL AND v_ac IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._goc_dm_verify();

ROLLBACK;

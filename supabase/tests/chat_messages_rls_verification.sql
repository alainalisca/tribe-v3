-- Migration 125 verification — run in the Supabase SQL editor. Expect 9 rows, all PASS.
--
-- SELF-CONTAINED BEGIN ... ROLLBACK: seeds fixtures, APPLIES migration 125's policy
-- rewrite in-transaction, tests both messaging systems end-to-end via SET LOCAL ROLE
-- authenticated + a transaction-local JWT claim, and rolls everything back. Nothing
-- is applied; production is untouched.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._chatmsg_rls_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_a uuid; v_b uuid; v_c uuid;
  v_s uuid;  -- session (creator v_a, participant v_b)
  v_cv uuid; -- conversation (participants v_a, v_b)
  ok boolean; ok2 boolean; n int; n2 int;
BEGIN
  SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  SELECT id INTO v_c FROM public.users WHERE id NOT IN (v_a, v_b) ORDER BY created_at LIMIT 1;
  IF v_c IS NULL THEN check_name:='fixture'; result:='FAIL (need 3 users)'; RETURN NEXT; RETURN; END IF;

  -- fixtures (as owner)
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
    VALUES (gen_random_uuid(), v_a, 'running','x',current_date,'08:00',60,10,'probe','active','open',false,0) RETURNING id INTO v_s;
  INSERT INTO public.session_participants (session_id, user_id, status) VALUES (v_s, v_b, 'confirmed');
  INSERT INTO public.conversations (type) VALUES ('direct') RETURNING id INTO v_cv;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_cv, v_a), (v_cv, v_b);

  ----------------------------------------------------------------------------
  -- APPLY migration 125 (drop all chat_messages policies + create the 4)
  ----------------------------------------------------------------------------
  DECLARE p record;
  BEGIN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_messages', p.policyname); END LOOP;
  END;
  CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT USING (
    (session_id IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id=chat_messages.session_id AND sp.user_id=auth.uid())
     OR EXISTS (SELECT 1 FROM public.sessions s WHERE s.id=chat_messages.session_id AND s.creator_id=auth.uid())))
    OR (conversation_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=chat_messages.conversation_id AND cp.user_id=auth.uid())));
  CREATE POLICY "chat_messages_insert" ON public.chat_messages FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
      (session_id IS NOT NULL AND conversation_id IS NULL AND (
          EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id=chat_messages.session_id AND sp.user_id=auth.uid())
       OR EXISTS (SELECT 1 FROM public.sessions s WHERE s.id=chat_messages.session_id AND s.creator_id=auth.uid())))
      OR (conversation_id IS NOT NULL AND session_id IS NULL AND
          EXISTS (SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=chat_messages.conversation_id AND cp.user_id=auth.uid()))));
  CREATE POLICY "chat_messages_update" ON public.chat_messages FOR UPDATE USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
  CREATE POLICY "chat_messages_delete" ON public.chat_messages FOR DELETE USING (user_id=auth.uid());

  -- seed one session message and one DM as OWNER (for the read tests)
  INSERT INTO public.chat_messages (session_id, user_id, message) VALUES (v_s, v_a, 'session-seed');
  INSERT INTO public.chat_messages (conversation_id, user_id, message) VALUES (v_cv, v_a, 'dm-seed');

  -- 1. structural
  check_name := '1. exactly 4 chat_messages policies (one per action) + RLS enabled';
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages';
  result := CASE WHEN n=4 AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.chat_messages'::regclass)
                 THEN 'PASS' ELSE 'FAIL (policies='||n||')' END;
  RETURN NEXT;

  -- helper: run an insert as an authenticated user, return true if it succeeded
  -- 2. SESSION participant v_b CAN post a session message
  check_name := '2. session participant posts a session message -> allowed';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_b::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.chat_messages (session_id, user_id, message) VALUES (v_s, v_b, 'from-b'); ok:=true;
  EXCEPTION WHEN OTHERS THEN ok:=false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN ok THEN 'PASS' ELSE 'FAIL (blocked)' END; RETURN NEXT;

  -- 3. DM participant v_a CAN post a DM
  check_name := '3. conversation participant posts a DM -> allowed';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_a::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.chat_messages (conversation_id, user_id, message) VALUES (v_cv, v_a, 'dm-from-a'); ok:=true;
  EXCEPTION WHEN OTHERS THEN ok:=false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN ok THEN 'PASS' ELSE 'FAIL (blocked)' END; RETURN NEXT;

  -- 4. participant READS: v_b sees session msgs; v_a sees DM msgs
  check_name := '4. participants can READ their session / DM messages';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_b::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.chat_messages WHERE session_id=v_s;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_a::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n2 FROM public.chat_messages WHERE conversation_id=v_cv;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN n>=1 AND n2>=1 THEN 'PASS' ELSE 'FAIL (session_visible='||n||' dm_visible='||n2||')' END;
  RETURN NEXT;

  -- 5. NON-participant v_c CANNOT post to either
  check_name := '5. non-participant CANNOT post to session or DM';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_c::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.chat_messages (session_id, user_id, message) VALUES (v_s, v_c, 'x'); ok:=true; EXCEPTION WHEN OTHERS THEN ok:=false; END;
  BEGIN INSERT INTO public.chat_messages (conversation_id, user_id, message) VALUES (v_cv, v_c, 'x'); ok2:=true; EXCEPTION WHEN OTHERS THEN ok2:=false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN NOT ok AND NOT ok2 THEN 'PASS' ELSE 'FAIL (session_ins='||ok||' dm_ins='||ok2||')' END; RETURN NEXT;

  -- 6. NON-participant v_c CANNOT read either
  check_name := '6. non-participant CANNOT read session or DM';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_c::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.chat_messages WHERE session_id=v_s OR conversation_id=v_cv;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN n=0 THEN 'PASS' ELSE 'FAIL ('||n||' visible)' END; RETURN NEXT;

  -- 7. cannot post as someone else (user_id <> auth.uid())
  check_name := '7. cannot post as someone else (spoofed user_id)';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_a::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.chat_messages (conversation_id, user_id, message) VALUES (v_cv, v_b, 'spoof'); ok:=true; EXCEPTION WHEN OTHERS THEN ok:=false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN NOT ok THEN 'PASS' ELSE 'FAIL (spoof accepted)' END; RETURN NEXT;

  -- 8. exactly-one-of: BOTH session_id and conversation_id set -> rejected
  check_name := '8. message with BOTH session_id and conversation_id -> rejected';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_a::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.chat_messages (session_id, conversation_id, user_id, message) VALUES (v_s, v_cv, v_a, 'both'); ok:=true; EXCEPTION WHEN OTHERS THEN ok:=false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN NOT ok THEN 'PASS' ELSE 'FAIL (both-set accepted)' END; RETURN NEXT;

  -- 9. exactly-one-of: NEITHER set -> rejected
  check_name := '9. message with NEITHER session_id nor conversation_id -> rejected';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_a::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.chat_messages (user_id, message) VALUES (v_a, 'neither'); ok:=true; EXCEPTION WHEN OTHERS THEN ok:=false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  result := CASE WHEN NOT ok THEN 'PASS' ELSE 'FAIL (neither-set accepted)' END; RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._chatmsg_rls_verify();

ROLLBACK;

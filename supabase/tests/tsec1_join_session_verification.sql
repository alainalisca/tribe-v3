-- T-SEC1 Gate 1 verification — run in the Supabase SQL editor AFTER applying
-- migration 119. Expect 14 rows, all PASS (join_session: 1-8, guest RPC: 9-14).
--
-- Wrapped in BEGIN ... ROLLBACK. It creates throwaway sessions + an invite token
-- and calls join_session while impersonating a test user via a transaction-local
-- JWT claim; ALL writes are rolled back. Production data is untouched.
--
-- The RPC is SECURITY DEFINER, so its inserts run as owner and are unaffected by
-- the unrelated challenge_participants RLS recursion that breaks *direct* inserts.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._tsec1_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_a uuid; v_b uuid;
  v_open uuid; v_curated uuid; v_invite uuid;
  v_res jsonb;
  v_tok text := 'tsec1-probe-token';
BEGIN
  -- 1. function exists with the new 4-arg signature, definer
  check_name := '1. join_session(uuid,uuid,text,text): exists, definer';
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'join_session' AND p.prosecdef = true
    AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, text, text';
  result := CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_n || ')' END;
  RETURN NEXT;

  -- 2. authenticated may execute, anon may NOT
  check_name := '2. authenticated=EXEC, anon=DENY';
  result := CASE
    WHEN has_function_privilege('authenticated', 'public.join_session(uuid,uuid,text,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.join_session(uuid,uuid,text,text)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- fixtures
  SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN
    check_name := '3-8. fixture'; result := 'FAIL (need 2 users)'; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'open probe', 'active', 'open', false, 0)
  RETURNING id INTO v_open;
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'curated probe', 'active', 'curated', false, 0)
  RETURNING id INTO v_curated;
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'invite probe', 'active', 'invite_only', false, 0)
  RETURNING id INTO v_invite;
  INSERT INTO public.invite_tokens (token, session_id, created_by, expires_at) VALUES (v_tok, v_invite, v_b, now() + interval '1 day');

  -- impersonate user A for the RPC calls
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);

  -- 3. OWNER CHECK: A tries to join with p_user_id = B (not self) -> forbidden
  check_name := '3. owner check: p_user_id != auth.uid() -> forbidden';
  v_res := public.join_session(v_open, v_b, 'confirmed', NULL);
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'forbidden'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 4. p_status IGNORED: open self-join asking 'pending' -> derived 'confirmed'
  check_name := '4. open self-join, p_status lied ''pending'' -> confirmed';
  v_res := public.join_session(v_open, v_a, 'pending', NULL);
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 5. p_status IGNORED: curated self-join asking 'confirmed' -> derived 'pending'
  check_name := '5. curated self-join, p_status lied ''confirmed'' -> pending';
  v_res := public.join_session(v_curated, v_a, 'confirmed', NULL);
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'pending'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 6. invite_only WITHOUT a token -> rejected server-side
  check_name := '6. invite_only, no token -> invite_only error';
  v_res := public.join_session(v_invite, v_a, 'confirmed', NULL);
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'invite_only'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 7. invite_only WITH a valid token -> confirmed
  check_name := '7. invite_only, valid token -> confirmed';
  v_res := public.join_session(v_invite, v_a, NULL, v_tok);
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 8. anon (no auth.uid()) -> forbidden
  check_name := '8. anon caller (no auth.uid()) -> forbidden';
  PERFORM set_config('request.jwt.claims', NULL, true);
  v_res := public.join_session(v_open, v_a, 'confirmed', NULL);
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'forbidden'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- ---- join_session_as_guest (the guest door; token is the credential) ----

  -- 9. exists, SECURITY DEFINER
  check_name := '9. join_session_as_guest: exists, definer';
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='join_session_as_guest' AND p.prosecdef = true;
  result := CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_n || ')' END;
  RETURN NEXT;

  -- 10. anon AND authenticated may execute (guests are anon; token gates it)
  check_name := '10. guest RPC: anon=EXEC and authenticated=EXEC';
  result := CASE
    WHEN has_function_privilege('anon', 'public.join_session_as_guest(uuid,text,text,text,text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.join_session_as_guest(uuid,text,text,text,text)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- guest calls run without a JWT (anon)
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- 11. no token -> rejected
  check_name := '11. guest: no token -> invite_required';
  v_res := public.join_session_as_guest(v_invite, NULL, 'Guest', '300');
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'invite_required'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 12. token for the WRONG session -> rejected (token is for v_invite, call v_open)
  check_name := '12. guest: token for wrong session -> invite_invalid';
  v_res := public.join_session_as_guest(v_open, v_tok, 'Guest', '300');
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'invite_invalid'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 13. expired token -> rejected
  check_name := '13. guest: expired token -> invite_expired';
  UPDATE invite_tokens SET expires_at = now() - interval '1 hour' WHERE token = v_tok;
  v_res := public.join_session_as_guest(v_invite, v_tok, 'Guest', '300');
  result := CASE WHEN (v_res->>'success')::boolean = false AND v_res->>'error' = 'invite_expired'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;
  UPDATE invite_tokens SET expires_at = now() + interval '1 day' WHERE token = v_tok;  -- restore

  -- 14. valid token -> guest row created, confirmed (open-policy derivation),
  --     and capacity is enforced (fill the session, next guest is rejected).
  check_name := '14. guest: valid token -> row created + capacity enforced';
  DECLARE
    v_ok boolean; v_full boolean; i int;
  BEGIN
    v_res := public.join_session_as_guest(v_invite, v_tok, 'Guest One', '300');
    v_ok := (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
            AND EXISTS (SELECT 1 FROM session_participants
                        WHERE session_id = v_invite AND is_guest AND guest_name = 'Guest One');
    -- invite session max_participants=10; it has 1 guest now. Add 9 more -> full.
    FOR i IN 1..9 LOOP
      PERFORM public.join_session_as_guest(v_invite, v_tok, 'Filler ' || i, '30' || i);
    END LOOP;
    v_res := public.join_session_as_guest(v_invite, v_tok, 'Overflow', '399');
    v_full := (v_res->>'success')::boolean = false AND v_res->>'error' = 'Session is full';
    result := CASE WHEN v_ok AND v_full THEN 'PASS'
                   ELSE 'FAIL (created_ok=' || v_ok || ', capacity_enforced=' || v_full || ')' END;
  END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec1_verify();

ROLLBACK;

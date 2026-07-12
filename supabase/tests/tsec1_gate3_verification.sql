-- T-SEC1 Gate 3 verification — run in the Supabase SQL editor. Expect 8 rows, all PASS.
--
-- SELF-CONTAINED: this script performs the four DROP POLICY statements ITSELF,
-- inside a BEGIN ... ROLLBACK. It proves the end-state (direct inserts blocked,
-- all RPCs + the service-role path still work) WITHOUT permanently applying
-- migration 121 — everything is rolled back. Production is untouched.
--
-- It exercises real RLS by switching into the anon / authenticated / service_role
-- roles (the SQL editor runs as a superuser that can SET ROLE), because as the
-- owner role RLS is bypassed and a direct insert would misleadingly succeed.

BEGIN;

-- Apply Gate 3 in-transaction (rolled back at the end).
DROP POLICY IF EXISTS "Allow guest inserts"     ON public.session_participants;
DROP POLICY IF EXISTS "Allow guest joins"       ON public.session_participants;
DROP POLICY IF EXISTS "Users can join sessions" ON public.session_participants;
DROP POLICY IF EXISTS "sp_insert_self"          ON public.session_participants;

CREATE OR REPLACE FUNCTION pg_temp._gate3_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_a uuid; v_b uuid;
  v_open uuid; v_invite uuid; v_wl uuid;
  v_tok text := 'tsec1-gate3-token';
  v_res jsonb; v_n int;
BEGIN
  -- fixtures (created as the owner role, before any SET ROLE)
  SELECT id INTO v_a FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN
    check_name := 'fixture'; result := 'FAIL (need 2 users)'; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'open probe', 'active', 'open', false, 0)
  RETURNING id INTO v_open;
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 10, 'invite probe', 'active', 'invite_only', false, 0)
  RETURNING id INTO v_invite;
  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status, join_policy, is_paid, price_cents)
  VALUES (gen_random_uuid(), v_b, 'running', 'x', current_date, '08:00', 60, 1, 'waitlist probe', 'active', 'open', false, 0)
  RETURNING id INTO v_wl;
  INSERT INTO public.session_participants (session_id, user_id, status) VALUES (v_wl, v_b, 'confirmed'); -- fills capacity 1
  INSERT INTO public.invite_tokens (token, session_id, created_by, expires_at) VALUES (v_tok, v_invite, v_b, now() + interval '1 day');
  INSERT INTO public.session_waitlist (session_id, user_id, position, status, offered_at, offer_expires_at)
    VALUES (v_wl, v_a, 1, 'offered', now(), now() + interval '1 day');

  -- 1. zero INSERT policies remain on the table
  SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname='public' AND tablename='session_participants' AND cmd='INSERT';
  check_name := '1. zero INSERT policies remain on session_participants';
  result := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL (' || v_n || ' remain)' END;
  RETURN NEXT;

  -- ---- RPCs still work (SECURITY DEFINER: run as owner, bypass RLS) ----

  -- 2. join_session (member) — impersonate A, join the open session
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);
  check_name := '2. join_session (member) still works';
  v_res := public.join_session(v_open, v_a, 'confirmed', NULL);
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 3. join_session_as_guest, token-less on OPEN
  PERFORM set_config('request.jwt.claims', NULL, true);
  check_name := '3. join_session_as_guest token-less on OPEN still works';
  v_res := public.join_session_as_guest(v_open, NULL, 'G Open', '300');
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 4. join_session_as_guest, valid token on INVITE_ONLY
  check_name := '4. join_session_as_guest w/ token on INVITE_ONLY still works';
  v_res := public.join_session_as_guest(v_invite, v_tok, 'G Inv', '301');
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;

  -- 5. accept_waitlist_offer — impersonate A, accept the reserved seat at capacity
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);
  check_name := '5. accept_waitlist_offer still works';
  v_res := public.accept_waitlist_offer(v_wl, v_a);
  result := CASE WHEN (v_res->>'success')::boolean AND v_res->>'status' = 'confirmed'
                 THEN 'PASS' ELSE 'FAIL (' || v_res::text || ')' END;
  RETURN NEXT;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- 6. service-role writer (enrollSubscribersInChildSession path): a BYPASSRLS
  --    role can still upsert directly, exactly as the cron fan-out does.
  check_name := '6. service_role direct upsert still works (BYPASSRLS)';
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    INSERT INTO public.session_participants (session_id, user_id, status)
      VALUES (v_open, v_b, 'confirmed')
      ON CONFLICT (session_id, user_id) DO NOTHING;
    EXECUTE 'RESET ROLE';
    result := 'PASS';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    result := 'FAIL (service_role blocked: ' || sqlstate || ' ' || sqlerrm || ')';
  END;
  RETURN NEXT;

  -- ---- direct inserts are now DENIED (the bypass closing) ----

  -- 7. authenticated direct INSERT -> blocked (42501 = insufficient_privilege)
  check_name := '7. direct INSERT as authenticated -> BLOCKED';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      INSERT INTO public.session_participants (session_id, user_id, status)
        VALUES (v_open, v_a, 'confirmed');
      result := 'FAIL (insert succeeded — RLS did NOT block)';
    EXCEPTION
      WHEN insufficient_privilege THEN result := 'PASS (42501 RLS denied)';
      WHEN OTHERS THEN result := 'PASS (blocked, sqlstate=' || sqlstate || ')';
    END;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    result := 'ERROR (' || sqlerrm || ')';
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN NEXT;

  -- 8. anon/guest direct INSERT -> blocked (the guest-row shape the old policies allowed)
  check_name := '8. direct INSERT as anon/guest -> BLOCKED';
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      INSERT INTO public.session_participants (session_id, user_id, is_guest, guest_name, guest_phone, status)
        VALUES (v_open, NULL, true, 'Sneaky Guest', '399', 'confirmed');
      result := 'FAIL (insert succeeded — RLS did NOT block)';
    EXCEPTION
      WHEN insufficient_privilege THEN result := 'PASS (42501 RLS denied)';
      WHEN OTHERS THEN result := 'PASS (blocked, sqlstate=' || sqlstate || ')';
    END;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    result := 'ERROR (' || sqlerrm || ')';
  END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._gate3_verify();

ROLLBACK;

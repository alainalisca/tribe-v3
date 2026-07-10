-- T-SEC5 Batch 3 verification — run in the Supabase SQL editor AFTER applying
-- migration 117. Expect 6 rows, all PASS.
--
-- Wrapped in BEGIN ... ROLLBACK. It creates a throwaway session + participant +
-- client to exercise the matcher, and impersonates users via a transaction-local
-- JWT claim; ALL of it is rolled back. Production data is untouched.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._tsec5b3_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_host uuid;        -- premium session creator
  v_other uuid;       -- a different user (non-creator)
  v_part_matched uuid;
  v_part_unmatched uuid;
  v_session uuid;
  v_email_matched text;
  v_email_unmatched text;
  v_matched_id uuid;
  v_unmatched_email text;
  v_forbidden boolean;
BEGIN
  -- 1. exists, SECURITY DEFINER
  check_name := '1. get_session_attendance: exists, definer';
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_session_attendance' AND p.prosecdef = true;
  result := CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_n || ')' END;
  RETURN NEXT;

  -- 2. authenticated=EXEC, anon=DENY
  check_name := '2. authenticated=EXEC, anon=DENY';
  result := CASE
    WHEN has_function_privilege('authenticated', 'public.get_session_attendance(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.get_session_attendance(uuid)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- Build a throwaway fixture: a premium host, a session they created, two
  -- confirmed participants (one whose email matches a client, one who doesn't).
  SELECT id INTO v_host FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id, email INTO v_part_matched, v_email_matched
    FROM public.users WHERE id <> v_host AND email IS NOT NULL ORDER BY created_at LIMIT 1;
  SELECT id, email INTO v_part_unmatched, v_email_unmatched
    FROM public.users WHERE id NOT IN (v_host, v_part_matched) AND email IS NOT NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other FROM public.users WHERE id NOT IN (v_host, v_part_matched, v_part_unmatched) ORDER BY created_at LIMIT 1;

  IF v_host IS NULL OR v_part_matched IS NULL OR v_part_unmatched IS NULL OR v_other IS NULL THEN
    check_name := '3-6. fixture'; result := 'FAIL (need >=4 users, >=2 with email)'; RETURN NEXT; RETURN;
  END IF;

  -- make the host premium
  UPDATE public.users SET tribe_os_tier = 'solo', tribe_os_status = NULL WHERE id = v_host;

  INSERT INTO public.sessions (id, creator_id, sport, location, date, start_time, duration, max_participants, title, status)
  VALUES (gen_random_uuid(), v_host, 'running', 'x', current_date, '08:00', 60, 10, 'probe', 'active')
  RETURNING id INTO v_session;

  INSERT INTO public.session_participants (session_id, user_id, status) VALUES (v_session, v_part_matched, 'confirmed');
  INSERT INTO public.session_participants (session_id, user_id, status) VALUES (v_session, v_part_unmatched, 'confirmed');

  -- a client owned by the host whose email matches the "matched" participant
  INSERT INTO public.clients (instructor_user_id, name, email, archived)
  VALUES (v_host, 'Probe Client', v_email_matched, false)
  RETURNING id INTO v_matched_id;

  -- Impersonate the host and call the matcher.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host::text)::text, true);

  -- 3. matched participant -> matched_client_id set, email NULL (not leaked)
  check_name := '3. matched participant: client id set, email withheld';
  SELECT email INTO v_email_matched FROM public.get_session_attendance(v_session) WHERE user_id = v_part_matched;
  SELECT matched_client_id INTO v_matched_id FROM public.get_session_attendance(v_session) WHERE user_id = v_part_matched;
  result := CASE WHEN v_matched_id IS NOT NULL AND v_email_matched IS NULL THEN 'PASS'
                 ELSE 'FAIL (client=' || COALESCE(v_matched_id::text,'null') || ', email=' || COALESCE(v_email_matched,'null') || ')' END;
  RETURN NEXT;

  -- 4. unmatched participant -> no client, email RETURNED (for prefill)
  check_name := '4. unmatched participant: no client, email returned for prefill';
  SELECT matched_client_id, email INTO v_matched_id, v_unmatched_email
    FROM public.get_session_attendance(v_session) WHERE user_id = v_part_unmatched;
  result := CASE WHEN v_matched_id IS NULL AND v_unmatched_email IS NOT NULL THEN 'PASS'
                 ELSE 'FAIL (client=' || COALESCE(v_matched_id::text,'null') || ', email=' || COALESCE(v_unmatched_email,'null') || ')' END;
  RETURN NEXT;

  -- 5. FAIL CLOSED: a non-creator caller is rejected
  check_name := '5. fail closed: non-creator is forbidden';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text)::text, true);
  v_forbidden := false;
  BEGIN
    PERFORM * FROM public.get_session_attendance(v_session);
  EXCEPTION WHEN others THEN v_forbidden := true;
  END;
  result := CASE WHEN v_forbidden THEN 'PASS (raised)' ELSE 'FAIL (non-creator got data)' END;
  RETURN NEXT;

  -- 6. FAIL CLOSED: the creator, once NOT premium, is rejected
  check_name := '6. fail closed: non-premium creator is forbidden';
  UPDATE public.users SET tribe_os_tier = NULL, tribe_os_status = NULL WHERE id = v_host;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_host::text)::text, true);
  v_forbidden := false;
  BEGIN
    PERFORM * FROM public.get_session_attendance(v_session);
  EXCEPTION WHEN others THEN v_forbidden := true;
  END;
  result := CASE WHEN v_forbidden THEN 'PASS (raised)' ELSE 'FAIL (non-premium got data)' END;
  RETURN NEXT;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN;
END $$;

SELECT * FROM pg_temp._tsec5b3_verify();

ROLLBACK;

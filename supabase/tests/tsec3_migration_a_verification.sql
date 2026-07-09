-- T-SEC3 Phase A verification — run in the Supabase SQL editor AFTER applying
-- migration 112, and BEFORE the code PR / migration 113.
--
-- Confirms the two new SECURITY DEFINER helpers exist, are locked to the right
-- roles, and actually return correct data. The editor doesn't surface RAISE
-- NOTICE, so results come back as a PASS/FAIL grid. Read-only: the only writes
-- are a transaction-local JWT claim (set_config ... is_local => true) that never
-- persists.

CREATE OR REPLACE FUNCTION pg_temp._tsec3a_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_uid uuid;
  v_json jsonb;
  v_fn_count int;
  v_real int;
BEGIN
  -- 1. get_my_private_profile is defined, SECURITY DEFINER, returns jsonb
  check_name := '1. get_my_private_profile: exists, definer, returns jsonb';
  SELECT count(*) INTO v_fn_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_my_private_profile'
    AND p.prosecdef = true AND pg_catalog.format_type(p.prorettype, NULL) = 'jsonb';
  result := CASE WHEN v_fn_count = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_fn_count || ')' END;
  RETURN NEXT;

  -- 2. get_my_private_profile: authenticated may execute, anon may NOT
  check_name := '2. get_my_private_profile: authenticated=EXEC, anon=DENY';
  result := CASE
    WHEN has_function_privilege('authenticated', 'public.get_my_private_profile()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.get_my_private_profile()', 'EXECUTE')
    THEN 'PASS'
    ELSE 'FAIL (auth=' || has_function_privilege('authenticated', 'public.get_my_private_profile()', 'EXECUTE')
         || ', anon=' || has_function_privilege('anon', 'public.get_my_private_profile()', 'EXECUTE') || ')'
  END;
  RETURN NEXT;

  -- 3. get_admin_user_ids is defined + SECURITY DEFINER
  check_name := '3. get_admin_user_ids: exists, definer';
  SELECT count(*) INTO v_fn_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_admin_user_ids' AND p.prosecdef = true;
  result := CASE WHEN v_fn_count = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_fn_count || ')' END;
  RETURN NEXT;

  -- 4. get_admin_user_ids: authenticated may execute, anon may NOT
  check_name := '4. get_admin_user_ids: authenticated=EXEC, anon=DENY';
  result := CASE
    WHEN has_function_privilege('authenticated', 'public.get_admin_user_ids()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.get_admin_user_ids()', 'EXECUTE')
    THEN 'PASS'
    ELSE 'FAIL (auth=' || has_function_privilege('authenticated', 'public.get_admin_user_ids()', 'EXECUTE')
         || ', anon=' || has_function_privilege('anon', 'public.get_admin_user_ids()', 'EXECUTE') || ')'
  END;
  RETURN NEXT;

  -- 5. get_admin_user_ids() returns exactly the admin rows
  check_name := '5. get_admin_user_ids() count matches users.is_admin';
  SELECT count(*) INTO v_fn_count FROM public.get_admin_user_ids();
  SELECT count(*) INTO v_real FROM public.users WHERE is_admin = true;
  result := CASE WHEN v_fn_count = v_real THEN 'PASS (' || v_real || ' admins)'
                 ELSE 'FAIL (fn=' || v_fn_count || ', table=' || v_real || ')' END;
  RETURN NEXT;

  -- 6. get_my_private_profile() returns the 5 expected keys for a real self user
  check_name := '6. get_my_private_profile() returns the 5 private-field keys';
  SELECT id INTO v_uid FROM public.users ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    result := 'FAIL (no users to test with)';
  ELSE
    -- impersonate that user for this transaction only
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text)::text, true);
    v_json := public.get_my_private_profile();
    result := CASE WHEN v_json IS NOT NULL
                    AND v_json ? 'payout_method' AND v_json ? 'stripe_account_id'
                    AND v_json ? 'wompi_merchant_id' AND v_json ? 'total_earnings_cents'
                    AND v_json ? 'earnings_currency'
                   THEN 'PASS' ELSE 'FAIL (' || COALESCE(v_json::text, 'null') || ')' END;
    PERFORM set_config('request.jwt.claims', NULL, true);
  END IF;
  RETURN NEXT;

  -- 7. is_app_admin() is callable by authenticated (RPC path for the self-check)
  check_name := '7. is_app_admin(): authenticated=EXEC';
  result := CASE WHEN has_function_privilege('authenticated', 'public.is_app_admin()', 'EXECUTE')
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec3a_verify();

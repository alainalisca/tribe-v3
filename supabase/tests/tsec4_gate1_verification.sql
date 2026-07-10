-- T-SEC4 Gate 1 verification — run in the Supabase SQL editor AFTER applying
-- migration 114. Expect 8 rows, all PASS.
--
-- Safe by construction: the whole script runs inside BEGIN ... ROLLBACK, and the
-- single UPDATE it performs (to prove the view actually rounds) is ALSO rolled
-- back internally via a plpgsql savepoint. Production data is untouched even if
-- you run the middle of this script on its own.
--
-- The editor does not surface RAISE NOTICE, so results come back as a grid.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._tsec4_gate1_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_uid_a uuid;   -- the user we temporarily give known coords
  v_uid_b uuid;   -- a different user, to prove the function follows auth.uid()
  v_lat numeric; v_lng numeric;
  v_json_a jsonb; v_json_b jsonb;
  v_n int; v_expected int;
  v_ok5 boolean := false; v_msg5 text := 'not run';
  v_ok6 boolean := false; v_msg6 text := 'not run';
BEGIN
  SELECT id INTO v_uid_a FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
   ORDER BY created_at LIMIT 1;
  SELECT id INTO v_uid_b FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
     AND id <> v_uid_a
   ORDER BY created_at LIMIT 1;

  -- 1. the view exists and is OWNER-executed (not security_invoker=true),
  --    which is what lets it read the raw columns after Gate 3.
  check_name := '1. users_discoverable exists and is owner-executed';
  SELECT count(*) INTO v_n
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users_discoverable' AND c.relkind = 'v'
    AND coalesce(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%';
  result := CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_n || ')' END;
  RETURN NEXT;

  -- 2. AL'S CHECK #2 (view): anon has NO access, authenticated does.
  check_name := '2. view: authenticated=SELECT, anon=DENY';
  result := CASE
    WHEN has_table_privilege('authenticated', 'public.users_discoverable', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.users_discoverable', 'SELECT')
    THEN 'PASS'
    ELSE 'FAIL (auth=' || has_table_privilege('authenticated', 'public.users_discoverable', 'SELECT')
         || ', anon=' || has_table_privilege('anon', 'public.users_discoverable', 'SELECT') || ')'
  END;
  RETURN NEXT;

  -- 3. the self function exists, is SECURITY DEFINER, returns jsonb
  check_name := '3. get_my_location(): exists, definer, returns jsonb';
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_my_location'
    AND p.prosecdef = true AND pg_catalog.format_type(p.prorettype, NULL) = 'jsonb';
  result := CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_n || ')' END;
  RETURN NEXT;

  -- 4. AL'S CHECK #2 (function): anon has NO access, authenticated does.
  check_name := '4. get_my_location(): authenticated=EXEC, anon=DENY';
  result := CASE
    WHEN has_function_privilege('authenticated', 'public.get_my_location()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.get_my_location()', 'EXECUTE')
    THEN 'PASS'
    ELSE 'FAIL (auth=' || has_function_privilege('authenticated', 'public.get_my_location()', 'EXECUTE')
         || ', anon=' || has_function_privilege('anon', 'public.get_my_location()', 'EXECUTE') || ')'
  END;
  RETURN NEXT;

  -- 5 & 6 need a row with known coords. Every user currently has NULL coords, so
  -- we set one temporarily and roll it back via this block's savepoint.
  IF v_uid_a IS NULL OR v_uid_b IS NULL THEN
    v_msg5 := 'FAIL (need two eligible users)'; v_msg6 := v_msg5;
  ELSE
    BEGIN
      UPDATE public.users
         SET location_lat = 6.244203, location_lng = -75.581215   -- Medellin
       WHERE id = v_uid_a;

      -- 5. AL'S CHECK #1: the view returns ROUNDED coords, not raw.
      SELECT location_lat, location_lng INTO v_lat, v_lng
        FROM public.users_discoverable WHERE id = v_uid_a;
      v_ok5 := (v_lat = 6.24 AND v_lng = -75.58);
      v_msg5 := 'view returned ' || coalesce(v_lat::text, 'null') || ', ' || coalesce(v_lng::text, 'null');

      -- 6. get_my_location() returns the CALLER'S OWN RAW coords, and follows
      --    auth.uid() (user B, whose coords are untouched, must not see A's).
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid_a::text)::text, true);
      v_json_a := public.get_my_location();
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid_b::text)::text, true);
      v_json_b := public.get_my_location();
      PERFORM set_config('request.jwt.claims', NULL, true);

      v_ok6 := round((v_json_a->>'location_lat')::numeric, 6) = 6.244203
           AND (v_json_b->>'location_lat') IS NULL;
      v_msg6 := 'self=' || coalesce(v_json_a::text, 'null') || ' other=' || coalesce(v_json_b::text, 'null');

      RAISE EXCEPTION 'RB';   -- undo the UPDATE
    EXCEPTION WHEN others THEN
      IF SQLERRM <> 'RB' THEN
        v_msg5 := 'error: ' || SQLERRM; v_msg6 := v_msg5;
        v_ok5 := false; v_ok6 := false;
      END IF;
    END;
  END IF;

  check_name := '5. view rounds coords to 2dp (6.244203 -> 6.24)';
  result := CASE WHEN v_ok5 THEN 'PASS' ELSE 'FAIL (' || v_msg5 || ')' END;
  RETURN NEXT;

  check_name := '6. get_my_location() gives self RAW coords, scoped to auth.uid()';
  result := CASE WHEN v_ok6 THEN 'PASS' ELSE 'FAIL (' || v_msg6 || ')' END;
  RETURN NEXT;

  -- 7. the view excludes soft-deleted / banned / test accounts
  check_name := '7. view excludes deleted/banned/test rows';
  SELECT count(*) INTO v_n FROM public.users_discoverable;
  SELECT count(*) INTO v_expected FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE;
  result := CASE WHEN v_n = v_expected THEN 'PASS (' || v_n || ' rows)'
                 ELSE 'FAIL (view=' || v_n || ', expected=' || v_expected || ')' END;
  RETURN NEXT;

  -- 8. GATE 1 REVOKED NOTHING. Raw coords on `users` must still be readable by
  --    both roles — Gate 3 is what takes them away, and it has not run.
  check_name := '8. Gate 1 revoked nothing: users.location_lat still readable';
  result := CASE
    WHEN has_column_privilege('authenticated', 'public.users', 'location_lat', 'SELECT')
     AND has_column_privilege('anon', 'public.users', 'location_lat', 'SELECT')
    THEN 'PASS (raw still readable, as intended pre-Gate-3)'
    ELSE 'FAIL — something already revoked coords'
  END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec4_gate1_verify();

ROLLBACK;

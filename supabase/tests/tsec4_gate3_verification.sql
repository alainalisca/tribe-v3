-- T-SEC4 Gate 3 verification — run in the Supabase SQL editor AFTER applying
-- migration 115. Expect 6 rows, all PASS.
--
-- Wrapped in BEGIN ... ROLLBACK; the one UPDATE it makes (to prove the definer
-- paths still return data through the revoke) is also undone via a plpgsql
-- savepoint. Production data is untouched.
--
-- The editor does not surface RAISE NOTICE, so results come back as a grid.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._tsec4_gate3_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_uid uuid;
  v_lat numeric; v_lng numeric;
  v_json jsonb;
  v_ok4 boolean := false; v_msg4 text := 'not run';
  v_ok5 boolean := false; v_msg5 text := 'not run';
BEGIN
  SELECT id INTO v_uid FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
   ORDER BY created_at LIMIT 1;

  -- 1. authenticated can no longer SELECT location_lat / location_lng
  check_name := '1. authenticated DENIED on both coord columns';
  result := CASE
    WHEN NOT has_column_privilege('authenticated', 'public.users', 'location_lat', 'SELECT')
     AND NOT has_column_privilege('authenticated', 'public.users', 'location_lng', 'SELECT')
    THEN 'PASS'
    ELSE 'FAIL (lat=' || has_column_privilege('authenticated', 'public.users', 'location_lat', 'SELECT')
         || ', lng=' || has_column_privilege('authenticated', 'public.users', 'location_lng', 'SELECT') || ')'
  END;
  RETURN NEXT;

  -- 2. anon can no longer SELECT location_lat / location_lng
  check_name := '2. anon DENIED on both coord columns';
  result := CASE
    WHEN NOT has_column_privilege('anon', 'public.users', 'location_lat', 'SELECT')
     AND NOT has_column_privilege('anon', 'public.users', 'location_lng', 'SELECT')
    THEN 'PASS'
    ELSE 'FAIL (lat=' || has_column_privilege('anon', 'public.users', 'location_lat', 'SELECT')
         || ', lng=' || has_column_privilege('anon', 'public.users', 'location_lng', 'SELECT') || ')'
  END;
  RETURN NEXT;

  -- 3. did NOT over-revoke: other users columns still readable by authenticated
  check_name := '3. no over-revoke: name/avatar_url/location(text) still readable';
  result := CASE
    WHEN has_column_privilege('authenticated', 'public.users', 'name', 'SELECT')
     AND has_column_privilege('authenticated', 'public.users', 'avatar_url', 'SELECT')
     AND has_column_privilege('authenticated', 'public.users', 'location', 'SELECT')
    THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 4 & 5 prove the definer paths still work THROUGH the revoke. They need a row
  -- with known coords; every user is NULL today, so set one and roll it back.
  IF v_uid IS NULL THEN
    v_msg4 := 'FAIL (no eligible user)'; v_msg5 := v_msg4;
  ELSE
    BEGIN
      UPDATE public.users
         SET location_lat = 6.244203, location_lng = -75.581215   -- Medellin
       WHERE id = v_uid;

      -- 4. users_discoverable still returns ROUNDED coords (owner-executed, so
      --    the revoke on the base table does not affect it).
      SELECT location_lat, location_lng INTO v_lat, v_lng
        FROM public.users_discoverable WHERE id = v_uid;
      v_ok4 := (v_lat = 6.24 AND v_lng = -75.58);
      v_msg4 := 'view returned ' || coalesce(v_lat::text, 'null') || ', ' || coalesce(v_lng::text, 'null');

      -- 5. get_my_location() still returns the caller's OWN RAW coords.
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text)::text, true);
      v_json := public.get_my_location();
      PERFORM set_config('request.jwt.claims', NULL, true);
      v_ok5 := round((v_json->>'location_lat')::numeric, 6) = 6.244203;
      v_msg5 := 'rpc returned ' || coalesce(v_json::text, 'null');

      RAISE EXCEPTION 'RB';   -- undo the UPDATE
    EXCEPTION WHEN others THEN
      IF SQLERRM <> 'RB' THEN
        v_msg4 := 'error: ' || SQLERRM; v_msg5 := v_msg4;
        v_ok4 := false; v_ok5 := false;
      END IF;
    END;
  END IF;

  check_name := '4. users_discoverable still returns rounded coords (owner path intact)';
  result := CASE WHEN v_ok4 THEN 'PASS' ELSE 'FAIL (' || v_msg4 || ')' END;
  RETURN NEXT;

  check_name := '5. get_my_location() still returns own raw coords (definer intact)';
  result := CASE WHEN v_ok5 THEN 'PASS' ELSE 'FAIL (' || v_msg5 || ')' END;
  RETURN NEXT;

  -- 6. the view is still anon-DENIED (Gate 1 grant not disturbed by this migration)
  check_name := '6. users_discoverable: authenticated=SELECT, anon=DENY';
  result := CASE
    WHEN has_table_privilege('authenticated', 'public.users_discoverable', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.users_discoverable', 'SELECT')
    THEN 'PASS'
    ELSE 'FAIL (auth=' || has_table_privilege('authenticated', 'public.users_discoverable', 'SELECT')
         || ', anon=' || has_table_privilege('anon', 'public.users_discoverable', 'SELECT') || ')'
  END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec4_gate3_verify();

ROLLBACK;

-- T-SEC5 Batch 2 verification — run in the Supabase SQL editor AFTER applying
-- migration 116. Expect 4 rows, all PASS.
--
-- Wrapped in BEGIN ... ROLLBACK; it performs no writes, but the wrapper keeps
-- it consistent with the other migration checks and guarantees no side effects.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._tsec5b2_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_email text;
  v_uid uuid;
  v_n int;
BEGIN
  -- 1. function exists and is SECURITY DEFINER, returns setof uuid
  check_name := '1. get_admin_ids_by_email: exists, definer, returns uuid';
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_admin_ids_by_email'
    AND p.prosecdef = true
    AND pg_catalog.format_type(p.prorettype, NULL) = 'uuid';
  result := CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL (found ' || v_n || ')' END;
  RETURN NEXT;

  -- 2. authenticated may execute, anon may NOT
  check_name := '2. authenticated=EXEC, anon=DENY';
  result := CASE
    WHEN has_function_privilege('authenticated', 'public.get_admin_ids_by_email(text[])', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.get_admin_ids_by_email(text[])', 'EXECUTE')
    THEN 'PASS'
    ELSE 'FAIL (auth=' || has_function_privilege('authenticated', 'public.get_admin_ids_by_email(text[])', 'EXECUTE')
         || ', anon=' || has_function_privilege('anon', 'public.get_admin_ids_by_email(text[])', 'EXECUTE') || ')'
  END;
  RETURN NEXT;

  -- 3. round-trips a known email to that user's id
  check_name := '3. resolves a known email to the right user id';
  SELECT id, email INTO v_uid, v_email FROM public.users WHERE email IS NOT NULL ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    result := 'FAIL (no user with an email to test)';
  ELSE
    result := CASE WHEN EXISTS (SELECT 1 FROM public.get_admin_ids_by_email(ARRAY[v_email]) g WHERE g = v_uid)
                   THEN 'PASS' ELSE 'FAIL (id not returned for its own email)' END;
  END IF;
  RETURN NEXT;

  -- 4. returns nothing for an email that matches no user (no over-broad match)
  check_name := '4. returns no ids for an unknown email';
  SELECT count(*) INTO v_n FROM public.get_admin_ids_by_email(ARRAY['definitely-not-a-real-user@example.invalid']);
  result := CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL (matched ' || v_n || ')' END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec5b2_verify();

ROLLBACK;

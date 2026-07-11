-- T-SEC5 email-revoke verification — run in the Supabase SQL editor AFTER
-- applying migration 118. Expect 5 rows, all PASS.
--
-- Wrapped in BEGIN ... ROLLBACK. Read-only (only privilege catalogs + a bounded
-- count), no writes; the wrapper keeps it consistent with the other checks.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp._tsec5_email_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_with_email int;
  v_owner_read int;
BEGIN
  -- 1. authenticated can no longer SELECT email
  check_name := '1. authenticated DENIED on users.email';
  result := CASE WHEN NOT has_column_privilege('authenticated', 'public.users', 'email', 'SELECT')
                 THEN 'PASS' ELSE 'FAIL (still granted)' END;
  RETURN NEXT;

  -- 2. anon can no longer SELECT email
  check_name := '2. anon DENIED on users.email';
  result := CASE WHEN NOT has_column_privilege('anon', 'public.users', 'email', 'SELECT')
                 THEN 'PASS' ELSE 'FAIL (still granted)' END;
  RETURN NEXT;

  -- 3. no over-revoke: other users columns still readable by authenticated
  check_name := '3. no over-revoke: name/avatar_url/location still readable';
  result := CASE WHEN has_column_privilege('authenticated', 'public.users', 'name', 'SELECT')
                  AND has_column_privilege('authenticated', 'public.users', 'avatar_url', 'SELECT')
                  AND has_column_privilege('authenticated', 'public.users', 'location', 'SELECT')
                 THEN 'PASS' ELSE 'FAIL' END;
  RETURN NEXT;

  -- 4. service_role can STILL SELECT email (server routes / webhooks / crons and
  --    the definer paths that run as owner keep working through the revoke).
  check_name := '4. service_role STILL reads users.email (definer/service paths)';
  result := CASE WHEN has_column_privilege('service_role', 'public.users', 'email', 'SELECT')
                 THEN 'PASS' ELSE 'FAIL (service-role lost email — would break email jobs)' END;
  RETURN NEXT;

  -- 5. functional: the data is still readable at owner level (this editor runs
  --    as a superuser/owner, the level service-role and SECURITY DEFINER use).
  --    Proves the revoke removed a GRANT, not the data.
  check_name := '5. owner-level read of email still returns data';
  SELECT count(*) INTO v_owner_read FROM public.users;               -- table readable
  SELECT count(*) INTO v_with_email FROM public.users WHERE email IS NOT NULL;
  result := CASE WHEN v_owner_read > 0 AND v_with_email > 0
                 THEN 'PASS (' || v_with_email || ' emails readable as owner)'
                 ELSE 'FAIL (owner read blocked or no emails)' END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._tsec5_email_verify();

ROLLBACK;

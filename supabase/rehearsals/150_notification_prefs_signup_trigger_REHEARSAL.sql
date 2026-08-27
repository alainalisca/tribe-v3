-- ============================================================================
-- 150_notification_prefs_signup_trigger_REHEARSAL.sql  --  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 150's body verbatim, verifies it, and ROLLS BACK. ZERO changes persist.
--
-- The SQL Editor shows only the last statement's result and has no Notices
-- panel, so there is NO RAISE NOTICE: every check writes a pass/fail row into a
-- temp table and the final SELECT renders them plus an ALL_CHECKS row.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- HONESTY NOTE ON THE BEHAVIORAL CHECKS (4-6): they perform a REAL insert into
-- auth.users inside the rolled-back transaction, which is the only true
-- end-to-end test of an auth.users trigger. That insert is Supabase-version
-- sensitive: if this project's auth.users has NOT NULL columns beyond the
-- minimal set below, or its own AFTER INSERT triggers with side effects, the
-- insert may error. Each behavioral step is wrapped in its own BEGIN/EXCEPTION,
-- so such an error is recorded as an honest FAILING row carrying the actual
-- SQLERRM. It is never turned into a passing row. If check 4 fails with a
-- missing-column error, add the named column(s) to BOTH insert statements and
-- re-run. The structural checks (1-3) read the catalogs directly and always
-- run regardless.
--
-- What it proves:
--   1. the trigger exists on auth.users, is enabled, and is AFTER INSERT
--      row-level.
--   2. the function is SECURITY DEFINER.
--   3. the deployed function body carries the ON CONFLICT and EXCEPTION guards.
--   4. a simulated signup creates exactly ONE notification_preferences row with
--      the expected default values.
--   5. re-running the trigger's insert for the same user_id does not error and
--      does not duplicate (ON CONFLICT DO NOTHING).
--   6. when the trigger's inner insert WOULD fail, the trigger does not raise:
--      the account is still created and simply has no prefs row.
-- ============================================================================

BEGIN;

-- === MIGRATION 150 BODY (verbatim) =========================================
CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never let a preferences insert failure abort the signup transaction.
    -- A missing row is recoverable; a blocked account creation is not.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_notification_prefs_on_signup ON auth.users;
CREATE TRIGGER create_notification_prefs_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_preferences();
-- ===========================================================================

CREATE TEMP TABLE _checks(ord int, check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

-- 1. Trigger exists, enabled, AFTER INSERT, row-level.
--    pg_trigger.tgtype bits: 1 = row, 2 = before, 4 = insert.
INSERT INTO _checks
SELECT 1, 'trigger_exists_enabled_after_insert_row',
  COALESCE(
    (SELECT 'enabled=' || (t.tgenabled <> 'D')
          || ', row=' || ((t.tgtype & 1) = 1)
          || ', insert=' || ((t.tgtype & 4) = 4)
          || ', before=' || ((t.tgtype & 2) = 2)
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth' AND c.relname = 'users'
        AND t.tgname = 'create_notification_prefs_on_signup'),
    'trigger not found'),
  'enabled=true, row=true, insert=true, before=false',
  EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'auth' AND c.relname = 'users'
       AND t.tgname = 'create_notification_prefs_on_signup'
       AND t.tgenabled <> 'D'
       AND (t.tgtype & 1) = 1
       AND (t.tgtype & 4) = 4
       AND (t.tgtype & 2) = 0
  );

-- 2. Function is SECURITY DEFINER.
INSERT INTO _checks
SELECT 2, 'function_security_definer',
  COALESCE(
    (SELECT 'prosecdef=' || p.prosecdef
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_default_notification_preferences'),
    'function not found'),
  'prosecdef=true',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_default_notification_preferences'
       AND p.prosecdef
  );

-- 3. Deployed function body carries the ON CONFLICT and EXCEPTION guards.
INSERT INTO _checks
SELECT 3, 'function_has_onconflict_and_exception_guards',
  COALESCE(
    (SELECT 'on_conflict=' || (position('ON CONFLICT' IN upper(p.prosrc)) > 0)
          || ', exception=' || (position('EXCEPTION' IN upper(p.prosrc)) > 0)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_default_notification_preferences'),
    'function not found'),
  'on_conflict=true, exception=true',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_default_notification_preferences'
       AND position('ON CONFLICT' IN upper(p.prosrc)) > 0
       AND position('EXCEPTION' IN upper(p.prosrc)) > 0
  );

-- Behavioral checks 4-6. Each step is isolated in its own BEGIN/EXCEPTION so a
-- version-specific auth.users insert failure is recorded honestly, not faked.
DO $$
DECLARE
  v_uid  uuid := gen_random_uuid();
  v_uid2 uuid := gen_random_uuid();
  v_email  text := 'rehearsal_' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
  v_email2 text := 'rehearsal_' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
  v_count int;
  v_defaults_ok boolean;
  v_user_exists boolean;
  v_step4_ok boolean := false;
BEGIN
  -- 4. Simulated signup creates exactly one prefs row with default values.
  BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            v_email, '', now(), now(), '{}'::jsonb, '{}'::jsonb);

    SELECT count(*) INTO v_count FROM notification_preferences WHERE user_id = v_uid;
    SELECT (session_reminders AND session_updates AND social_activity AND messages
            AND training_nudges AND instructor_updates AND challenges AND (NOT marketing)
            AND weekly_recap AND proximity_alerts AND push_enabled AND (NOT email_enabled))
      INTO v_defaults_ok
      FROM notification_preferences WHERE user_id = v_uid;

    v_step4_ok := (v_count = 1 AND COALESCE(v_defaults_ok, false));
    INSERT INTO _checks VALUES (4, 'insert_creates_one_default_row',
      'rows=' || v_count || ', defaults_ok=' || COALESCE(v_defaults_ok::text, 'null'),
      'rows=1, defaults_ok=true', v_step4_ok);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _checks VALUES (4, 'insert_creates_one_default_row',
      'auth.users insert failed: ' || SQLERRM, 'rows=1, defaults_ok=true', false);
  END;

  -- 5. Re-running the trigger's insert for the same user is a no-op, no error.
  BEGIN
    IF NOT v_step4_ok THEN
      INSERT INTO _checks VALUES (5, 'idempotent_no_duplicate',
        'skipped: depends on check 4', 'rows=1, no error', false);
    ELSE
      INSERT INTO notification_preferences (user_id) VALUES (v_uid)
        ON CONFLICT (user_id) DO NOTHING;
      SELECT count(*) INTO v_count FROM notification_preferences WHERE user_id = v_uid;
      INSERT INTO _checks VALUES (5, 'idempotent_no_duplicate',
        'rows=' || v_count || ' after repeat insert', 'rows=1, no error', v_count = 1);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _checks VALUES (5, 'idempotent_no_duplicate',
      'raised: ' || SQLERRM, 'rows=1, no error', false);
  END;

  -- 6. When the inner insert WOULD fail, the trigger must not raise: the account
  --    is still created and simply gets no prefs row. A temporary always-false
  --    CHECK forces the trigger's insert to fail.
  BEGIN
    ALTER TABLE notification_preferences ADD CONSTRAINT _rehearsal_force_fail CHECK (false) NOT VALID;

    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            v_email2, '', now(), now(), '{}'::jsonb, '{}'::jsonb);

    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid2) INTO v_user_exists;
    SELECT count(*) INTO v_count FROM notification_preferences WHERE user_id = v_uid2;

    INSERT INTO _checks VALUES (6, 'no_raise_when_inner_insert_fails',
      'user_created=' || v_user_exists || ', prefs_rows=' || v_count,
      'user_created=true, prefs_rows=0',
      v_user_exists AND v_count = 0);

    ALTER TABLE notification_preferences DROP CONSTRAINT _rehearsal_force_fail;
  EXCEPTION WHEN OTHERS THEN
    -- Reaching here means the auth.users insert itself raised, i.e. the trigger
    -- did NOT swallow the inner failure. That is a real failure of requirement.
    INSERT INTO _checks VALUES (6, 'no_raise_when_inner_insert_fails',
      'raised: ' || SQLERRM, 'user_created=true, prefs_rows=0', false);
    BEGIN
      ALTER TABLE notification_preferences DROP CONSTRAINT _rehearsal_force_fail;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;
END $$;

-- === SINGLE FINAL RESULT SET ===============================================
SELECT check_name, actual, expected, pass
FROM (
  SELECT ord, check_name, actual, expected, pass FROM _checks
  UNION ALL
  SELECT 99, 'ALL_CHECKS',
         (count(*) FILTER (WHERE pass))::text || ' of ' || count(*)::text || ' passed',
         'all true', bool_and(pass)
    FROM _checks
) q
ORDER BY q.ord;

ROLLBACK;

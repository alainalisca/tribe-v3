-- ============================================================================
-- 151_notification_prefs_backfill_REHEARSAL.sql  --  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction,
-- snapshots the table, applies 151's body verbatim (twice, to prove
-- idempotency), verifies, and ROLLS BACK. ZERO changes persist.
--
-- The SQL Editor shows only the last statement's result and has no Notices
-- panel, so there is NO RAISE NOTICE: every check writes a pass/fail row into a
-- temp table and the final SELECT renders them plus an ALL_CHECKS row.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- What it proves:
--   1. after the backfill, ZERO auth users lack a preferences row.
--   2. every newly created row carries the expected defaults (all category
--      flags at their DB defaults, and session_reminders reflecting the legacy
--      merge for that user).
--   3. every user whose legacy column is FALSE has session_reminders = false.
--   4. no OTHER flag changed value for any pre-existing row (snapshot before vs
--      after; session_reminders and updated_at are allowed to change, the other
--      eleven flags must not).
--   5. re-running the migration body a second time changes nothing.
-- ============================================================================

BEGIN;

-- Snapshots BEFORE the backfill.
CREATE TEMP TABLE _pre_ids  ON COMMIT DROP AS SELECT user_id FROM notification_preferences;
CREATE TEMP TABLE _pre_rows ON COMMIT DROP AS SELECT * FROM notification_preferences;

-- === MIGRATION 151 BODY (verbatim) -- run 1 ================================
INSERT INTO public.notification_preferences (user_id)
SELECT a.id FROM auth.users a
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.notification_preferences p
   SET session_reminders = false
  FROM public.users u
 WHERE u.id = p.user_id
   AND u.session_reminders_enabled IS FALSE
   AND p.session_reminders IS DISTINCT FROM false;
-- ===========================================================================

-- Snapshot AFTER run 1.
CREATE TEMP TABLE _post_rows ON COMMIT DROP AS SELECT * FROM notification_preferences;

-- === MIGRATION 151 BODY (verbatim) -- run 2 (idempotency) ==================
INSERT INTO public.notification_preferences (user_id)
SELECT a.id FROM auth.users a
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.notification_preferences p
   SET session_reminders = false
  FROM public.users u
 WHERE u.id = p.user_id
   AND u.session_reminders_enabled IS FALSE
   AND p.session_reminders IS DISTINCT FROM false;
-- ===========================================================================

-- Snapshot AFTER run 2.
CREATE TEMP TABLE _post2_rows ON COMMIT DROP AS SELECT * FROM notification_preferences;

CREATE TEMP TABLE _checks(ord int, check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

-- 1. Zero auth users lack a preferences row.
INSERT INTO _checks
SELECT 1, 'zero_users_missing_pref_row',
       (SELECT count(*)::text FROM auth.users a
          LEFT JOIN notification_preferences p ON p.user_id = a.id
         WHERE p.user_id IS NULL),
       '0',
       NOT EXISTS (SELECT 1 FROM auth.users a
                     LEFT JOIN notification_preferences p ON p.user_id = a.id
                    WHERE p.user_id IS NULL);

-- 2. Every newly created row carries the expected defaults. Non-reminder flags
--    must equal the DB defaults; session_reminders must equal the legacy merge
--    result (false only when the legacy column is false, else true).
INSERT INTO _checks
SELECT 2, 'new_rows_have_expected_defaults',
       (SELECT count(*)::text FROM _post_rows r WHERE r.user_id NOT IN (SELECT user_id FROM _pre_ids))
         || ' new rows, ' ||
       (SELECT count(*)::text FROM _post_rows r
          LEFT JOIN public.users u ON u.id = r.user_id
         WHERE r.user_id NOT IN (SELECT user_id FROM _pre_ids)
           AND ( r.session_updates <> true OR r.social_activity <> true OR r.messages <> true
              OR r.training_nudges <> true OR r.instructor_updates <> true OR r.challenges <> true
              OR r.marketing <> false OR r.weekly_recap <> true OR r.proximity_alerts <> true
              OR r.push_enabled <> true OR r.email_enabled <> false
              OR r.session_reminders <> (CASE WHEN u.session_reminders_enabled IS FALSE THEN false ELSE true END) ))
         || ' deviating',
       '(N new rows), 0 deviating',
       NOT EXISTS (
         SELECT 1 FROM _post_rows r
           LEFT JOIN public.users u ON u.id = r.user_id
          WHERE r.user_id NOT IN (SELECT user_id FROM _pre_ids)
            AND ( r.session_updates <> true OR r.social_activity <> true OR r.messages <> true
               OR r.training_nudges <> true OR r.instructor_updates <> true OR r.challenges <> true
               OR r.marketing <> false OR r.weekly_recap <> true OR r.proximity_alerts <> true
               OR r.push_enabled <> true OR r.email_enabled <> false
               OR r.session_reminders <> (CASE WHEN u.session_reminders_enabled IS FALSE THEN false ELSE true END) )
       );

-- 3. Every legacy-false user has session_reminders = false afterward.
INSERT INTO _checks
SELECT 3, 'legacy_false_users_are_off',
       (SELECT count(*)::text FROM public.users u
          LEFT JOIN notification_preferences p ON p.user_id = u.id
         WHERE u.session_reminders_enabled IS FALSE
           AND (p.user_id IS NULL OR p.session_reminders IS DISTINCT FROM false))
         || ' mismatches',
       '0 mismatches',
       NOT EXISTS (SELECT 1 FROM public.users u
                     LEFT JOIN notification_preferences p ON p.user_id = u.id
                    WHERE u.session_reminders_enabled IS FALSE
                      AND (p.user_id IS NULL OR p.session_reminders IS DISTINCT FROM false));

-- 4. For pre-existing rows, none of the other eleven flags changed value.
--    session_reminders (the intended merge) and updated_at are excluded.
INSERT INTO _checks
SELECT 4, 'preexisting_other_flags_unchanged',
       (SELECT count(*)::text FROM _pre_rows a JOIN _post_rows b ON a.user_id = b.user_id
         WHERE a.session_updates    IS DISTINCT FROM b.session_updates
            OR a.social_activity    IS DISTINCT FROM b.social_activity
            OR a.messages           IS DISTINCT FROM b.messages
            OR a.training_nudges    IS DISTINCT FROM b.training_nudges
            OR a.instructor_updates IS DISTINCT FROM b.instructor_updates
            OR a.challenges         IS DISTINCT FROM b.challenges
            OR a.marketing          IS DISTINCT FROM b.marketing
            OR a.weekly_recap       IS DISTINCT FROM b.weekly_recap
            OR a.proximity_alerts   IS DISTINCT FROM b.proximity_alerts
            OR a.push_enabled       IS DISTINCT FROM b.push_enabled
            OR a.email_enabled      IS DISTINCT FROM b.email_enabled)
         || ' pre-existing rows changed another flag',
       '0 pre-existing rows changed another flag',
       NOT EXISTS (
         SELECT 1 FROM _pre_rows a JOIN _post_rows b ON a.user_id = b.user_id
          WHERE a.session_updates    IS DISTINCT FROM b.session_updates
             OR a.social_activity    IS DISTINCT FROM b.social_activity
             OR a.messages           IS DISTINCT FROM b.messages
             OR a.training_nudges    IS DISTINCT FROM b.training_nudges
             OR a.instructor_updates IS DISTINCT FROM b.instructor_updates
             OR a.challenges         IS DISTINCT FROM b.challenges
             OR a.marketing          IS DISTINCT FROM b.marketing
             OR a.weekly_recap       IS DISTINCT FROM b.weekly_recap
             OR a.proximity_alerts   IS DISTINCT FROM b.proximity_alerts
             OR a.push_enabled       IS DISTINCT FROM b.push_enabled
             OR a.email_enabled      IS DISTINCT FROM b.email_enabled
       );

-- 5. The second run changed nothing: the full table is identical after run 1
--    and run 2 (symmetric difference empty).
INSERT INTO _checks
SELECT 5, 'second_run_is_noop',
       ( (SELECT count(*) FROM (SELECT * FROM _post_rows  EXCEPT SELECT * FROM _post2_rows) x)
       + (SELECT count(*) FROM (SELECT * FROM _post2_rows EXCEPT SELECT * FROM _post_rows)  y) )::text
         || ' rows differ between run 1 and run 2',
       '0 rows differ between run 1 and run 2',
       ( NOT EXISTS (SELECT * FROM _post_rows  EXCEPT SELECT * FROM _post2_rows)
         AND NOT EXISTS (SELECT * FROM _post2_rows EXCEPT SELECT * FROM _post_rows) );

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

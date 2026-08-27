-- ============================================================================
-- 149_proximity_alerts_preference_REHEARSAL.sql  --  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction,
-- snapshots the table's RLS policies, applies 149's body verbatim, snapshots
-- the policies again, verifies the new column, returns a SINGLE final result
-- set, and ROLLS BACK. ZERO changes persist.
--
-- The SQL Editor shows only the last statement's result and has no Notices
-- panel, so there is NO RAISE NOTICE: every check writes a pass/fail row into a
-- temp table and the final SELECT renders them plus an ALL_CHECKS row.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- What it proves:
--   * column_exists: proximity_alerts is present after the add.
--   * type_is_boolean: its data type is boolean.
--   * default_is_true: its column default is true.
--   * is_not_null: it is NOT NULL.
--   * existing_rows_true: every pre-existing row reads true after the add
--     (0 rows are anything other than true).
--   * rls_policies_unchanged: the set of RLS policies on the table is byte for
--     byte identical before and after the add (same count, empty symmetric
--     difference), so the column change touched no policy.
-- ============================================================================

BEGIN;

-- Snapshot the RLS policy set BEFORE the change.
CREATE TEMP TABLE _pol_before ON COMMIT DROP AS
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notification_preferences';

-- === MIGRATION 149 BODY (verbatim) =========================================
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS proximity_alerts BOOLEAN NOT NULL DEFAULT true;
-- ===========================================================================

-- Snapshot the RLS policy set AFTER the change.
CREATE TEMP TABLE _pol_after ON COMMIT DROP AS
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notification_preferences';

CREATE TEMP TABLE _checks(ord int, check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

-- 1. Column exists.
INSERT INTO _checks
SELECT 1, 'column_exists',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notification_preferences'
            AND column_name = 'proximity_alerts'
       ) THEN 'yes' ELSE 'no' END,
       'yes',
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notification_preferences'
            AND column_name = 'proximity_alerts'
       );

-- 2. Type is boolean.
INSERT INTO _checks
SELECT 2, 'type_is_boolean', c.data_type, 'boolean', c.data_type = 'boolean'
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'notification_preferences'
  AND c.column_name = 'proximity_alerts';

-- 3. Default is true.
INSERT INTO _checks
SELECT 3, 'default_is_true', c.column_default, 'true', c.column_default = 'true'
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'notification_preferences'
  AND c.column_name = 'proximity_alerts';

-- 4. Column is NOT NULL.
INSERT INTO _checks
SELECT 4, 'is_not_null', c.is_nullable, 'NO', c.is_nullable = 'NO'
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'notification_preferences'
  AND c.column_name = 'proximity_alerts';

-- 5. Every pre-existing row reads true after the add (0 rows differ from true).
INSERT INTO _checks
SELECT 5, 'existing_rows_true',
       (SELECT count(*) FROM notification_preferences WHERE proximity_alerts IS DISTINCT FROM true)::text,
       '0',
       (SELECT count(*) FROM notification_preferences WHERE proximity_alerts IS DISTINCT FROM true) = 0;

-- 6. The RLS policy set is unchanged: same count and empty symmetric difference.
INSERT INTO _checks
SELECT 6, 'rls_policies_unchanged',
       (SELECT count(*) FROM _pol_after)::text || ' policies, '
         || ( (SELECT count(*) FROM (SELECT * FROM _pol_before EXCEPT SELECT * FROM _pol_after) a)
            + (SELECT count(*) FROM (SELECT * FROM _pol_after EXCEPT SELECT * FROM _pol_before) b) )::text
         || ' diffs',
       (SELECT count(*) FROM _pol_before)::text || ' policies, 0 diffs',
       ( (SELECT count(*) FROM _pol_before) = (SELECT count(*) FROM _pol_after)
         AND NOT EXISTS (SELECT * FROM _pol_before EXCEPT SELECT * FROM _pol_after)
         AND NOT EXISTS (SELECT * FROM _pol_after EXCEPT SELECT * FROM _pol_before) );

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

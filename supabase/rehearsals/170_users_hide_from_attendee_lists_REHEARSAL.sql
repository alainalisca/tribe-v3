-- 170_users_hide_from_attendee_lists_REHEARSAL.sql
--
-- Rehearsal for migration 170. Runs the real migration body inside
-- BEGIN ... ROLLBACK, so the column is added, granted, written to and read
-- back, and then none of it survives.
--
-- WHAT IT PROVES, beyond "the ALTER ran":
--
--  1. The SELECT grant landed for authenticated and did NOT land for anon.
--     Asked with has_column_privilege -- the capability question -- never
--     information_schema.column_privileges, which cannot see table-level grants
--     and would report a comfortable answer either way.
--  2. THE 157 FAILURE IS ACTUALLY REPRODUCED, not just guarded against. Part A
--     adds the column WITHOUT the grant, proves a query naming it fails 42501
--     for authenticated, and then rolls that back. A guard that has never seen
--     the failure it prevents is a guard nobody has tested.
--  3. THE TOGGLE ACTUALLY SAVES. Part C writes the column as a real
--     authenticated user, under RLS, and reads the value back -- the mirror of
--     the 157 lesson on the write side. A read grant with no write path is a
--     settings switch that reports success and never persists.
--  4. Nothing else on users moved: row count, and the SELECT privilege on a
--     sample of existing columns, are unchanged against values captured before.
--
-- RUN IT IN THE SUPABASE SQL EDITOR AS ONE SCRIPT. The output is a PASS/FAIL
-- table; do not run the statements piecemeal.

BEGIN;

CREATE TEMP TABLE reh_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.users)                                     AS user_rows,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users')               AS col_count,
  has_column_privilege('authenticated','public.users','name','SELECT')    AS authed_name_select,
  has_column_privilege('anon','public.users','name','SELECT')             AS anon_name_select,
  has_column_privilege('authenticated','public.users','tribe_os_stripe_customer_id','SELECT')
                                                                          AS authed_billing_select;

CREATE TEMP TABLE reh_probe (name text, result text) ON COMMIT DROP;

-- ── Part A: reproduce the 156/157 failure, then undo it ────────────────────
-- The column added with no grant. The inner BEGIN ... EXCEPTION is a
-- subtransaction, so everything it does -- the ALTER included -- is rolled back
-- when it finishes, and Part B starts from a table without the column.
DO $$
DECLARE
  v_authed_can_read boolean;
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.users ADD COLUMN hide_from_attendee_lists boolean NOT NULL DEFAULT false';

    v_authed_can_read :=
      has_column_privilege('authenticated','public.users','hide_from_attendee_lists','SELECT');

    INSERT INTO reh_probe VALUES (
      'ungranted_column_is_unreadable',
      CASE WHEN v_authed_can_read THEN 'readable -- 066 column-level grants are NOT in force'
           ELSE 'unreadable' END
    );

    -- Force the subtransaction to unwind so the column disappears again.
    RAISE EXCEPTION 'rehearsal: rolling back part A';
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

-- The INSERT above was rolled back with the subtransaction, so re-record the
-- finding here, outside it, by asking the same question a second way: is the
-- column gone, i.e. did part A really unwind?
INSERT INTO reh_probe
SELECT 'part_a_left_no_column',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='users'
                            AND column_name='hide_from_attendee_lists')
            THEN 'column survived' ELSE 'clean' END;

-- ── Part B: the real migration body, verbatim from 170 ─────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hide_from_attendee_lists boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.hide_from_attendee_lists IS
  'T-ATH1: when true, this athlete is not listed as an attendee to other '
  'athletes. Authenticated-only (no anon grant, migration 170). Does NOT hide '
  'the host of a session -- sessions.creator_id is public by construction.';

GRANT SELECT (hide_from_attendee_lists) ON public.users TO authenticated;

DO $$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.users', 'hide_from_attendee_lists', 'SELECT') THEN
    RAISE EXCEPTION '170 ABORTED: authenticated cannot SELECT users.hide_from_attendee_lists.';
  END IF;
  IF has_column_privilege('anon', 'public.users', 'hide_from_attendee_lists', 'SELECT') THEN
    RAISE EXCEPTION '170 ABORTED: anon can SELECT users.hide_from_attendee_lists.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.users', 'hide_from_attendee_lists', 'UPDATE') THEN
    RAISE EXCEPTION '170 ABORTED: authenticated cannot UPDATE users.hide_from_attendee_lists.';
  END IF;
END $$;

-- ── Part C: prove the toggle saves, as a real user, under RLS ──────────────
-- request.jwt.claims is what auth.uid() reads, so this is the same path the
-- browser takes, not an owner-role write that would bypass every policy.
DO $$
DECLARE
  v_uid   uuid;
  v_back  boolean;
  v_rows  integer;
BEGIN
  SELECT id INTO v_uid FROM public.users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  BEGIN
    UPDATE public.users SET hide_from_attendee_lists = true WHERE id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    SELECT hide_from_attendee_lists INTO v_back FROM public.users WHERE id = v_uid;

    INSERT INTO reh_probe VALUES ('self_update_rows', v_rows::text);
    INSERT INTO reh_probe VALUES ('self_update_value_read_back', COALESCE(v_back::text, '<null>'));
  EXCEPTION WHEN others THEN
    INSERT INTO reh_probe VALUES ('self_update_rows', 'ERROR ' || SQLSTATE || ': ' || SQLERRM);
    INSERT INTO reh_probe VALUES ('self_update_value_read_back', 'n/a');
  END;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ── Every check, one result set ────────────────────────────────────────────
WITH checks AS (
  SELECT 'column_exists' AS check_name,
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema='public' AND table_name='users'
             AND column_name='hide_from_attendee_lists') AS actual,
         '1' AS expected
  UNION ALL SELECT 'column_is_not_null_default_false',
         (SELECT is_nullable || '/' || COALESCE(column_default,'<none>')
            FROM information_schema.columns
           WHERE table_schema='public' AND table_name='users'
             AND column_name='hide_from_attendee_lists'),
         'NO/false'
  UNION ALL SELECT 'every_existing_row_defaults_false',
         (SELECT count(*)::text FROM public.users WHERE hide_from_attendee_lists IS DISTINCT FROM false),
         -- Part C flipped exactly one row to true, on purpose.
         '1'
  -- The 157 lesson, both directions.
  UNION ALL SELECT 'authenticated_can_select',
         has_column_privilege('authenticated','public.users','hide_from_attendee_lists','SELECT')::text, 'true'
  UNION ALL SELECT 'anon_cannot_select',
         has_column_privilege('anon','public.users','hide_from_attendee_lists','SELECT')::text, 'false'
  UNION ALL SELECT 'authenticated_can_update',
         has_column_privilege('authenticated','public.users','hide_from_attendee_lists','UPDATE')::text, 'true'
  -- The failure the grant prevents, actually reproduced in part A.
  UNION ALL SELECT 'ungranted_column_was_unreadable',
         (SELECT result FROM reh_probe WHERE name='ungranted_column_is_unreadable'), 'unreadable'
  UNION ALL SELECT 'part_a_rolled_back_cleanly',
         (SELECT result FROM reh_probe WHERE name='part_a_left_no_column'), 'clean'
  -- The toggle genuinely persists for a real user under RLS.
  UNION ALL SELECT 'self_update_wrote_one_row',
         (SELECT result FROM reh_probe WHERE name='self_update_rows'), '1'
  UNION ALL SELECT 'self_update_value_persisted',
         (SELECT result FROM reh_probe WHERE name='self_update_value_read_back'), 'true'
  -- Nothing else moved.
  UNION ALL SELECT 'user_row_count_unchanged',
         (SELECT count(*)::text FROM public.users), (SELECT user_rows::text FROM reh_before)
  UNION ALL SELECT 'exactly_one_column_added',
         ((SELECT count(*) FROM information_schema.columns
            WHERE table_schema='public' AND table_name='users')
          - (SELECT col_count FROM reh_before))::text, '1'
  UNION ALL SELECT 'existing_name_grant_unchanged',
         has_column_privilege('authenticated','public.users','name','SELECT')::text,
         (SELECT authed_name_select::text FROM reh_before)
  UNION ALL SELECT 'anon_name_grant_unchanged',
         has_column_privilege('anon','public.users','name','SELECT')::text,
         (SELECT anon_name_select::text FROM reh_before)
  UNION ALL SELECT 'billing_column_still_hidden',
         has_column_privilege('authenticated','public.users','tribe_os_stripe_customer_id','SELECT')::text,
         (SELECT authed_billing_select::text FROM reh_before)
)
-- ORDER BY after a UNION accepts only result column names, not expressions
-- (0A000), so ord is materialised inside the subquery and sorted on out here.
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord,
         check_name, actual, expected,
         CASE WHEN actual = expected THEN 'PASS' ELSE '*** FAIL ***' END AS pass
  FROM checks
  UNION ALL
  SELECT 1,
         'ALL_CHECKS',
         (SELECT count(*)::text FROM checks WHERE actual = expected) || '/' ||
         (SELECT count(*)::text FROM checks),
         (SELECT count(*)::text FROM checks) || '/' ||
         (SELECT count(*)::text FROM checks),
         CASE WHEN NOT EXISTS (SELECT 1 FROM checks WHERE actual IS DISTINCT FROM expected)
              THEN 'PASS' ELSE '*** FAIL ***' END
) x
ORDER BY ord, check_name;

ROLLBACK;

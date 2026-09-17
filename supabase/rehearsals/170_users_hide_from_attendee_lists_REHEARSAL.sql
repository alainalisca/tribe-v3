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
-- RULE LEARNED THE HARD WAY, 2026-09-17. NOTHING running under the
-- `authenticated` role may touch the rehearsal's own scaffolding. The first
-- version of Part C wrote its results into reh_probe while still impersonating
-- the user, and reh_probe is a temp table owned by postgres -- so the write
-- failed with 42501, on the SUCCESS path as well as in the handler, and the
-- handler's own INSERT then aborted the entire script.
--
-- That bug was not merely noisy, it was BLINDING: because both the success path
-- and the error path died the same way, the failure could not distinguish "the
-- UPDATE was denied" from "the bookkeeping INSERT was denied". The real reason
-- was swallowed by a secondary failure in the thing meant to record it.
--
-- So Part C now: captures everything into plpgsql variables, restores the role,
-- and only then writes to reh_probe. It also wraps the UPDATE and the read-back
-- in SEPARATE subtransactions and records each one's SQLSTATE and SQLERRM, so a
-- failure names which statement failed and why instead of collapsing into one
-- opaque 'ERROR'. And it records what auth.uid() actually resolved to under the
-- impersonation -- because if that comes back NULL the RLS policy simply matches
-- no rows, which is a SILENT zero-row update, not an error at all.
--
-- THE RULE BOTH PART A AND PART C HAD TO LEARN, stated once: a rehearsal's
-- recording mechanism must outlive the thing it observes. Part C wrote its
-- results while impersonating a role that could not write them; Part A wrote its
-- result inside a subtransaction it then deliberately threw away. Both lost the
-- answer in the act of recording it. Findings are captured into plpgsql
-- variables and written to reh_probe only once the role is restored and the
-- subtransaction has unwound. Every probe-backed check below also COALESCEs a
-- missing row to '(probe row missing)', so "the check could not report" is
-- visibly different from "the check reported the wrong value" -- a NULL reads as
-- a FAIL and hides which of the two happened.
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
-- THE RECORDING RULE, same one Part C had to learn: the finding is captured into
-- a plpgsql VARIABLE declared outside the subtransaction, and written to
-- reh_probe only after that subtransaction has unwound. PostgreSQL's documented
-- behaviour makes this work -- when an error is caught by an EXCEPTION clause,
-- "the local variables of the PL/pgSQL function remain as they were when the
-- error occurred, but all persistent database state within the block is rolled
-- back". An INSERT is persistent database state. A variable is not.
--
-- The first version wrote the finding INSIDE the block and then deliberately
-- unwound it, so the probe row vanished with the ALTER and the check read NULL.
-- That is worse than having no check at all: NULL renders as a FAIL, so it looks
-- like the migration misbehaved while actually saying nothing about it either
-- way.
DO $$
DECLARE
  v_authed_can_read boolean;
  v_result          text := '(not reached -- the ALTER never ran)';
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.users ADD COLUMN hide_from_attendee_lists boolean NOT NULL DEFAULT false';

    v_authed_can_read :=
      has_column_privilege('authenticated','public.users','hide_from_attendee_lists','SELECT');

    v_result := CASE WHEN v_authed_can_read
                     THEN 'readable -- 066 column-level grants are NOT in force'
                     ELSE 'unreadable' END;

    -- Force the subtransaction to unwind so the column disappears again.
    RAISE EXCEPTION 'rehearsal: rolling back part A';
  EXCEPTION WHEN others THEN
    -- Our own raise is the expected exit. Anything else is a real failure of
    -- the ALTER or the privilege probe, and must be surfaced rather than
    -- swallowed -- otherwise this handler becomes the next thing that hides a
    -- cause.
    IF SQLERRM <> 'rehearsal: rolling back part A' THEN
      v_result := 'UNEXPECTED ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;

  -- Outside the unwound subtransaction, so this survives.
  INSERT INTO reh_probe VALUES ('ungranted_column_is_unreadable', v_result);
END $$;

-- An independent second question, asked from out here: did Part A really unwind?
-- The check above reports what the privilege WAS while the ungranted column
-- existed; this one reports that the column is gone again, so Part B starts from
-- a clean table. Two separate facts, deliberately not inferred from each other.
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

-- Captured BEFORE Part C writes anything, so "the DEFAULT reached every row"
-- and "the toggle saved" stay separate questions. Conflating them was how the
-- first draft ended up with a check whose expected value was 1 because of a
-- side effect three statements away.
INSERT INTO reh_probe
SELECT 'rows_not_false_after_alter',
       (SELECT count(*)::text FROM public.users WHERE hide_from_attendee_lists IS DISTINCT FROM false);

-- ── Part C: prove the toggle saves, as a real user, under RLS ──────────────
-- request.jwt.claims is what auth.uid() reads, so this is the same path the
-- browser takes, not an owner-role write that would bypass every policy.
--
-- STRUCTURE MATTERS HERE. The UPDATE and the read-back sit in their own
-- subtransactions and NOTHING else shares them, so a raise can only mean that
-- statement. All results land in variables; reh_probe is written only after the
-- role has been restored. See the header for why.
DO $$
DECLARE
  v_uid         uuid;
  v_orig_role   text;
  v_auth_uid    text := '(not reached)';
  v_rows_txt    text := '(not reached)';
  v_back_txt    text := '(not reached)';
  v_upd_state   text := 'ok';
  v_upd_msg     text := '(none)';
  v_read_state  text := 'ok';
  v_read_msg    text := '(none)';
  v_rows        integer;
  v_back        boolean;
BEGIN
  SELECT id INTO v_uid FROM public.users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

  -- Save whatever role we are actually running as; 'none' when unset. Restoring
  -- this exact value is safer than assuming the session user is postgres.
  v_orig_role := current_setting('role');

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- What the database thinks the caller is. If this is NULL the self-update RLS
  -- policy matches nothing and the UPDATE reports ZERO ROWS WITHOUT RAISING --
  -- a silent no-op that looks identical to a permission problem unless it is
  -- recorded here.
  BEGIN
    v_auth_uid := COALESCE(auth.uid()::text, '<null>');
  EXCEPTION WHEN others THEN
    v_auth_uid := 'ERROR ' || SQLSTATE;
  END;

  -- The UPDATE, alone.
  BEGIN
    UPDATE public.users SET hide_from_attendee_lists = true WHERE id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_rows_txt := v_rows::text;
  EXCEPTION WHEN others THEN
    v_upd_state := SQLSTATE;
    v_upd_msg   := SQLERRM;
    v_rows_txt  := 'RAISED';
  END;

  -- The read-back, alone.
  BEGIN
    SELECT hide_from_attendee_lists INTO v_back FROM public.users WHERE id = v_uid;
    v_back_txt := COALESCE(v_back::text, '<null>');
  EXCEPTION WHEN others THEN
    v_read_state := SQLSTATE;
    v_read_msg   := SQLERRM;
    v_back_txt   := 'RAISED';
  END;

  -- Back to the owning role BEFORE touching any rehearsal scaffolding.
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role', v_orig_role, true);

  INSERT INTO reh_probe VALUES ('self_update_auth_uid',
    CASE WHEN v_auth_uid = v_uid::text THEN 'matches' ELSE v_auth_uid END);
  INSERT INTO reh_probe VALUES ('self_update_rows', v_rows_txt);
  INSERT INTO reh_probe VALUES ('self_update_value_read_back', v_back_txt);
  INSERT INTO reh_probe VALUES ('self_update_sqlstate', v_upd_state);
  INSERT INTO reh_probe VALUES ('self_update_sqlerrm', v_upd_msg);
  INSERT INTO reh_probe VALUES ('self_read_sqlstate', v_read_state);
  INSERT INTO reh_probe VALUES ('self_read_sqlerrm', v_read_msg);
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
  -- Measured straight after the ALTER, before Part C writes anything, so this
  -- asks only "did the DEFAULT reach every row".
  UNION ALL SELECT 'default_reached_every_row',
         COALESCE((SELECT result FROM reh_probe WHERE name='rows_not_false_after_alter'), '(probe row missing)'), '0'
  -- And afterwards exactly one row is true: the one Part C flipped.
  UNION ALL SELECT 'exactly_one_row_true_after_part_c',
         (SELECT count(*)::text FROM public.users WHERE hide_from_attendee_lists), '1'
  -- The 157 lesson, both directions.
  UNION ALL SELECT 'authenticated_can_select',
         has_column_privilege('authenticated','public.users','hide_from_attendee_lists','SELECT')::text, 'true'
  UNION ALL SELECT 'anon_cannot_select',
         has_column_privilege('anon','public.users','hide_from_attendee_lists','SELECT')::text, 'false'
  UNION ALL SELECT 'authenticated_can_update',
         has_column_privilege('authenticated','public.users','hide_from_attendee_lists','UPDATE')::text, 'true'
  -- The failure the grant prevents, actually reproduced in part A.
  UNION ALL SELECT 'ungranted_column_was_unreadable',
         COALESCE((SELECT result FROM reh_probe WHERE name='ungranted_column_is_unreadable'), '(probe row missing)'), 'unreadable'
  UNION ALL SELECT 'part_a_rolled_back_cleanly',
         COALESCE((SELECT result FROM reh_probe WHERE name='part_a_left_no_column'), '(probe row missing)'), 'clean'
  -- The toggle genuinely persists for a real user under RLS.
  UNION ALL SELECT 'self_update_wrote_one_row',
         COALESCE((SELECT result FROM reh_probe WHERE name='self_update_rows'), '(probe row missing)'), '1'
  UNION ALL SELECT 'self_update_value_persisted',
         COALESCE((SELECT result FROM reh_probe WHERE name='self_update_value_read_back'), '(probe row missing)'), 'true'
  -- THE DIAGNOSTICS. These carry the answer when the three checks above fail,
  -- instead of leaving a bare "0 rows" to be guessed at. auth.uid() resolving to
  -- NULL is a silent zero-row update; a real SQLSTATE is a denial. They are
  -- different problems with different fixes.
  UNION ALL SELECT 'self_update_auth_uid_resolved',
         COALESCE((SELECT result FROM reh_probe WHERE name='self_update_auth_uid'), '(probe row missing)'), 'matches'
  UNION ALL SELECT 'self_update_raised_nothing',
         COALESCE((SELECT result FROM reh_probe WHERE name='self_update_sqlstate'), '(probe row missing)'), 'ok'
  UNION ALL SELECT 'self_update_error_text',
         COALESCE((SELECT result FROM reh_probe WHERE name='self_update_sqlerrm'), '(probe row missing)'), '(none)'
  UNION ALL SELECT 'self_read_raised_nothing',
         COALESCE((SELECT result FROM reh_probe WHERE name='self_read_sqlstate'), '(probe row missing)'), 'ok'
  UNION ALL SELECT 'self_read_error_text',
         COALESCE((SELECT result FROM reh_probe WHERE name='self_read_sqlerrm'), '(probe row missing)'), '(none)'
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

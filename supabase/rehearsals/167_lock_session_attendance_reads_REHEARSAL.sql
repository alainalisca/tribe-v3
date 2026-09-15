-- ============================================================================
-- 167_lock_session_attendance_reads_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Snapshots the current state,
-- applies 167 verbatim, proves the leak is closed AND every surviving read path
-- still works, returns a SINGLE final result set, and ROLLS BACK.
-- ZERO changes persist.
--
-- No RAISE NOTICE anywhere in the checks: the SQL Editor shows only the last
-- statement's result and has no Notices panel, so every assertion is folded
-- into ALL_CHECKS below. Columns: check_name | actual | expected | pass.
--
-- SIMULATING auth.uid(): set_config on the request JWT claim GUCs, the same
-- technique as the 152/154 rehearsals. The read proofs additionally
-- SET LOCAL ROLE so real RLS and real grants apply. auth.uid() reads the GUC
-- regardless of the current role, so under (role authenticated + GUC = uid)
-- the SELECT policy evaluates for that uid.
--
-- What it proves:
--   * open_read_policy_gone            "Anyone can view attendance" removed
--   * new_select_policy_present        sa_select_own_or_host exists
--   * new_select_policy_authed_only    it is TO authenticated, not public
--   * hardcoded_email_policy_gone      no policy predicate names the address
--   * admin_policy_uses_helper         sa_admin_manage calls is_app_admin()
--   * insert_policy_unchanged          byte-identical with_check before/after
--   * update_policy_unchanged          byte-identical qual before/after
--   * no_delete_policy_still           deletes stay RLS default-denied
--   * anon_has_zero_privileges         incl. TRUNCATE, REFERENCES, TRIGGER
--   * authenticated_privileges_exact   exactly SELECT, INSERT, UPDATE
--   * truncate_held_by_no_client_role  TRUNCATE escapes RLS; its own check
--   * service_role_grants_intact       the followups cron still reads the table
--   * row_count_unchanged              the migration touches no data
--   * owner_can_read_own_row           the streak/badge path survives
--   * host_can_read_session_rows       the AttendanceTracker path survives
--   * stranger_sees_zero_rows          cross-user read is closed
--   * anon_sees_zero_rows              THE LEAK, proved closed
--
-- FIXTURE DEPENDENCY: at least one session_attendance row whose user_id is NOT
-- NULL and whose session has a creator who is not that same user, plus one
-- non-admin third user. If the database cannot supply that, the guard checks
-- below fail, ALL_CHECKS fails, and nothing is faked. Everything rolls back.
--
-- PREREQ: 166 (capture) applied first. This rehearsal does not depend on 166
-- functionally -- it operates on the live table -- but running 167 for real
-- before 166 leaves the repo unable to rebuild what it just modified.
-- ============================================================================

BEGIN;

-- ── FIXTURES: pick a real triple from live data, no inserts ────────────────
CREATE TEMP TABLE fx ON COMMIT DROP AS
SELECT sa.id            AS attendance_id,
       sa.session_id    AS session_id,
       sa.user_id       AS athlete_id,
       s.creator_id     AS host_id
FROM public.session_attendance sa
JOIN public.sessions s ON s.id = sa.session_id
WHERE sa.user_id IS NOT NULL
  AND s.creator_id IS NOT NULL
  AND s.creator_id <> sa.user_id
LIMIT 1;

-- A third party who is neither the athlete nor the host, and not an admin.
CREATE TEMP TABLE fx_stranger ON COMMIT DROP AS
SELECT u.id AS stranger_id
FROM public.users u
WHERE u.is_admin IS NOT TRUE
  AND u.deleted_at IS NULL
  AND u.id NOT IN (SELECT athlete_id FROM fx UNION SELECT host_id FROM fx)
LIMIT 1;

-- ── SNAPSHOT: before-state, so "unchanged" is a comparison not a claim ────
CREATE TEMP TABLE before_policies ON COMMIT DROP AS
SELECT policyname, cmd, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'session_attendance';

CREATE TEMP TABLE before_counts ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.session_attendance) AS n_rows;

-- ============================================================================
-- APPLY 167 VERBATIM (comments stripped; statements identical)
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view attendance" ON public.session_attendance;

DROP POLICY IF EXISTS "sa_select_own_or_host" ON public.session_attendance;
CREATE POLICY "sa_select_own_or_host"
  ON public.session_attendance
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_attendance.session_id
        AND s.creator_id = auth.uid()
    )
    OR public.is_app_admin()
  );

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_attendance'
      AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%aplusfitnessllc.com%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.session_attendance', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "sa_admin_manage" ON public.session_attendance;
CREATE POLICY "sa_admin_manage"
  ON public.session_attendance
  FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.session_attendance FROM anon;
REVOKE ALL ON public.session_attendance FROM authenticated;
REVOKE ALL ON public.session_attendance FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.session_attendance TO authenticated;

-- ============================================================================
-- FUNCTIONAL PROOFS — real role, real RLS, results captured for the summary
-- ============================================================================

CREATE TEMP TABLE proofs (name text, n bigint) ON COMMIT DROP;

-- 1. The athlete reads their own row (StreakBanner / AchievementBadges path).
DO $$
DECLARE v_uid uuid; v_n bigint;
BEGIN
  SELECT athlete_id INTO v_uid FROM fx;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.session_attendance WHERE user_id = v_uid;
  RESET ROLE;
  INSERT INTO proofs VALUES ('owner_rows', v_n);
END $$;

-- 2. The host reads the rows on their own session (AttendanceTracker path).
DO $$
DECLARE v_uid uuid; v_sid uuid; v_n bigint;
BEGIN
  SELECT host_id, session_id INTO v_uid, v_sid FROM fx;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.session_attendance WHERE session_id = v_sid;
  RESET ROLE;
  INSERT INTO proofs VALUES ('host_rows', v_n);
END $$;

-- 3. A stranger sees nothing.
DO $$
DECLARE v_uid uuid; v_n bigint;
BEGIN
  SELECT stranger_id INTO v_uid FROM fx_stranger;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.session_attendance;
  RESET ROLE;
  INSERT INTO proofs VALUES ('stranger_rows', v_n);
END $$;

-- 4. THE LEAK: anon sees nothing. Wrapped because after REVOKE ALL the SELECT
--    raises 42501 rather than returning 0 -- which is a stronger pass than an
--    empty result, so both outcomes are recorded as 0 and distinguished by
--    anon_mode.
DO $$
DECLARE v_n bigint; v_mode text;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n FROM public.session_attendance;
    v_mode := 'rls_zero_rows';
  EXCEPTION WHEN insufficient_privilege THEN
    v_n := 0;
    v_mode := 'grant_denied';
  END;
  RESET ROLE;
  INSERT INTO proofs VALUES ('anon_rows', v_n);
  INSERT INTO proofs VALUES ('anon_mode_grant_denied', CASE WHEN v_mode = 'grant_denied' THEN 1 ELSE 0 END);
END $$;

-- ============================================================================
-- ALL CHECKS — ONE result set. The SQL Editor shows only this.
-- ============================================================================
WITH after_policies AS (
  SELECT policyname, cmd, roles::text AS roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'session_attendance'
),
-- DISTINCT in both: role_table_grants returns one row per (grantor, grantee,
-- privilege), so a privilege granted by two roles would otherwise be counted
-- twice and the exact-match check would fail for the wrong reason.
anon_privs AS (
  SELECT count(*)::int AS n
  FROM (SELECT DISTINCT privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'session_attendance'
          AND grantee = 'anon') d
),
authed_privs AS (
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) AS p
  FROM (SELECT DISTINCT privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'session_attendance'
          AND grantee = 'authenticated') d
),
-- TRUNCATE is the only privilege in this set that escapes RLS, so it gets its
-- own check rather than being folded into the exact-match above. A policy fix
-- that leaves TRUNCATE granted has not closed the table.
truncate_holders AS (
  SELECT COALESCE(string_agg(DISTINCT grantee, ',' ORDER BY grantee), '<none>') AS g
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'session_attendance'
    AND privilege_type = 'TRUNCATE'
    AND grantee IN ('anon', 'authenticated')
),
-- service_role must keep its grants: it bypasses RLS by design and is how the
-- post-session-followups cron reads this table.
service_privs AS (
  SELECT count(*)::int AS n
  FROM (SELECT DISTINCT privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'session_attendance'
          AND grantee = 'service_role') d
),
checks(check_name, actual, expected) AS (
  SELECT 'fixture_triple_found',
         (SELECT count(*)::text FROM fx), '1'
  UNION ALL SELECT 'fixture_stranger_found',
         (SELECT count(*)::text FROM fx_stranger), '1'
  UNION ALL SELECT 'open_read_policy_gone',
         (SELECT count(*)::text FROM after_policies WHERE policyname = 'Anyone can view attendance'), '0'
  UNION ALL SELECT 'new_select_policy_present',
         (SELECT count(*)::text FROM after_policies WHERE policyname = 'sa_select_own_or_host' AND cmd = 'SELECT'), '1'
  UNION ALL SELECT 'new_select_policy_authed_only',
         (SELECT roles FROM after_policies WHERE policyname = 'sa_select_own_or_host'), '{authenticated}'
  UNION ALL SELECT 'hardcoded_email_policy_gone',
         (SELECT count(*)::text FROM after_policies
           WHERE (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) LIKE '%aplusfitnessllc.com%'), '0'
  UNION ALL SELECT 'admin_policy_uses_helper',
         (SELECT count(*)::text FROM after_policies
           WHERE policyname = 'sa_admin_manage' AND qual LIKE '%is_app_admin%'), '1'
  -- The 166 capture showed the live admin policy is FOR ALL. The replacement
  -- must preserve that scope exactly: narrower silently removes admin write
  -- reach, wider grants it where it did not exist.
  UNION ALL SELECT 'admin_policy_still_for_all',
         (SELECT cmd FROM after_policies WHERE policyname = 'sa_admin_manage'), 'ALL'
  UNION ALL SELECT 'insert_policy_unchanged',
         (SELECT count(*)::text FROM before_policies b JOIN after_policies a USING (policyname)
           WHERE b.cmd = 'INSERT' AND COALESCE(b.with_check,'') = COALESCE(a.with_check,''))::text,
         (SELECT count(*)::text FROM before_policies WHERE cmd = 'INSERT')
  UNION ALL SELECT 'update_policy_unchanged',
         (SELECT count(*)::text FROM before_policies b JOIN after_policies a USING (policyname)
           WHERE b.cmd = 'UPDATE' AND COALESCE(b.qual,'') = COALESCE(a.qual,''))::text,
         (SELECT count(*)::text FROM before_policies WHERE cmd = 'UPDATE')
  UNION ALL SELECT 'no_delete_policy_still',
         (SELECT count(*)::text FROM after_policies WHERE cmd = 'DELETE'), '0'
  UNION ALL SELECT 'anon_has_zero_privileges',
         (SELECT n::text FROM anon_privs), '0'
  UNION ALL SELECT 'authenticated_privileges_exact',
         (SELECT COALESCE(p,'<none>') FROM authed_privs), 'INSERT,SELECT,UPDATE'
  UNION ALL SELECT 'truncate_held_by_no_client_role',
         (SELECT g FROM truncate_holders), '<none>'
  UNION ALL SELECT 'service_role_grants_intact',
         (SELECT n::text FROM service_privs), '7'
  UNION ALL SELECT 'row_count_unchanged',
         (SELECT count(*)::text FROM public.session_attendance),
         (SELECT n_rows::text FROM before_counts)
  UNION ALL SELECT 'owner_can_read_own_row',
         (SELECT CASE WHEN n > 0 THEN 'yes' ELSE 'no' END FROM proofs WHERE name = 'owner_rows'), 'yes'
  UNION ALL SELECT 'host_can_read_session_rows',
         (SELECT CASE WHEN n > 0 THEN 'yes' ELSE 'no' END FROM proofs WHERE name = 'host_rows'), 'yes'
  UNION ALL SELECT 'stranger_sees_zero_rows',
         (SELECT n::text FROM proofs WHERE name = 'stranger_rows'), '0'
  UNION ALL SELECT 'anon_sees_zero_rows',
         (SELECT n::text FROM proofs WHERE name = 'anon_rows'), '0'
  UNION ALL SELECT 'anon_denied_at_grant_level',
         (SELECT n::text FROM proofs WHERE name = 'anon_mode_grant_denied'), '1'
)
-- The sort key is a plain column of the subquery, not an expression over the
-- UNION output. Postgres allows only result column names in an ORDER BY that
-- follows UNION -- "Only result column names can be used, not expressions or
-- functions" (0A000) -- so the ord column is materialised inside the subquery
-- and sorted on out here.
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord,
         check_name,
         actual,
         expected,
         CASE WHEN actual = expected THEN 'PASS' ELSE '*** FAIL ***' END AS pass
  FROM checks
  UNION ALL
  -- No FROM on this branch: the three scalar subqueries make it a single row.
  -- A FROM checks here would emit one roll-up row per check.
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

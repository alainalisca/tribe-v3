-- ============================================================================
-- 168_revoke_users_location_from_anon_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Snapshots the grant state,
-- applies 168 verbatim, proves the barrio is closed to anon AND that every
-- surface which must keep working still can, returns a SINGLE final result set,
-- and ROLLS BACK. ZERO changes persist.
--
-- No RAISE NOTICE anywhere: the SQL Editor shows only the last statement's
-- result and has no Notices panel, so every assertion is folded into ALL_CHECKS.
-- Columns: check_name | actual | expected | pass.
--
-- has_column_privilege / has_table_privilege throughout, never
-- information_schema.column_privileges. The capability question is "can this
-- role read this column"; the information_schema view answers "is there a row
-- saying so", which is a different question that passes either way. Same rule
-- migration 159 and the verifier follow.
--
-- What it proves:
--   * anon_loses_location              the exposure, closed
--   * anon_keeps_id / name / avatar     the share page's other columns survive
--   * anon_keeps_bio / instructor_bio
--   * anon_keeps_sports / avg_rating    -> together these are exactly the
--                                          generateMetadata select, so OG cards
--                                          and WhatsApp previews are proved
--                                          unaffected, not assumed
--   * anon_can_still_read_users_rows    a live SELECT as role anon, not a
--                                          privilege lookup
--   * anon_location_select_now_fails    a live SELECT naming location as role
--                                          anon RAISES -- the 401 the app sees
--   * authenticated_keeps_location      /storefront, /instructors,
--                                          ExploreCitySection, leadDiscovery,
--                                          admin, and fetchUserProfile on the
--                                          Dynamic /profile/[userId] all survive
--   * discoverable_unaffected           users_discoverable is owner-executed
--   * row_count_unchanged               a grant change touches no data
--
-- ORDERING. 168 was written first and HELD, so it now lands AFTER 169 and 170,
-- both of which are already applied. Nothing in this file depends on that order:
-- it is one REVOKE on one column, the verifier entry is keyed by name not
-- position, and the numbering is unchanged. The one thing the reordering did
-- change is that public.users has gained a column since 168 was written --
-- hide_from_attendee_lists, added by 170 and deliberately never granted to anon
-- -- so this rehearsal now also asserts that it is still denied, since the
-- Supabase default-grant trap has re-granted anon on object changes four times
-- in this project's history.
--
-- PREMISE RE-MEASURED AGAINST PRODUCTION 2026-09-17T11:22Z, not carried over
-- from when the file was written:
--   public.users columns ....................................... 101
--   anon-readable ............................................... 84
--   denied to anon .............................................. 17
--   `location` still anon-readable .............................. YES
-- So the exposure this migration closes is still open, and the precheck below
-- fails loudly if that ever stops being true.
--
-- This rehearsal does NOT and CANNOT prove Gate 0 shipped. That is a deployed-
-- code fact, checked in a logged-out browser against a real /i/[id] URL plus a
-- WhatsApp preview. A green run here with Gate 0 unshipped still means a blank
-- public page the moment 168 is applied for real.
-- ============================================================================

BEGIN;

-- ── SNAPSHOT ───────────────────────────────────────────────────────────────
CREATE TEMP TABLE before_state ON COMMIT DROP AS
SELECT has_column_privilege('anon', 'public.users', 'location', 'SELECT') AS anon_location,
       has_column_privilege('authenticated', 'public.users', 'location', 'SELECT') AS authed_location,
       (SELECT count(*) FROM public.users) AS n_rows,
       -- How many columns anon can read AT ALL, so the revoke can be shown to be
       -- surgical rather than merely effective. Measured 84 on 2026-09-17; the
       -- check asserts the DELTA, not the absolute, so it survives the table
       -- gaining columns.
       (SELECT count(*) FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = 'users'
           AND has_column_privilege('anon', 'public.users', c.column_name, 'SELECT'))
         AS anon_readable_cols;

-- ============================================================================
-- APPLY 168 VERBATIM
-- ============================================================================
REVOKE SELECT (location) ON public.users FROM anon;

-- ============================================================================
-- FUNCTIONAL PROOFS — real role, real grants
-- ============================================================================
CREATE TEMP TABLE proofs (name text, v text) ON COMMIT DROP;

-- 1. anon can still read the columns the public share page and its OG metadata
--    actually select. A privilege lookup would be enough, but this runs the
--    real query as the real role so a surprise (an RLS policy appearing, a
--    dependent view) shows up here rather than in production.
DO $$
DECLARE v_n bigint;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n
  FROM (SELECT id, name, avatar_url, bio, instructor_bio, sports, average_rating
        FROM public.users LIMIT 5) s;
  RESET ROLE;
  INSERT INTO proofs VALUES ('anon_metadata_select_rows', v_n::text);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO proofs VALUES ('anon_metadata_select_rows', 'RAISED: ' || SQLSTATE);
END $$;

-- 2. THE EXPOSURE: a select naming location must now fail for anon. Expect
--    42501. Recording the SQLSTATE rather than a boolean so a DIFFERENT error
--    (a typo, a missing table) cannot be mistaken for the intended denial.
DO $$
DECLARE v_n bigint;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n FROM (SELECT location FROM public.users LIMIT 1) s;
  RESET ROLE;
  INSERT INTO proofs VALUES ('anon_location_select', 'SUCCEEDED -- still readable');
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE;
  INSERT INTO proofs VALUES ('anon_location_select', '42501');
WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO proofs VALUES ('anon_location_select', 'RAISED: ' || SQLSTATE);
END $$;

-- 3. authenticated must still read location: every remaining reader is an
--    authenticated surface.
DO $$
DECLARE v_n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM (SELECT id, location FROM public.users LIMIT 5) s;
  RESET ROLE;
  INSERT INTO proofs VALUES ('authed_location_select_rows', v_n::text);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO proofs VALUES ('authed_location_select_rows', 'RAISED: ' || SQLSTATE);
END $$;

-- 4. users_discoverable is owner-executed, so the revoke must not reach it.
DO $$
DECLARE v_n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM (SELECT location FROM public.users_discoverable LIMIT 5) s;
  RESET ROLE;
  INSERT INTO proofs VALUES ('discoverable_location_rows', v_n::text);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO proofs VALUES ('discoverable_location_rows', 'RAISED: ' || SQLSTATE);
END $$;

-- ============================================================================
-- ALL CHECKS — ONE result set. The SQL Editor shows only this.
-- ============================================================================
WITH checks(check_name, actual, expected) AS (
  -- Guard: if the before-state already had anon without location, this whole
  -- run proves nothing, because the "after" state would be identical.
  SELECT 'precheck_anon_had_location_before',
         (SELECT anon_location::text FROM before_state), 'true'
  UNION ALL SELECT 'precheck_authed_had_location_before',
         (SELECT authed_location::text FROM before_state), 'true'

  -- The exposure, closed.
  UNION ALL SELECT 'anon_loses_location',
         has_column_privilege('anon', 'public.users', 'location', 'SELECT')::text, 'false'
  UNION ALL SELECT 'anon_location_select_now_denied',
         (SELECT v FROM proofs WHERE name = 'anon_location_select'), '42501'

  -- The public share page's remaining columns, one per check so a failure names
  -- the column rather than a set.
  UNION ALL SELECT 'anon_keeps_id',
         has_column_privilege('anon', 'public.users', 'id', 'SELECT')::text, 'true'
  UNION ALL SELECT 'anon_keeps_name',
         has_column_privilege('anon', 'public.users', 'name', 'SELECT')::text, 'true'
  UNION ALL SELECT 'anon_keeps_avatar_url',
         has_column_privilege('anon', 'public.users', 'avatar_url', 'SELECT')::text, 'true'
  UNION ALL SELECT 'anon_keeps_bio',
         has_column_privilege('anon', 'public.users', 'bio', 'SELECT')::text, 'true'
  UNION ALL SELECT 'anon_keeps_instructor_bio',
         has_column_privilege('anon', 'public.users', 'instructor_bio', 'SELECT')::text, 'true'
  UNION ALL SELECT 'anon_keeps_sports',
         has_column_privilege('anon', 'public.users', 'sports', 'SELECT')::text, 'true'
  UNION ALL SELECT 'anon_keeps_average_rating',
         has_column_privilege('anon', 'public.users', 'average_rating', 'SELECT')::text, 'true'
  -- The same seven as one live query: this is the generateMetadata select, so
  -- a pass here is the OG-card / WhatsApp-preview proof.
  UNION ALL SELECT 'anon_metadata_select_works',
         (SELECT CASE WHEN v ~ '^[0-9]+$' THEN 'ok' ELSE v END FROM proofs
           WHERE name = 'anon_metadata_select_rows'), 'ok'

  -- Everything authenticated must keep.
  UNION ALL SELECT 'authenticated_keeps_location',
         has_column_privilege('authenticated', 'public.users', 'location', 'SELECT')::text, 'true'
  UNION ALL SELECT 'authed_location_select_works',
         (SELECT CASE WHEN v ~ '^[0-9]+$' THEN 'ok' ELSE v END FROM proofs
           WHERE name = 'authed_location_select_rows'), 'ok'
  UNION ALL SELECT 'discoverable_unaffected',
         (SELECT CASE WHEN v ~ '^[0-9]+$' THEN 'ok' ELSE v END FROM proofs
           WHERE name = 'discoverable_location_rows'), 'ok'

  -- SURGICAL, not merely effective: anon loses exactly ONE column, not a set.
  -- A wider revoke would still pass every check above.
  UNION ALL SELECT 'anon_lost_exactly_one_column',
         ((SELECT anon_readable_cols FROM before_state)
          - (SELECT count(*) FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = 'users'
                AND has_column_privilege('anon', 'public.users', c.column_name, 'SELECT')))::text,
         '1'

  -- 170 added this column and deliberately did NOT grant it to anon. Supabase
  -- re-grants anon by default on some object changes -- four times in this
  -- project -- so its absence is asserted, not assumed.
  UNION ALL SELECT 'hide_from_attendee_lists_still_denied_to_anon',
         has_column_privilege('anon', 'public.users', 'hide_from_attendee_lists', 'SELECT')::text, 'false'

  -- A grant change touches no data.
  UNION ALL SELECT 'row_count_unchanged',
         (SELECT count(*)::text FROM public.users),
         (SELECT n_rows::text FROM before_state)
)
-- ord lives inside the subquery: Postgres allows only result column names in an
-- ORDER BY that follows UNION, not expressions (0A000).
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord, check_name, actual, expected,
         CASE WHEN actual = expected THEN 'PASS' ELSE '*** FAIL ***' END AS pass
  FROM checks
  UNION ALL
  -- No FROM on this branch: the scalar subqueries make it a single row.
  SELECT 1, 'ALL_CHECKS',
         (SELECT count(*)::text FROM checks WHERE actual = expected) || '/' ||
         (SELECT count(*)::text FROM checks),
         (SELECT count(*)::text FROM checks) || '/' ||
         (SELECT count(*)::text FROM checks),
         CASE WHEN NOT EXISTS (SELECT 1 FROM checks WHERE actual IS DISTINCT FROM expected)
              THEN 'PASS' ELSE '*** FAIL ***' END
) x
ORDER BY ord, check_name;

ROLLBACK;

-- 181_find_training_partners_exclude_instructors_REHEARSAL.sql
--
-- Rehearsal for 181. Run in the Supabase SQL editor BEFORE 181 itself.
-- Everything is inside BEGIN ... ROLLBACK; production is not modified.
-- ONE result set of PASS/FAIL rows.
--
-- It APPLIES 181's function, grants and its own guard in-transaction, spliced
-- byte-identical from the migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE PRESENCE ARMS RUN BEFORE THE ABSENCE ARM, AND THAT ORDER IS THE POINT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The property this migration adds is an ABSENCE: no instructor appears in the
-- result. An absence arm passes in three different worlds --
--
--   1. the filter works                          (what we want)
--   2. the function returns nothing at all       (broken)
--   3. there were no instructors to exclude      (vacuous)
--
-- -- and on its own it cannot tell them apart. So two presence arms run first:
-- C1 asserts the result is non-empty, killing world 2, and C2 asserts the
-- eligible population CONTAINS instructors before the filter, killing world 3.
-- Only then does C3 mean anything.
--
-- C4 is the precision arm: the new result must equal the old result MINUS
-- instructors exactly. Without it, a filter that removed instructors and three
-- other people would pass C1, C2 and C3 together.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- ↓↓↓ spliced verbatim from 181 ↓↓↓
CREATE OR REPLACE FUNCTION public.find_training_partners(
  p_sport text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id                 uuid,
  name               text,
  avatar_url         text,
  sports             text[],
  shared_sport_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_lat    double precision;
  v_lng    double precision;
  v_sports text[];
BEGIN
  IF v_viewer IS NULL THEN
    RAISE EXCEPTION 'find_training_partners: authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- RAISES rather than clamping. A silently corrected argument is the same
  -- shape as the geocode route returning display_name NULL for a rejected key:
  -- the caller gets a plausible answer to a question it did not ask, and
  -- nothing anywhere records that the input was wrong.
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'find_training_partners: p_limit must be between 1 and 200, got %',
      coalesce(p_limit::text, 'NULL') USING ERRCODE = '22023';
  END IF;

  SELECT u.location_lat, u.location_lng, coalesce(u.sports, '{}')
    INTO v_lat, v_lng, v_sports
    FROM public.users u
   WHERE u.id = v_viewer;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      u.id,
      u.name,
      u.avatar_url,
      coalesce(u.sports, '{}'::text[]) AS sports,
      cardinality(
        ARRAY(SELECT unnest(coalesce(u.sports, '{}'::text[]))
              INTERSECT
              SELECT unnest(v_sports))
      )::integer AS shared_sport_count,
      (u.location_lat IS NOT NULL AND u.location_lng IS NOT NULL) AS has_location,
      u.location_lat AS lat,
      u.location_lng AS lng
      FROM public.users u
     WHERE u.id <> v_viewer
       AND u.deleted_at IS NULL
       AND u.banned IS NOT TRUE
       AND u.is_test_account IS NOT TRUE
       -- 181: INSTRUCTORS ARE NEVER TRAINING PARTNERS.
       --
       -- IS NOT TRUE, not = false. is_instructor is nullable, and `= false`
       -- evaluates to NULL for a NULL column, so a three-valued WHERE drops
       -- the row -- silently excluding every athlete who has never touched the
       -- instructor toggle. That is the majority of athletes, and the failure
       -- would look like "the card has fewer people now" rather than like a
       -- bug. Same trap as migration 171's `sports = '{}'` against a NULL
       -- array.
       AND u.is_instructor IS NOT TRUE
       AND (p_sport IS NULL OR coalesce(u.sports, '{}'::text[]) @> ARRAY[p_sport])
       AND NOT EXISTS (
         SELECT 1 FROM public.blocked_users b
          WHERE (b.user_id = v_viewer AND b.blocked_user_id = u.id)
             OR (b.user_id = u.id AND b.blocked_user_id = v_viewer)
       )
  ),
  ranked AS (
    SELECT
      c.id, c.name, c.avatar_url, c.sports, c.shared_sport_count, c.has_location,
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL AND c.has_location
           THEN 0::smallint ELSE 1::smallint END AS rank_group,
      -- Haversine, in kilometres. Used ONLY for ORDER BY and never selected
      -- into the result: see the guard below, which fails if a positional
      -- column ever reaches the return type.
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL AND c.has_location
           THEN 2 * 6371 * asin(sqrt(
                  power(sin(radians(c.lat - v_lat) / 2), 2)
                + cos(radians(v_lat)) * cos(radians(c.lat))
                  * power(sin(radians(c.lng - v_lng) / 2), 2)
                ))
           ELSE NULL END AS sort_distance
      FROM candidates c
  )
  SELECT r.id, r.name, r.avatar_url, r.sports, r.shared_sport_count
    FROM ranked r
   ORDER BY r.rank_group ASC,
            r.sort_distance ASC NULLS LAST,
            r.shared_sport_count DESC,
            r.name ASC
   LIMIT p_limit;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to PUBLIC, which reaches anon
-- DIRECTLY -- revoking from PUBLIC alone is not enough (the T-SEC3 lesson,
-- hit four times in this repo). anon is named explicitly.
REVOKE ALL ON FUNCTION public.find_training_partners(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_training_partners(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_training_partners(text, integer) TO authenticated;
-- ↑↑↑ end spliced block ↑↑↑

DO $outer$
DECLARE
  a_ok boolean := false; a_err text := '(never ran)';
  v_viewer uuid; v_n integer; v_rows integer;
  v_eligible_instructors integer; v_old_total integer; v_old_instructors integer;
  v_missing integer; v_extra integer;

  v_src text;
BEGIN

  -- ── A1: 181's own guard, spliced verbatim ────────────────────────────────
  BEGIN

  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
   WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure;

  -- NON-VACUITY FIRST. Every assertion below is true of an empty string, which
  -- is how a guard reports green about a function it never read.
  IF v_src IS NULL OR length(v_src) < 500 THEN
    RAISE EXCEPTION
      '181 ABORTED: could not read the function definition (got % chars), so '
      'the checks below would pass vacuously.', coalesce(length(v_src), 0);
  END IF;

  IF v_src !~ 'is_instructor IS NOT TRUE' THEN
    RAISE EXCEPTION
      '181 ABORTED: the instructor filter is not in the function body. '
      'Instructors are never training partners.';
  END IF;

  -- The NULL trap, asserted directly. `= false` drops every athlete who never
  -- touched the toggle, which is most of them, and the card would look like a
  -- data problem rather than a wrong predicate.
  IF v_src ~ 'is_instructor\s*=\s*false' THEN
    RAISE EXCEPTION
      '181 ABORTED: the filter is spelled `is_instructor = false`, which is '
      'NULL for every athlete who never set the toggle and therefore excludes '
      'them. Use IS NOT TRUE.';
  END IF;

  RAISE NOTICE '181: instructors excluded from find_training_partners.';
    a_ok := true; a_err := '(none)';
  EXCEPTION WHEN OTHERS THEN
    a_ok := false; a_err := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (1, 'A1 181 function, grants AND its own guard apply clean in-transaction', a_err, a_ok);
  IF NOT a_ok THEN
    INSERT INTO reh_probe VALUES (99, 'REHEARSAL STOPPED', 'A1 failed', false);
    RETURN;
  END IF;

  -- ── A2: the spelling, asserted against the live definition ───────────────
  INSERT INTO reh_probe
  SELECT 2, 'A2 the filter reads IS NOT TRUE, not = false (NULL drops every untouched athlete)',
         CASE WHEN pg_get_functiondef(p.oid) ~ 'is_instructor IS NOT TRUE'
              THEN 'IS NOT TRUE present' ELSE 'NOT FOUND' END,
         pg_get_functiondef(p.oid) ~ 'is_instructor IS NOT TRUE'
           AND pg_get_functiondef(p.oid) !~ 'is_instructor\s*=\s*false'
    FROM pg_proc p WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure;

  -- ── A3: 180's properties survive CREATE OR REPLACE ───────────────────────
  INSERT INTO reh_probe
  SELECT 3, 'A3 still SECURITY DEFINER, anon still without EXECUTE, still no positional column',
         'secdef=' || p.prosecdef::text
         || '  anon=' || has_function_privilege('anon','public.find_training_partners(text, integer)','EXECUTE')::text
         || '  returns=' || pg_get_function_result(p.oid),
         p.prosecdef
           AND NOT has_function_privilege('anon','public.find_training_partners(text, integer)','EXECUTE')
           AND NOT EXISTS (SELECT 1 FROM unnest(p.proargnames, p.proargmodes)
                             WITH ORDINALITY AS a(argname, argmode, ord)
                            WHERE a.argmode = 't'
                              AND a.argname ~* '(lat|lng|lon|distance|coord|location|rank_group)')
    FROM pg_proc p WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure;

  -- ── Choose a viewer, and become them ─────────────────────────────────────
  SELECT u.id INTO v_viewer FROM public.users u
   WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE AND u.is_test_account IS NOT TRUE
     AND u.is_instructor IS NOT TRUE
     AND u.location_lat IS NOT NULL AND u.location_lng IS NOT NULL
     AND cardinality(coalesce(u.sports,'{}')) > 0
   ORDER BY u.id LIMIT 1;

  IF v_viewer IS NULL THEN
    INSERT INTO reh_probe VALUES (98, 'NO SUITABLE VIEWER',
      'no eligible non-instructor has coordinates and sports', false);
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_viewer)::text, true);

  -- THE OLD PREDICATE: 180's WHERE clause, without the instructor filter. This
  -- is what the card returned yesterday, and it is how the size of the change
  -- gets onto the record rather than being inferred from a count that moved.
  CREATE TEMP TABLE reh_old ON COMMIT DROP AS
  SELECT u.id, coalesce(u.is_instructor, false) AS is_instructor
    FROM public.users u
   WHERE u.id <> v_viewer
     AND u.deleted_at IS NULL AND u.banned IS NOT TRUE AND u.is_test_account IS NOT TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.blocked_users b
        WHERE (b.user_id = v_viewer AND b.blocked_user_id = u.id)
           OR (b.user_id = u.id AND b.blocked_user_id = v_viewer));

  CREATE TEMP TABLE reh_new ON COMMIT DROP AS
  SELECT * FROM public.find_training_partners(NULL, 200);

  SELECT count(*) INTO v_rows FROM reh_new;
  SELECT count(*), count(*) FILTER (WHERE is_instructor)
    INTO v_old_total, v_old_instructors FROM reh_old;

  -- ── C1 (PRESENCE): the function still returns people ─────────────────────
  INSERT INTO reh_probe VALUES
    (4, 'C1 PRESENCE: the result is non-empty (kills "passes because it returns nothing")',
     'returned=' || v_rows, v_rows > 0);

  -- ── C2 (PRESENCE): there WERE instructors to exclude ─────────────────────
  SELECT count(*) INTO v_eligible_instructors FROM reh_old WHERE is_instructor;
  INSERT INTO reh_probe VALUES
    (5, 'C2 PRESENCE: the eligible population contains instructors (kills "nothing to exclude")',
     'instructors eligible before the filter=' || v_eligible_instructors,
     v_eligible_instructors > 0);

  -- ── C3 (ABSENCE): none of them came back ─────────────────────────────────
  SELECT count(*) INTO v_n
    FROM reh_new r JOIN public.users u ON u.id = r.id
   WHERE u.is_instructor IS TRUE;
  INSERT INTO reh_probe VALUES
    (6, 'C3 ABSENCE: zero returned rows are instructors', 'instructors returned=' || v_n, v_n = 0);

  -- ── C4 (PRECISION): exactly the instructors were removed, nobody else ────
  SELECT count(*) INTO v_missing
    FROM reh_old o WHERE NOT o.is_instructor AND NOT EXISTS (SELECT 1 FROM reh_new n WHERE n.id = o.id);
  SELECT count(*) INTO v_extra
    FROM reh_new n WHERE NOT EXISTS (SELECT 1 FROM reh_old o WHERE o.id = n.id);
  INSERT INTO reh_probe VALUES
    (7, 'C4 PRECISION: the new result is the old one MINUS instructors, exactly',
     'non-instructors lost=' || v_missing || '   unexpected gains=' || v_extra,
     v_missing = 0 AND v_extra = 0);

  -- ── C5: the NULL trap, measured rather than argued ───────────────────────
  -- How many athletes have is_instructor NULL. `= false` would have dropped
  -- every one of them, and the card would have looked like a data problem.
  SELECT count(*) INTO v_n FROM public.users u
   WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE AND u.is_test_account IS NOT TRUE
     AND u.is_instructor IS NULL;
  INSERT INTO reh_probe VALUES
    (8, 'C5 athletes with is_instructor NULL are still returned (the = false trap)',
     'NULL is_instructor in eligible population=' || v_n
       || '   of these, returned=' || (SELECT count(*) FROM reh_new n
              JOIN public.users u2 ON u2.id = n.id WHERE u2.is_instructor IS NULL),
     v_n = 0 OR (SELECT count(*) FROM reh_new n JOIN public.users u2 ON u2.id = n.id
                  WHERE u2.is_instructor IS NULL) = v_n);

  -- ── D1: THE SIZE OF THE CHANGE, ON THE RECORD ────────────────────────────
  INSERT INTO reh_probe VALUES
    (9, 'D1 how many instructors the OLD version returned (reported, always PASS)',
     'old returned ' || v_old_total || ' people, of whom ' || v_old_instructors
       || ' were instructors; new returns ' || v_rows, true);

END $outer$;

-- The one result set. Every row must read PASS. 9 of 9.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

-- 186_sport_demand_counts_REHEARSAL.sql
--
-- Rehearsal for 186. Run in the Supabase SQL editor BEFORE 186 itself.
-- Everything is inside BEGIN ... ROLLBACK; production is not modified.
-- ONE result set of PASS/FAIL rows.
--
-- It APPLIES 186's function and grant in-transaction, spliced byte-identical
-- from the migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE ARM THAT MAKES THE SUPPRESSION ARM MEAN ANYTHING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "a sport with fewer than 5 athletes is absent from the result" passes in two
-- worlds: the floor works, or there was no such sport to suppress. On a small
-- database the second is likely, and the arm would report green while proving
-- nothing.
--
-- So P2 asserts a small sport EXISTS before R2 asserts it is missing -- and if
-- the live data happens to contain none, P2 CREATES one inside the transaction
-- rather than skipping. A rehearsal that quietly degrades to "not applicable"
-- is a rehearsal that stops testing the thing it was written for, silently,
-- on exactly the days the data is thin.
--
-- Same shape throughout: P1 proves an instructor caller gets rows before R3
-- proves a non-instructor is refused, because "refused" passes trivially
-- against a function that refuses everyone.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- R1 CHECKS THE COUNTS, NOT THE LABELS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Asserting that every returned band reads "5+" or higher only checks the
-- formatting. R1 joins each returned sport back to its TRUE count and asserts
-- that is >= 5 -- so a function that suppressed nothing but labelled
-- everything "5+" fails.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- ↓↓↓ spliced verbatim from 186_sport_demand_counts.sql ↓↓↓
CREATE OR REPLACE FUNCTION public.sport_demand_counts()
RETURNS TABLE (
  sport       text,
  athletes    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_is_instructor boolean;
BEGIN
  IF v_viewer IS NULL THEN
    RAISE EXCEPTION 'sport_demand_counts: authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- INSTRUCTORS ONLY. This exists so an instructor can see that demand exists;
  -- it is not a public statistic. An athlete has no use for it and showing it
  -- to everyone widens the surface for nothing.
  SELECT u.is_instructor INTO v_is_instructor
    FROM public.users u WHERE u.id = v_viewer;

  IF v_is_instructor IS NOT TRUE THEN
    RAISE EXCEPTION 'sport_demand_counts: instructors only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH per_sport AS (
    SELECT s.sport::text AS sport, count(*)::bigint AS n
      FROM public.users u
      CROSS JOIN LATERAL unnest(coalesce(u.sports, '{}'::text[])) AS s(sport)
     WHERE u.deleted_at IS NULL
       AND u.banned IS NOT TRUE
       AND u.is_test_account IS NOT TRUE
       -- IS NOT TRUE, not = false: is_instructor is nullable and most athletes
       -- never touched the toggle. Same trap as migration 171's sports = '{}'.
       AND u.is_instructor IS NOT TRUE
       AND btrim(s.sport) <> ''
     GROUP BY s.sport
  )
  SELECT
    p.sport,
    -- BUCKETED, never exact. floor(n/10)*10 gives 10+, 20+, 30+ ... and the
    -- first band starts at 10 because anything under the floor is dropped
    -- below, so a "5+" band would only ever hold 5-9.
    CASE WHEN p.n >= 10 THEN (floor(p.n / 10.0) * 10)::bigint::text || '+'
         ELSE '5+' END AS athletes
    FROM per_sport p
   -- THE FLOOR. Omitted entirely, not rounded: rounding a 1 up to 5 tells a
   -- reader the cell is nonempty, which is the fact being protected.
   WHERE p.n >= 5
   ORDER BY p.n DESC, p.sport;
END;
$$;

REVOKE ALL ON FUNCTION public.sport_demand_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sport_demand_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.sport_demand_counts() TO authenticated;
-- ↑↑↑ end spliced block ↑↑↑

DO $outer$
DECLARE
  a_ok boolean := false; a_err text := '(never ran)';
  v_cols text;
  v_instructor uuid; v_athlete uuid;
  v_small_sport text; v_small_n integer; v_created boolean := false;
  v_rows integer; v_bad integer; v_msg text;
BEGIN

  -- ── A1: the function applied ─────────────────────────────────────────────
  BEGIN
    a_ok := EXISTS (SELECT 1 FROM pg_proc p
                     WHERE p.oid = 'public.sport_demand_counts()'::regprocedure);
    a_err := CASE WHEN a_ok THEN '(none)' ELSE 'function not present after apply' END;
  EXCEPTION WHEN OTHERS THEN
    a_ok := false; a_err := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES (1, 'A1 186 function and grant apply clean', a_err, a_ok);
  IF NOT a_ok THEN
    INSERT INTO reh_probe VALUES (99, 'REHEARSAL STOPPED', 'A1 failed', false);
    RETURN;
  END IF;

  -- ── A2: the return type, read from proargnames ───────────────────────────
  -- A RETURNS TABLE function has prorettype = record and typrelid 0, so a
  -- pg_attribute join reads NOTHING and every check built on it passes
  -- vacuously. Migration 180 shipped that bug and it was caught only because
  -- the rehearsal PRINTED what it read.
  SELECT string_agg(a.argname || ' ' || format_type(p.proallargtypes[a.ord], NULL),
                    ', ' ORDER BY a.ord)
    INTO v_cols
    FROM pg_proc p, unnest(p.proargnames) WITH ORDINALITY AS a(argname, ord)
   WHERE p.oid = 'public.sport_demand_counts()'::regprocedure;

  INSERT INTO reh_probe VALUES
    (2, 'A2a the return type is READABLE (an empty read makes A2b vacuous)',
     'returns: ' || coalesce(v_cols, '(none)'),
     v_cols IS NOT NULL AND length(btrim(v_cols)) > 0);

  INSERT INTO reh_probe VALUES
    (3, 'A2b no numeric count column: a band is text, an exact count is not',
     'columns: ' || coalesce(v_cols, '(none)'),
     v_cols IS NOT NULL
       AND v_cols !~* '(bigint|integer|numeric|double|smallint|real)');

  -- ── Two callers ──────────────────────────────────────────────────────────
  SELECT id INTO v_instructor FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
     AND is_instructor IS TRUE ORDER BY id LIMIT 1;
  SELECT id INTO v_athlete FROM public.users
   WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
     AND is_instructor IS NOT TRUE ORDER BY id LIMIT 1;

  IF v_instructor IS NULL OR v_athlete IS NULL THEN
    INSERT INTO reh_probe VALUES (98, 'NO SUITABLE CALLERS',
      'need one instructor and one athlete', false);
    RETURN;
  END IF;

  -- ── P2 (PRESENCE): a sport with 1-4 athletes must EXIST ──────────────────
  -- Asserted BEFORE R2 claims such a sport is absent from the result.
  SELECT s.sport, count(*)::integer INTO v_small_sport, v_small_n
    FROM public.users u
    CROSS JOIN LATERAL unnest(coalesce(u.sports, '{}'::text[])) AS s(sport)
   WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE
     AND u.is_test_account IS NOT TRUE AND u.is_instructor IS NOT TRUE
     AND btrim(s.sport) <> ''
   GROUP BY s.sport HAVING count(*) BETWEEN 1 AND 4
   ORDER BY count(*) DESC, s.sport LIMIT 1;

  -- CREATED, not skipped. A rehearsal that degrades to "not applicable" stops
  -- testing the thing it exists for, silently, whenever the data is thin.
  IF v_small_sport IS NULL THEN
    v_small_sport := 'REHEARSAL_SPORT_' || substr(md5(random()::text), 1, 8);
    UPDATE public.users
       SET sports = coalesce(sports, '{}'::text[]) || v_small_sport
     WHERE id = v_athlete;
    v_small_n := 1;
    v_created := true;
  END IF;

  INSERT INTO reh_probe VALUES
    (4, 'P2 PRESENCE: a sport with 1-4 athletes exists (kills "nothing to suppress")',
     'sport=' || v_small_sport || '  athletes=' || v_small_n
       || CASE WHEN v_created THEN '  (created in-transaction; live data had none)'
               ELSE '  (found in live data)' END,
     v_small_n BETWEEN 1 AND 4);

  -- ── P1 (PRESENCE): an instructor caller gets rows ────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_instructor)::text, true);

  CREATE TEMP TABLE reh_result ON COMMIT DROP AS
  SELECT * FROM public.sport_demand_counts();

  SELECT count(*) INTO v_rows FROM reh_result;
  INSERT INTO reh_probe VALUES
    (5, 'P1 PRESENCE: an instructor caller gets rows (kills "refuses everyone")',
     'rows=' || v_rows, v_rows > 0);

  -- ── R1: every returned band is backed by a TRUE count of 5 or more ───────
  -- Joined back to the real counts rather than parsing the label, so a
  -- function that suppressed nothing and labelled everything "5+" fails.
  SELECT count(*) INTO v_bad
    FROM reh_result r
    LEFT JOIN (
      SELECT s.sport, count(*) AS n
        FROM public.users u
        CROSS JOIN LATERAL unnest(coalesce(u.sports, '{}'::text[])) AS s(sport)
       WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE
         AND u.is_test_account IS NOT TRUE AND u.is_instructor IS NOT TRUE
         AND btrim(s.sport) <> ''
       GROUP BY s.sport
    ) t ON t.sport = r.sport
   WHERE t.n IS NULL OR t.n < 5;

  INSERT INTO reh_probe VALUES
    (6, 'R1 every returned sport has a TRUE count of 5 or more (not just a 5+ label)',
     'rows below the floor=' || v_bad, v_bad = 0);

  -- ── R2 (ABSENCE): the small sport is suppressed ──────────────────────────
  SELECT count(*) INTO v_bad FROM reh_result WHERE sport = v_small_sport;
  INSERT INTO reh_probe VALUES
    (7, 'R2 ABSENCE: the 1-4 athlete sport is not in the result',
     'appearances of "' || v_small_sport || '"=' || v_bad, v_bad = 0);

  -- ── R3: a non-instructor caller is refused ───────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_athlete)::text, true);
    PERFORM * FROM public.sport_demand_counts();
    v_msg := 'NO ERROR RAISED';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (8, 'R3 a non-instructor caller is refused', v_msg, v_msg LIKE '42501%');

  -- ── R4: an unauthenticated caller is refused ─────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM * FROM public.sport_demand_counts();
    v_msg := 'NO ERROR RAISED';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (9, 'R4 an unauthenticated caller is refused', v_msg, v_msg LIKE '42501%');

END $outer$;

-- The one result set. Every row must read PASS. 9 of 9.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

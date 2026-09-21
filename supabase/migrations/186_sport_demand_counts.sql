-- 186_sport_demand_counts.sql
--
-- What instructors see above the athlete card: how many athletes do each sport.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SPORT-LEVEL ONLY. NEIGHBOURHOOD COUNTS WAIT.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Neighbourhood counts need the geocode backfill, which is blocked on
-- GOOGLE_MAPS_SERVER_KEY. They would also be near-empty today: migration 181's
-- rehearsal established that the only live user with BOTH coordinates and
-- sports is an instructor, so an athlete-by-neighbourhood count would return
-- almost nothing and read as a broken feature rather than an absent one.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE FLOOR IS 5, AND SUPPRESSION IS NOT ROUNDING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A cell below 5 is OMITTED ENTIRELY, not rounded up to 5. Rounding leaks the
-- existence of a nonzero cell: "5" would mean "between 1 and 5", and an
-- instructor who knows one person who does that sport learns there are at most
-- four others. Absence says nothing.
--
-- Counts are also BUCKETED -- "30+" rather than "31" -- because an exact count
-- supports arithmetic that a band does not. An instructor watching a number go
-- from 31 to 32 has learned that one specific person joined; watching "30+"
-- stay "30+" has learned nothing. The cost to the instructor is zero: nobody
-- decides whether to publish a yoga session differently at 31 than at 30.
--
-- DIFFERENCING IS THE ATTACK THIS DOES NOT YET FACE, and it is worth naming
-- rather than discovering later. If a neighbourhood breakdown is added, a cell
-- and its parent can be subtracted: "Laureles 40, Laureles yoga 5" tells you
-- about five specific people if you already know 35 of them. The rule when
-- that lands is that no two published cells may differ by one attribute unless
-- BOTH clear the floor. Sport-level alone has no parent to difference against.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IS COUNTED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ATHLETES ONLY. is_instructor IS NOT TRUE, the same predicate and the same
-- NULL handling as migration 181 -- `= false` would drop every athlete who
-- never touched the toggle, which is most of them.
--
-- Soft-deleted, banned and test accounts are excluded, matching
-- users_discoverable and find_training_partners. An instructor deciding what to
-- teach should see the population they could actually reach.
--
-- One athlete counts once per sport they list, so the buckets do not sum to the
-- athlete population. That is correct for the question being asked -- "how many
-- people do yoga" -- and the function does not report a total, which would
-- invite reading it as a headcount.

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

-- ── Guards ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p WHERE p.oid = 'public.sport_demand_counts()'::regprocedure;

  -- NON-VACUITY FIRST. Every assertion below is true of an empty string.
  IF v_src IS NULL OR length(v_src) < 500 THEN
    RAISE EXCEPTION
      '186 ABORTED: could not read the function definition (% chars), so the '
      'checks below would pass vacuously.', coalesce(length(v_src), 0);
  END IF;

  -- The floor is the privacy property. Without it a count of 1 identifies a
  -- person, which is the entire reason this function returns bands at all.
  IF v_src !~ 'p\.n >= 5' THEN
    RAISE EXCEPTION
      '186 ABORTED: the minimum-group-size floor is missing. A cell of 1 names '
      'a person.';
  END IF;

  -- Exact counts must not escape. The return type is text for this reason: a
  -- bigint column would invite returning n directly.
  IF (SELECT a.argname FROM pg_proc p,
        unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(argname, argmode, ord)
       WHERE p.oid = 'public.sport_demand_counts()'::regprocedure
         AND a.argmode = 't' AND a.argname = 'athletes') IS NULL THEN
    RAISE EXCEPTION '186 ABORTED: the athletes column is missing from the return type.';
  END IF;

  -- The athletes column must be TEXT. It carries a band ("30+"), and a numeric
  -- column would invite returning the exact count -- which is the property this
  -- function exists to withhold. Read from proargnames/proargmodes and
  -- proallargtypes, because a RETURNS TABLE function has prorettype = record
  -- and typrelid 0, so a pg_attribute join reads nothing and any check built
  -- on it passes vacuously (migration 180 learned this the hard way).
  IF (SELECT format_type(p.proallargtypes[a.ord], NULL)
        FROM pg_proc p,
             unnest(p.proargnames) WITH ORDINALITY AS a(argname, ord)
       WHERE p.oid = 'public.sport_demand_counts()'::regprocedure
         AND a.argname = 'athletes') <> 'text' THEN
    RAISE EXCEPTION
      '186 ABORTED: the athletes column is not text. A numeric column invites '
      'returning the exact count, which is what the banding exists to prevent.';
  END IF;

  IF v_src !~ 'is_instructor IS NOT TRUE' THEN
    RAISE EXCEPTION
      '186 ABORTED: the count includes instructors. Demand means ATHLETES, and '
      '= false would additionally drop every athlete with a NULL toggle.';
  END IF;

  IF has_function_privilege('anon', 'public.sport_demand_counts()', 'EXECUTE') THEN
    RAISE EXCEPTION
      '186 ABORTED: anon holds EXECUTE. Supabase grants new functions to PUBLIC, '
      'which reaches anon directly; revoke from anon by name.';
  END IF;

  RAISE NOTICE '186: sport_demand_counts created (floor 5, bucketed, instructors only).';
END $$;

-- ── Record this migration as applied ───────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('186_sport_demand_counts', 'sport-level demand; neighbourhood counts wait on the geocode backfill')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT pg_get_function_result(p.oid) FROM pg_proc p
    WHERE p.oid = 'public.sport_demand_counts()'::regprocedure)          AS returns,
  (SELECT pg_get_functiondef(p.oid) ~ 'p\.n >= 5' FROM pg_proc p
    WHERE p.oid = 'public.sport_demand_counts()'::regprocedure)          AS floor_present_ok,
  (SELECT pg_get_functiondef(p.oid) ~ 'is_instructor IS NOT TRUE' FROM pg_proc p
    WHERE p.oid = 'public.sport_demand_counts()'::regprocedure)          AS athletes_only_ok,
  (NOT has_function_privilege('anon','public.sport_demand_counts()','EXECUTE'))
                                                                         AS anon_cannot_execute_ok,
  -- The numbers this WOULD suppress, so the floor's effect is on the record.
  (SELECT count(*) FROM (
     SELECT count(*) AS n FROM public.users u
       CROSS JOIN LATERAL unnest(coalesce(u.sports,'{}'::text[])) AS s(sport)
      WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE
        AND u.is_test_account IS NOT TRUE AND u.is_instructor IS NOT TRUE
        AND btrim(s.sport) <> ''
      GROUP BY s.sport) q WHERE q.n < 5)                                 AS sports_suppressed_below_floor,
  (SELECT count(*) FROM public.users u
    WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE
      AND u.is_test_account IS NOT TRUE AND u.is_instructor IS NOT TRUE
      AND coalesce(array_length(u.sports, 1), 0) = 0)                    AS athletes_with_no_sports;

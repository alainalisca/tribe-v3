-- 181_find_training_partners_exclude_instructors.sql
--
-- Instructors are never training partners.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE RULE AND WHAT IT PROTECTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- An athlete browsing Find Training Partners is looking for a peer to train
-- WITH. An instructor in that list is a different proposition -- someone who
-- teaches, for money -- and the card gives no sign of the difference. So an
-- athlete can ask to train with someone they never intended to approach, and
-- the instructor receives an invitation that reads as a peer request.
--
-- 180's WHERE clause excludes self, deleted_at, banned, is_test_account and
-- blocked users in both directions, AND NOTHING ELSE. Instructors were in the
-- result from the day that card existed; before 180 they were merely hidden
-- among the few users with coordinates, and 180's show-everyone change is what
-- made them visible at scale.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IS NOT TRUE, NOT = false
-- ═══════════════════════════════════════════════════════════════════════════
--
-- users.is_instructor is nullable and most athletes have never touched the
-- toggle. `u.is_instructor = false` evaluates to NULL for those rows, and a
-- WHERE clause drops NULL, so the obvious spelling would have excluded nearly
-- every athlete while looking like a tighter filter. The card would have gone
-- almost empty and read as a data problem.
--
-- Migration 171 hit exactly this with `sports = '{}'` against a NULL array.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DOES NOT FIX
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The rule is broader than this function. /training-partners shares this RPC
-- and is fixed here. The SMART-MATCH CRON (app/api/cron/smart-match/route.ts)
-- pairs people for training from its own `users` query with no is_instructor
-- reference anywhere in the file, and it PUSHES the result -- so it can tell
-- an athlete that an instructor is their match. That is the same rule on a
-- different surface and is NOT addressed here.
--
-- Whether the card should RENDER for an instructor at all is a separate
-- question, and a product one: reaching athletes is what reach_out_to_athlete
-- and its credits exist for, and this card would be an uncredited path to the
-- same people. Today it renders for any logged-in user (app/page.tsx gates
-- both mounts on `f.user` alone). Left for Al.

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
-- ── Guards ──────────────────────────────────────────────────────────────────
-- 180's guards, re-run VERBATIM. CREATE OR REPLACE keeps the signature and the
-- return type, so every property 180 established must still hold: no
-- positional column, SECURITY DEFINER, anon without EXECUTE. Re-running them
-- is what makes that a checked claim rather than an assumption about what
-- CREATE OR REPLACE preserves.
DO $$
DECLARE
  v_all_cols   text;
  v_positional text;
  v_secdef     boolean;
  v_anon       boolean;
BEGIN
  -- THE LOAD-BEARING GUARD. The entire point of this function is that nothing
  -- positional crosses the wire. Asserting it against the declared return type
  -- means a later CREATE OR REPLACE that adds `distance_km` back "just for
  -- sorting on the client" fails here rather than shipping.
  -- READ THE COLUMNS FROM proargnames/proargmodes, NOT FROM pg_attribute.
  --
  -- A RETURNS TABLE function has prorettype = `record`, and pg_type.typrelid
  -- for `record` is 0 -- so the obvious join
  --     JOIN pg_type t ON t.oid = p.prorettype
  --     JOIN pg_attribute a ON a.attrelid = t.typrelid
  -- matches NO ROWS and yields NULL. The first version of this guard did
  -- exactly that, so `coalesce(v_cols,'') !~* '...'` reduced to `'' !~* '...'`
  -- and the guard passed with any column list whatsoever, including one
  -- containing distance_km.
  --
  -- It was caught because the rehearsal PRINTED the extracted list and it read
  -- "(none)" for a function that returns five columns. A guard that reports
  -- what it saw can be checked; one that reports only a verdict cannot.
  SELECT string_agg(a.argname, ', ' ORDER BY a.ord)
    INTO v_all_cols
    FROM pg_proc p,
         unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(argname, argmode, ord)
   WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure
     AND a.argmode = 't';

  -- NON-VACUITY FIRST. If the extraction found nothing, every assertion below
  -- is true of the empty string and says nothing about the function.
  IF v_all_cols IS NULL OR length(btrim(v_all_cols)) = 0 THEN
    RAISE EXCEPTION
      '180 ABORTED: could not read the function''s return columns, so the '
      'no-positional-column check would pass vacuously. This is the failure '
      'mode the check exists to prevent, arriving from the other side.';
  END IF;

  SELECT string_agg(a.argname, ', ' ORDER BY a.ord)
    INTO v_positional
    FROM pg_proc p,
         unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(argname, argmode, ord)
   WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure
     AND a.argmode = 't'
     AND a.argname ~* '(lat|lng|lon|distance|coord|location|rank_group)';

  IF v_positional IS NOT NULL THEN
    RAISE EXCEPTION
      '180 ABORTED: find_training_partners returns positional column(s): %. '
      'Full return list: %. Nothing positional may cross the wire -- the client '
      'is what must not have it. Rank here and return an order.',
      v_positional, v_all_cols;
  END IF;

  SELECT p.prosecdef INTO v_secdef
    FROM pg_proc p
   WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure;
  IF NOT v_secdef THEN
    RAISE EXCEPTION
      '180 ABORTED: function is not SECURITY DEFINER. Migration 115 revoked '
      'users.location_lat/lng from authenticated, so an invoker-rights version '
      'silently ranks everyone as though nobody has coordinates.';
  END IF;

  v_anon := has_function_privilege('anon',
    'public.find_training_partners(text, integer)', 'EXECUTE');
  IF v_anon THEN
    RAISE EXCEPTION
      '180 ABORTED: anon holds EXECUTE. Supabase grants new functions to PUBLIC, '
      'which reaches anon directly; revoke from anon by name.';
  END IF;

  IF NOT has_function_privilege('authenticated',
    'public.find_training_partners(text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '180 ABORTED: authenticated cannot execute the function.';
  END IF;

  RAISE NOTICE '180: find_training_partners created. Returns: %. No positional column.', v_all_cols;
END $$;

-- ── 181's own guard: the filter is present, and spelled correctly ──────────
DO $$
DECLARE
  v_src text;
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
END $$;

-- ── Verification. Every *_ok must read true. ────────────────────────────────
SELECT
  (SELECT pg_get_function_result(p.oid) FROM pg_proc p
    WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
                                                                        AS returns,
  (SELECT pg_get_functiondef(p.oid) ~ 'is_instructor IS NOT TRUE' FROM pg_proc p
    WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
                                                                        AS instructor_filter_present_ok,
  (SELECT pg_get_functiondef(p.oid) !~ 'is_instructor\s*=\s*false' FROM pg_proc p
    WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
                                                                        AS not_the_null_dropping_spelling_ok,
  coalesce((SELECT p.prosecdef FROM pg_proc p
     WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure), false)
                                                                        AS security_definer_ok,
  (NOT has_function_privilege('anon',
     'public.find_training_partners(text, integer)', 'EXECUTE'))        AS anon_cannot_execute_ok,
  (SELECT count(*) = 0 FROM pg_proc p,
          unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(argname, argmode, ord)
    WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure
      AND a.argmode = 't'
      AND a.argname ~* '(lat|lng|lon|distance|coord|location|rank_group)')  AS no_positional_column_ok,
  -- How many instructors this removes from the card. Recorded so the size of
  -- the change is on the record rather than inferred from a count that moved.
  (SELECT count(*) FROM public.users u
    WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE
      AND u.is_test_account IS NOT TRUE AND u.is_instructor IS TRUE)     AS instructors_now_excluded;

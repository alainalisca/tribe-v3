-- 180_find_training_partners_rpc_REHEARSAL.sql
--
-- Rehearsal for 180. Run in the Supabase SQL editor BEFORE 180 itself.
-- Everything is inside BEGIN ... ROLLBACK; production is not modified.
-- ONE result set of PASS/FAIL rows, because the editor shows only the last
-- statement's result.
--
-- It APPLIES 180's function and grants in-transaction, spliced byte-identical
-- from the migration -- so this does not require 180 to be applied, and it is
-- not a post-apply verification.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IT CALLS THE FUNCTION AS A REAL AUTHENTICATED USER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- auth.uid() reads the request.jwt.claims GUC, so set_config(..., true) makes
-- the function answer as a chosen user for the rest of this transaction.
-- SECURITY DEFINER does not affect this: it changes current_user, not the JWT.
--
-- A viewer is CHOSEN FROM LIVE DATA rather than created, and every assertion
-- is a RELATIVE property -- ordering invariants, set membership, arithmetic
-- against the same rows -- never an absolute count. An absolute count would
-- encode today's database into a file that has to keep passing tomorrow.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ARMS
-- ═══════════════════════════════════════════════════════════════════════════
--
--   A1..A6  structure: applies INCLUDING 180's own guard; SECURITY DEFINER;
--           grants; the return columns are READABLE; none is positional;
--           and the same extraction demonstrably flags one that is
--   B1..B3  it refuses what it must: unauthenticated, p_limit 0, p_limit 500
--   C1..C7  behaviour as a real viewer
--   D1      the sport filter narrows rather than empties
--
-- THE SHAPE THAT MATTERS: several arms below assert something is ABSENT (no
-- self, no blocked user, no positional column). An absence arm passes when the
-- feature is broken in the direction of returning nothing at all, so each one
-- is paired with a presence arm on the same query. C1 exists so that C4, C5
-- and C6 cannot pass vacuously against an empty result.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- ↓↓↓ spliced verbatim from 180_find_training_partners_rpc.sql ↓↓↓
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
  v_viewer uuid; v_viewer_has_coords boolean; v_viewer_sports text[];
  v_cols text; v_n integer; v_m integer;
  v_rows integer; v_msg text;
  v_first_unlocated integer; v_last_located integer;
  v_blocked uuid;
  -- hoisted from 180's guard block, which cannot nest as a DO statement
  v_all_cols   text;
  v_positional text;
  v_secdef     boolean;
  v_anon       boolean;
BEGIN

  -- ── A1: the spliced body applied (it ran above; this records it) ─────────
  -- 180's OWN GUARD, spliced verbatim (DO wrapper stripped, vars hoisted).
  -- The first version of this rehearsal spliced only the function and the
  -- grants and stopped there, so A1 asserted the function EXISTS -- which is
  -- true of a function whose guard would have aborted the migration. Running
  -- the guard here is what makes A1 mean "180 will apply".
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
    a_ok := true; a_err := '(none)';
  EXCEPTION WHEN OTHERS THEN
    a_ok := false; a_err := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (1, 'A1 180 function, grants AND ITS OWN GUARD apply clean in-transaction', a_err, a_ok);
  IF NOT a_ok THEN
    INSERT INTO reh_probe VALUES (99, 'REHEARSAL STOPPED', 'A1 failed', false);
    RETURN;
  END IF;

  -- ── A2: SECURITY DEFINER ─────────────────────────────────────────────────
  -- 115 revoked users.location_lat/lng from authenticated, so an invoker-rights
  -- copy would read NULL for every athlete and silently rank the whole app as
  -- location-less. That failure returns rows and looks fine.
  INSERT INTO reh_probe
  SELECT 2, 'A2 SECURITY DEFINER (an invoker copy silently ranks everyone as unlocated)',
         'prosecdef=' || p.prosecdef::text, p.prosecdef
    FROM pg_proc p WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure;

  -- ── A3/A4: grants ────────────────────────────────────────────────────────
  INSERT INTO reh_probe VALUES
    (3, 'A3 anon cannot EXECUTE (Supabase grants new functions to PUBLIC, which reaches anon)',
     'anon=' || has_function_privilege('anon','public.find_training_partners(text, integer)','EXECUTE')::text,
     NOT has_function_privilege('anon','public.find_training_partners(text, integer)','EXECUTE')),
    (4, 'A4 authenticated CAN EXECUTE',
     'authenticated=' || has_function_privilege('authenticated','public.find_training_partners(text, integer)','EXECUTE')::text,
     has_function_privilege('authenticated','public.find_training_partners(text, integer)','EXECUTE'));

  -- ── A5: THE LOAD-BEARING ONE ─────────────────────────────────────────────
  -- Nothing positional may reach the return type. The detail lists every
  -- column so a reader sees WHAT is returned, not just that a check passed.
  -- A RETURNS TABLE function has prorettype = `record`, whose typrelid is 0,
  -- so joining pg_type -> pg_attribute matches NOTHING. The first version of
  -- this arm did that, printed "returns: (none)" for a five-column function,
  -- and PASSED -- because `coalesce(NULL,'') !~* '...'` is `'' !~* '...'`.
  -- It is the exact shape C1 guards against for C5-C7, in the one arm that had
  -- no such guard of its own.
  SELECT string_agg(a.argname, ', ' ORDER BY a.ord) INTO v_cols
    FROM pg_proc p,
         unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(argname, argmode, ord)
   WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure
     AND a.argmode = 't';

  -- NON-VACUITY, ASSERTED BEFORE THE PROPERTY. An empty list satisfies
  -- "contains nothing forbidden" and says nothing whatever about the function.
  INSERT INTO reh_probe VALUES
    (5, 'A5 the return columns are READABLE (an empty read makes A5b vacuous)',
     'pg_get_function_result: ' || coalesce(
        (SELECT pg_get_function_result(p.oid) FROM pg_proc p
          WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure), '(none)'),
     v_cols IS NOT NULL AND length(btrim(v_cols)) > 0);

  INSERT INTO reh_probe VALUES
    (17, 'A5b none of those columns is a coordinate, distance, location or rank',
     'columns: ' || coalesce(v_cols, '(none)'),
     v_cols IS NOT NULL AND v_cols !~* '(lat|lng|lon|distance|coord|location|rank_group)');

  -- A6: THE DETECTOR CAN ACTUALLY FIRE. A5b passing proves nothing unless the
  -- same extraction flags a function that DOES return a forbidden column. This
  -- builds one, checks it is caught, and drops it -- inside the transaction
  -- that rolls back regardless.
  DECLARE v_probe_flagged boolean; v_probe_cols text;
  BEGIN
    EXECUTE $probe$
      CREATE FUNCTION pg_temp.reh_positional_probe()
      RETURNS TABLE (id uuid, distance_km double precision)
      LANGUAGE sql STABLE AS 'SELECT NULL::uuid, NULL::double precision'
    $probe$;

    SELECT string_agg(a.argname, ', ' ORDER BY a.ord) INTO v_probe_cols
      FROM pg_proc p,
           unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(argname, argmode, ord)
     WHERE p.oid = 'pg_temp.reh_positional_probe()'::regprocedure
       AND a.argmode = 't';

    v_probe_flagged := v_probe_cols IS NOT NULL
                   AND v_probe_cols ~* '(lat|lng|lon|distance|coord|location|rank_group)';

    INSERT INTO reh_probe VALUES
      (18, 'A6 the same extraction DOES flag a function that returns distance_km',
       'probe returns: ' || coalesce(v_probe_cols, '(none)') ||
       '   flagged=' || coalesce(v_probe_flagged::text, 'null'),
       coalesce(v_probe_flagged, false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh_probe VALUES
      (18, 'A6 the same extraction DOES flag a function that returns distance_km',
       'probe could not be built: ' || SQLERRM, false);
  END;

  -- ── Choose a viewer from live data ───────────────────────────────────────
  SELECT u.id, (u.location_lat IS NOT NULL AND u.location_lng IS NOT NULL),
         coalesce(u.sports, '{}')
    INTO v_viewer, v_viewer_has_coords, v_viewer_sports
    FROM public.users u
   WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE AND u.is_test_account IS NOT TRUE
     AND u.location_lat IS NOT NULL AND u.location_lng IS NOT NULL
     AND cardinality(coalesce(u.sports,'{}')) > 0
   ORDER BY u.id LIMIT 1;

  IF v_viewer IS NULL THEN
    INSERT INTO reh_probe VALUES (98, 'NO SUITABLE VIEWER',
      'no live user has both coordinates and sports; C arms cannot run', false);
    RETURN;
  END IF;

  -- ── B1: refuses an unauthenticated caller ────────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM * FROM public.find_training_partners(NULL, 5);
    v_msg := 'NO ERROR RAISED';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (6, 'B1 refuses an unauthenticated caller', v_msg, v_msg LIKE '42501%');

  -- become the viewer for everything below
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_viewer)::text, true);

  -- ── B2/B3: p_limit RAISES rather than clamping ───────────────────────────
  BEGIN
    PERFORM * FROM public.find_training_partners(NULL, 0);
    v_msg := 'NO ERROR RAISED';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (7, 'B2 p_limit 0 RAISES (silent clamping is the swallowing pattern)', v_msg, v_msg LIKE '22023%');

  BEGIN
    PERFORM * FROM public.find_training_partners(NULL, 500);
    v_msg := 'NO ERROR RAISED';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO reh_probe VALUES
    (8, 'B3 p_limit 500 RAISES', v_msg, v_msg LIKE '22023%');

  -- ── Materialise one call, so every C arm reads the SAME result ───────────
  CREATE TEMP TABLE reh_result ON COMMIT DROP AS
  SELECT * FROM public.find_training_partners(NULL, 200);

  SELECT count(*) INTO v_rows FROM reh_result;

  -- C1 is the presence arm the absence arms depend on. Without it, C4/C5/C6
  -- all pass against an empty result.
  INSERT INTO reh_probe VALUES
    (9, 'C1 returns rows at all (the arm that stops C4-C6 passing vacuously)',
     'rows=' || v_rows || '   viewer has coords=' || v_viewer_has_coords::text, v_rows > 0);

  -- ── C2: athletes WITHOUT coordinates are included ────────────────────────
  -- This is the "show everyone" change. The old DAL filtered them out entirely.
  SELECT count(*) INTO v_n
    FROM reh_result r JOIN public.users u ON u.id = r.id
   WHERE u.location_lat IS NULL OR u.location_lng IS NULL;
  SELECT count(*) INTO v_m
    FROM public.users u
   WHERE u.id <> v_viewer AND u.deleted_at IS NULL AND u.banned IS NOT TRUE
     AND u.is_test_account IS NOT TRUE
     AND (u.location_lat IS NULL OR u.location_lng IS NULL);

  INSERT INTO reh_probe VALUES
    (10, 'C2 athletes with NO coordinates are returned (the show-everyone change)',
     'unlocated returned=' || v_n || '  of ' || v_m || ' eligible',
     (v_m = 0) OR (v_n > 0));

  -- ── C3: ordering invariant ───────────────────────────────────────────────
  -- Every located athlete precedes every unlocated one. Asserted as an
  -- invariant over positions rather than by recomputing distances, which would
  -- just restate the function's own arithmetic back to itself.
  IF v_viewer_has_coords THEN
    WITH pos AS (
      SELECT row_number() OVER () AS ord,
             (u.location_lat IS NOT NULL AND u.location_lng IS NOT NULL) AS located
        FROM reh_result r JOIN public.users u ON u.id = r.id
    )
    SELECT max(ord) FILTER (WHERE located), min(ord) FILTER (WHERE NOT located)
      INTO v_last_located, v_first_unlocated FROM pos;

    INSERT INTO reh_probe VALUES
      (11, 'C3 located athletes all precede unlocated ones',
       'last located at ' || coalesce(v_last_located::text,'-') ||
       ', first unlocated at ' || coalesce(v_first_unlocated::text,'-'),
       v_last_located IS NULL OR v_first_unlocated IS NULL
         OR v_last_located < v_first_unlocated);
  ELSE
    INSERT INTO reh_probe VALUES
      (11, 'C3 located athletes all precede unlocated ones',
       'skipped: chosen viewer has no coordinates', true);
  END IF;

  -- ── C4: shared_sport_count is computed AGAINST THE VIEWER ────────────────
  -- The old field was the other athlete's total sport count, which shares
  -- nothing with anybody.
  SELECT count(*) INTO v_n
    FROM reh_result r JOIN public.users u ON u.id = r.id
   WHERE r.shared_sport_count <> cardinality(
           ARRAY(SELECT unnest(coalesce(u.sports,'{}')) INTERSECT SELECT unnest(v_viewer_sports)));
  INSERT INTO reh_probe VALUES
    (12, 'C4 shared_sport_count equals the true intersection with the viewer',
     'rows disagreeing=' || v_n, v_n = 0);

  -- ── C5: the viewer is never their own partner ────────────────────────────
  SELECT count(*) INTO v_n FROM reh_result WHERE id = v_viewer;
  INSERT INTO reh_probe VALUES (13, 'C5 the viewer is not in their own results', 'self rows=' || v_n, v_n = 0);

  -- ── C6: soft-deleted, banned and test accounts excluded ──────────────────
  SELECT count(*) INTO v_n
    FROM reh_result r JOIN public.users u ON u.id = r.id
   WHERE u.deleted_at IS NOT NULL OR u.banned IS TRUE OR u.is_test_account IS TRUE;
  INSERT INTO reh_probe VALUES
    (14, 'C6 soft-deleted, banned and test accounts are excluded', 'leaked=' || v_n, v_n = 0);

  -- ── C7: blocks, in BOTH directions ───────────────────────────────────────
  -- Written inside a subtransaction and rolled back. Captured to a variable
  -- first: a probe row inserted inside would unwind with the arm it describes.
  SELECT id INTO v_blocked FROM reh_result LIMIT 1;
  IF v_blocked IS NULL THEN
    INSERT INTO reh_probe VALUES (15, 'C7 a blocked athlete disappears, both directions',
      'skipped: no rows to block', false);
  ELSE
    DECLARE v_fwd integer; v_rev integer;
    BEGIN
      BEGIN
        INSERT INTO public.blocked_users (user_id, blocked_user_id) VALUES (v_viewer, v_blocked);
        SELECT count(*) INTO v_fwd FROM public.find_training_partners(NULL, 200) f WHERE f.id = v_blocked;
        RAISE EXCEPTION 'ROLLBACK_PROBE';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ROLLBACK_PROBE' THEN v_fwd := -1; END IF;
      END;
      BEGIN
        INSERT INTO public.blocked_users (user_id, blocked_user_id) VALUES (v_blocked, v_viewer);
        SELECT count(*) INTO v_rev FROM public.find_training_partners(NULL, 200) f WHERE f.id = v_blocked;
        RAISE EXCEPTION 'ROLLBACK_PROBE';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ROLLBACK_PROBE' THEN v_rev := -1; END IF;
      END;
      INSERT INTO reh_probe VALUES
        (15, 'C7 a blocked athlete disappears, in BOTH directions',
         'viewer-blocks-them rows=' || coalesce(v_fwd::text,'?') ||
         '   they-block-viewer rows=' || coalesce(v_rev::text,'?') || ' (both must be 0)',
         v_fwd = 0 AND v_rev = 0);
    END;
  END IF;

  -- ── D1: the sport filter narrows rather than empties ─────────────────────
  DECLARE v_sport text; v_filtered integer; v_expected integer;
  BEGIN
    SELECT u.sports[1] INTO v_sport FROM reh_result r JOIN public.users u ON u.id = r.id
     WHERE cardinality(coalesce(u.sports,'{}')) > 0 LIMIT 1;
    IF v_sport IS NULL THEN
      INSERT INTO reh_probe VALUES (16, 'D1 the sport filter narrows correctly',
        'skipped: no returned athlete has a sport', true);
    ELSE
      SELECT count(*) INTO v_filtered FROM public.find_training_partners(v_sport, 200);
      SELECT count(*) INTO v_expected
        FROM reh_result r JOIN public.users u ON u.id = r.id
       WHERE coalesce(u.sports,'{}') @> ARRAY[v_sport];
      INSERT INTO reh_probe VALUES
        (16, 'D1 the sport filter returns exactly the athletes who have that sport',
         'sport=' || v_sport || '  filtered=' || v_filtered || '  expected=' || v_expected,
         v_filtered = v_expected AND v_filtered > 0);
    END IF;
  END;

END $outer$;

-- The one result set. Every row must read PASS. 18 of 18.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

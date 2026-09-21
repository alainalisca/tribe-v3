-- 180_find_training_partners_rpc.sql
--
-- Server-side ranking for Find Training Partners. Returns ranked athletes with
-- NO COORDINATES AND NO DISTANCE.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IS ACTUALLY LEAKING TODAY, SIZED CORRECTLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- fetchNearbyAthletes runs in the BROWSER and selects location_lat and
-- location_lng from users_discoverable. So every logged-in user's network
-- response already contains the rounded coordinates of every athlete the card
-- shows. The `{partner.distance_km} km` label on the card is computed from
-- those coordinates in JS.
--
-- THE LEAK IS A PLAIN READ OF THE NETWORK RESPONSE. No derivation is needed.
-- An earlier version of this header claimed trilateration across spoofed
-- origins; that was wrong in the direction of making it sound harder than it
-- is. users_discoverable rounds to 2 decimals BEFORE the browser sees
-- anything, so the rounded coordinate is the floor -- trilateration cannot go
-- beneath it, and it does not need to, because the rounded pair is right
-- there in the payload.
--
-- THEREFORE DELETING THE DISTANCE LABEL FIXES NOTHING. It removes a rendering
-- of data the client still holds. The fix is to stop sending position, which
-- means the ranking has to happen here.
--
-- AND IT IS WHAT MAKES THE PERMANENT-GRANULARITY RULE ENFORCEABLE. Neighborhood
-- precision is the permanent display granularity, not a stopgap; a future real
-- GPS fix may refine RANKING but must never be displayed. That is impossible
-- while the client ranks, because anything the client receives is displayable.
-- Once ordering is produced here, precision can improve server-side forever
-- without a single coordinate crossing the wire.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE VIEWER'S ORIGIN IS auth.uid(), NOT A PARAMETER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- fetchNearbyAthletes takes lat and lng as ARGUMENTS and never checks they
-- belong to the caller. This function takes no origin at all: it reads the
-- caller's own stored coordinates. A caller cannot ask "who is near this
-- arbitrary point", which is a question the product never needs and an
-- attacker always wants.
--
-- It reads the RAW columns, not the rounded view. That is safe precisely
-- because nothing positional is returned, and it is the mechanism by which
-- better data can improve ranking later without changing what is exposed.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RANKING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- EVERY athlete is returned, which is the point of the change. Requiring
-- coordinates to appear on the card excluded people for having skipped a
-- profile field.
--
--   rank_group 0  the viewer AND the athlete both have coordinates
--                 -> ordered by true distance, ascending
--   rank_group 1  everyone else
--                 -> ordered by shared sports with the viewer, descending
--
-- If the VIEWER has no coordinates, every athlete lands in group 1 and the
-- whole list is shared-sport ranked. No city-centroid fallback: the client
-- currently substitutes Medellin's centre when the viewer has no location,
-- which silently answers a different question than the one asked.
--
-- SHARED SPORTS ARE COMPUTED AGAINST THE VIEWER. The old shared_sport_count
-- was `uSports.length` -- the OTHER athlete's total number of sports, which
-- shares nothing with anybody. It was misnamed and consumed by nothing.
--
-- NOTHING ABOUT LOCATION CROSSES THE WIRE, INCLUDING has_location AND
-- rank_group. Both were in an earlier draft: has_location because the card
-- could explain its ordering, rank_group because it is an integer rather than
-- a position. Dropping one while keeping the other gains nothing -- rank_group
-- IS has_location, re-encoded -- and neither is needed, because the RPC
-- returns rows IN ORDER and the card needs only the order. rank_group still
-- exists inside the query, where it drives ORDER BY and is never selected.
--
-- BLOCKS ARE HONOURED IN BOTH DIRECTIONS. SCOPE ADDED BEYOND THE BRIEF, named
-- here so it is visible in review rather than discovered in the diff: the
-- client path never checked blocked_users at all, so someone a user had
-- blocked could appear on the card and be invited to a session.

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

-- ── Guards ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_positional text;
  v_secdef     boolean;
  v_anon       boolean;
BEGIN
  -- THE LOAD-BEARING GUARD. The entire point of this function is that nothing
  -- positional crosses the wire. Asserting it against the declared return type
  -- means a later CREATE OR REPLACE that adds `distance_km` back "just for
  -- sorting on the client" fails here rather than shipping.
  SELECT string_agg(a.attname, ', ')
    INTO v_positional
    FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    JOIN pg_attribute a ON a.attrelid = t.typrelid
   WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure
     AND a.attnum > 0 AND NOT a.attisdropped
     AND (a.attname ILIKE '%lat%' OR a.attname ILIKE '%lng%'
       OR a.attname ILIKE '%lon%' OR a.attname ILIKE '%distance%'
       OR a.attname ILIKE '%coord%' OR a.attname ILIKE '%location%'
       OR a.attname = 'rank_group');

  IF v_positional IS NOT NULL THEN
    RAISE EXCEPTION
      '180 ABORTED: find_training_partners returns positional column(s): %. '
      'Nothing positional may cross the wire -- the client is what must not '
      'have it. Rank here and return an order.', v_positional;
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

  RAISE NOTICE '180: find_training_partners created. No positional column is returned.';
END $$;

-- ── Verification. Every *_ok must read true. ────────────────────────────────
SELECT
  coalesce((SELECT p.prosecdef FROM pg_proc p
     WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure), false)
                                                                          AS security_definer_ok,
  (NOT has_function_privilege('anon',
     'public.find_training_partners(text, integer)', 'EXECUTE'))          AS anon_cannot_execute_ok,
  has_function_privilege('authenticated',
     'public.find_training_partners(text, integer)', 'EXECUTE')           AS authenticated_can_execute_ok,
  (SELECT count(*) FROM pg_proc p
     JOIN pg_type t ON t.oid = p.prorettype
     JOIN pg_attribute a ON a.attrelid = t.typrelid
    WHERE p.oid = 'public.find_training_partners(text, integer)'::regprocedure
      AND a.attnum > 0 AND NOT a.attisdropped
      AND (a.attname ILIKE '%lat%' OR a.attname ILIKE '%lng%'
        OR a.attname ILIKE '%distance%')) = 0                             AS no_positional_column_ok;

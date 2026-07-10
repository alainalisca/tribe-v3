-- Migration 114 — T-SEC4 Gate 1 (additive, rolling-safe)
--
-- Adds the server-side objects that let the app stop reading raw
-- users.location_lat / users.location_lng, AHEAD of Gate 3 which revokes those
-- two columns from anon + authenticated.
--
-- THIS MIGRATION REVOKES NOTHING ON public.users. Raw coords remain readable by
-- anon and authenticated exactly as they are today. Every existing reader keeps
-- working unchanged. It is safe to sit in production before the Gate 2 code
-- lands, and is fully reversible by dropping the view and the function.
--
-- Deploy order (rolling-safe): 114 (this) -> Gate 2 code -> Gate 3 revoke.
--
-- Two objects, deliberately split:
--   * users_discoverable  — a VIEW, because every cross-user reader is a
--     filtered list query (is_instructor, .in(id,...), ordering, pagination).
--     Coords are rounded to 2 decimals (~1.1 km cell at Medellin's latitude).
--   * get_my_location()   — a FUNCTION, because the self path is a single row.
--     Self gets its OWN RAW coords; that is the caller's own data.
--
-- Both are granted to `authenticated` ONLY. `/instructors`, `/connections` and
-- `/training-partners` are all behind the middleware auth gate, and the one
-- public page that reads `users` (/i/[id]) selects no coords. So anon needs no
-- coord access at all — stricter than today, where anon reads raw coords.

-- ---------------------------------------------------------------------------
-- 1) users_discoverable — fuzzed, cross-user readable projection of `users`.
-- ---------------------------------------------------------------------------
-- security_invoker = false (the PG15 default, stated explicitly) so the view
-- executes as its owner. That is what lets it keep reading location_lat/lng
-- after Gate 3 revokes them from `authenticated`. Supabase's linter flags this
-- as a security-definer view; that is intentional and required here.
--
-- round() has no (double precision, int) overload, hence the ::numeric cast.
-- The rounded columns keep the raw column NAMES so consumers are a drop-in swap.
--
-- Soft-deleted / banned / test accounts are filtered out here rather than in
-- each caller. `IS NOT TRUE` (not `= false`) so a NULL never drops a real user.
CREATE OR REPLACE VIEW public.users_discoverable
WITH (security_invoker = false) AS
SELECT
  u.id,
  u.name,
  u.avatar_url,
  u.photos,
  u.sports,
  u.specialties,
  u.location,                                     -- free-text city, already public
  round(u.location_lat::numeric, 2) AS location_lat,
  round(u.location_lng::numeric, 2) AS location_lng,
  u.is_instructor,
  u.is_verified_instructor,
  u.storefront_tagline,
  u.average_rating,
  u.total_reviews,
  u.total_sessions_hosted,
  u.years_experience,
  u.bio,
  u.instructor_bio,
  u.created_at
FROM public.users u
WHERE u.deleted_at IS NULL
  AND u.banned IS NOT TRUE
  AND u.is_test_account IS NOT TRUE;

COMMENT ON VIEW public.users_discoverable IS
  'T-SEC4: cross-user readable projection of public.users. location_lat/location_lng '
  'are ROUNDED TO 2 DECIMALS (~1.1km), never raw. Owner-executed so it still reads the '
  'raw columns after migration 115 revokes them. authenticated only; anon has no access.';

-- Supabase ALTER DEFAULT PRIVILEGES grants SELECT on new public views to anon
-- AND authenticated at CREATE time, so revoking from PUBLIC alone is not enough
-- (the T-SEC3 lesson: anon holds a DIRECT grant). Revoke anon explicitly.
REVOKE ALL ON public.users_discoverable FROM PUBLIC;
REVOKE ALL ON public.users_discoverable FROM anon;
GRANT SELECT ON public.users_discoverable TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) get_my_location() — the caller's OWN raw coords. Self only.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it still reads the columns after Gate 3. Scoped strictly
-- to auth.uid(), so a caller can only ever see their own row. Returns jsonb to
-- avoid RETURNS TABLE column-type drift (location_lat is float8).
--
-- Today its only consumer needs presence (`location_lat != null`) for
-- computeLocationKnown, but returning the values is correct: it is the user's
-- own data, and it keeps a self "your location" read possible without a revoke.
CREATE OR REPLACE FUNCTION public.get_my_location()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'location_lat', u.location_lat,
    'location_lng', u.location_lng
  )
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_location() IS
  'T-SEC4: returns the CALLING user''s own raw location_lat/location_lng as jsonb. '
  'Scoped to auth.uid(). authenticated only; anon explicitly revoked.';

REVOKE ALL ON FUNCTION public.get_my_location() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_location() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_location() TO authenticated;

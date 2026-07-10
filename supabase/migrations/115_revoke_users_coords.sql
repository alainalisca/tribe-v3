-- Migration 115 — T-SEC4 Gate 3 (the revoke)
--
-- Removes the anon + authenticated SELECT grants on users.location_lat and
-- users.location_lng. A live anon-key REST probe confirmed both currently
-- return HTTP 200 to a logged-out caller, so this closes an unauthenticated
-- exposure (latent today — all coords are NULL — but it seals the door before
-- the geolocation feature starts populating them).
--
-- Targeted column REVOKE, not the 066/067 regenerate pattern: REVOKE SELECT ON
-- <table> does not clear column-level grants, and these are held as column
-- grants (no table-level grant on users since 067). The T-SEC3 migration 113
-- established this is the correct instrument.
--
-- PREREQUISITES — both live before this runs (rolling-safe order, both DONE):
--   1. migration 114 (users_discoverable view + get_my_location()) — applied
--   2. T-SEC4 Gate 2 code (PR #96, merged becd5cd) — cross-user coord readers
--      moved onto the view; self reads via get_my_location()
-- After this, cross-user coords come from users_discoverable (rounded to 2dp,
-- owner-executed so it still reads the raw columns); self reads its own raw
-- coords via get_my_location() (SECURITY DEFINER); server code uses
-- service_role, which bypasses column grants.
--
-- Reversible:
--   GRANT SELECT (location_lat, location_lng) ON public.users
--     TO authenticated, anon;

REVOKE SELECT (location_lat, location_lng) ON public.users FROM authenticated;

REVOKE SELECT (location_lat, location_lng) ON public.users FROM anon;

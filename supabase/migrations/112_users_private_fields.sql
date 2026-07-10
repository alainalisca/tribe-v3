-- Migration 112 — T-SEC3 Phase A (additive, rolling-safe)
--
-- Adds server-side accessors so the app can stop reading sensitive `users`
-- columns directly, AHEAD of migration 113 which REVOKEs them from the
-- anon/authenticated roles. This migration changes NO existing behavior: it
-- only creates two SECURITY DEFINER helpers and (re)grants EXECUTE. It is safe
-- to apply on its own and safe to leave in place.
--
-- Deploy order (rolling-safe): 112 (this) -> code PR that uses these helpers
-- -> 113 (the REVOKE). The helpers and the code must be live before the revoke,
-- so nothing breaks in the window between them.
--
-- Columns locked down in 113: is_admin, payout_method, stripe_account_id,
-- wompi_merchant_id, total_earnings_cents. Their only readers are:
--   - is_admin self-check        -> is_app_admin()          (already exists, definer)
--   - is_admin admin-id lookup   -> get_admin_user_ids()    (new, definer, below)
--   - own payout/earnings fields -> get_my_private_profile() (new, definer, below)
--   - stripe/wompi/earnings       -> server routes only (service_role, unaffected)
--
-- NOT part of this pass (deliberately): `email` (Tribe.OS attendance matches
-- participants to CRM clients by email — reworked in follow-up T-SEC5) and
-- `location_lat`/`location_lng` (discovery + connections/nearby-athletes read
-- raw coords cross-user — reworked in follow-up T-SEC4). Both stay readable.

-- 1) Own private profile fields, self only. SECURITY DEFINER so it still reads
--    the columns after 113 revokes them from `authenticated`; scoped strictly
--    to auth.uid() so a caller can only ever see their OWN row. Returns jsonb
--    to avoid RETURNS TABLE column-type drift (e.g. int vs bigint on the
--    earnings column).
CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'payout_method',        u.payout_method,
    'stripe_account_id',    u.stripe_account_id,
    'wompi_merchant_id',    u.wompi_merchant_id,
    'total_earnings_cents', u.total_earnings_cents,
    'earnings_currency',    u.earnings_currency
  )
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to `anon` DIRECTLY on new
-- public functions, so revoking only from PUBLIC leaves anon able to call this.
-- Revoke from anon explicitly (harmless here — anon has no auth.uid() — but kept
-- tight for consistency).
REVOKE ALL ON FUNCTION public.get_my_private_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;

-- 2) Admin user IDs, for "notify the admins" flows (e.g. partner-program
--    applications from app/partners/apply). Replaces the client-side
--    `select id from users where is_admin = true`, which 113 would break.
--    Returns only admin UUIDs — it never exposes the is_admin flag of an
--    arbitrary queried user.
CREATE OR REPLACE FUNCTION public.get_admin_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.users WHERE is_admin = true;
$$;

-- Revoke from anon explicitly (see note above). This one matters: as a
-- SECURITY DEFINER, an anon caller would otherwise be able to enumerate admin
-- UUIDs. anon must NOT be able to call it.
REVOKE ALL ON FUNCTION public.get_admin_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_ids() TO authenticated;

-- 3) The existing self admin-check helper is already SECURITY DEFINER and used
--    inside RLS policies; ensure it is callable as a PostgREST RPC by the app
--    once the client stops reading the is_admin column directly. Idempotent.
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

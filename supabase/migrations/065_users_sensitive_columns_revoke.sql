-- 065_users_sensitive_columns_revoke.sql
-- Fix for the RLS leak found by scripts/rls-leak-test.js (Week 4 Mission 1).
--
-- The base RLS policy on public.users is "Users can view all profiles"
-- (FOR SELECT USING (true)) — fine for public profile data like name,
-- avatar, location, but it also exposes sensitive Tribe.OS billing
-- columns added in later migrations (060). The leak test confirmed
-- that user B can read user A's tribe_os_stripe_customer_id via a
-- direct PostgREST query.
--
-- Postgres RLS is row-level, not column-level. To restrict specific
-- columns without rewriting every cross-user user read in the app,
-- we use column-level GRANT/REVOKE on the authenticated and anon
-- roles. After this migration:
--   - tribe_os_stripe_customer_id     : service-role only
--   - tribe_os_stripe_subscription_id : service-role only
--   - tribe_os_granted_at             : service-role only
--   - tribe_os_granted_by             : service-role only
--
-- Compatibility:
--   - lib/dal/tribeOSPremium.ts (manual grant/revoke): runs with
--     service-role from the admin route — unaffected.
--   - lib/dal/tribeOSSubscription.ts (Stripe webhook DAL): runs with
--     service-role — unaffected.
--   - app/api/tribe-os/subscription/{checkout,portal}: service-role —
--     unaffected.
--   - scripts/grant-tribe-os-premium.js + scripts/rls-leak-test.js:
--     service-role — unaffected.
--   - app/dashboard/instructor/page.tsx had a `select('*')` on users
--     which would have tripped over the revoked columns. Fixed in the
--     same commit to use fetchUserProfile (which selects an explicit
--     column list excluding the sensitive Tribe.OS fields).
--
-- Known remaining exposure (documented for Week 5 hardening):
--   - tribe_os_tier and tribe_os_status remain readable cross-user.
--     Removing them would break useTribeOSPremiumGate (client-side
--     reads of self's own tier/status). Cleanest long-term fix is
--     either (a) replace the wildcard SELECT policy with a self-only
--     policy + users_public view for cross-user reads, or (b) route
--     the gate check through a server endpoint that uses service-role.
--     Both are bigger changes. Tracked as DEFER.

REVOKE SELECT (
  tribe_os_stripe_customer_id,
  tribe_os_stripe_subscription_id,
  tribe_os_granted_at,
  tribe_os_granted_by
) ON public.users FROM authenticated;

REVOKE SELECT (
  tribe_os_stripe_customer_id,
  tribe_os_stripe_subscription_id,
  tribe_os_granted_at,
  tribe_os_granted_by
) ON public.users FROM anon;

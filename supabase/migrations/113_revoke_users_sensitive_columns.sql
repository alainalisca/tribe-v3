-- Migration 113 — T-SEC3 Phase B (targeted column REVOKE)
--
-- Removes the anon/authenticated SELECT grants on 5 sensitive `users` columns
-- so they are no longer cross-user readable:
--   is_admin, payout_method, stripe_account_id, wompi_merchant_id,
--   total_earnings_cents
--
-- Why a targeted column REVOKE (not the 066/067 regenerate pattern): those
-- columns currently hold COLUMN-level grants (verified live — no table-level
-- SELECT grant exists on users for these roles since 067). `REVOKE SELECT ON
-- <table>` does NOT clear column-level grants, so the regenerate pattern would
-- silently leave these readable. A column REVOKE is the correct instrument and
-- matches the Option-C decision.
--
-- PREREQUISITES — both must be live BEFORE this runs (rolling-safe order):
--   1. migration 112 (get_my_private_profile / get_admin_user_ids helpers)
--   2. the T-SEC3 Phase 2 code (fetchUserProfile narrowed; is_admin + payout
--      reads routed through the RPCs)
-- After this, self still reads its own admin status via is_app_admin() and its
-- payout/earnings via get_my_private_profile(); server code uses service_role,
-- which bypasses these grants.
--
-- Reversible:
--   GRANT SELECT (is_admin, payout_method, stripe_account_id,
--                 wompi_merchant_id, total_earnings_cents)
--     ON public.users TO authenticated, anon;

REVOKE SELECT (is_admin, payout_method, stripe_account_id, wompi_merchant_id, total_earnings_cents)
  ON public.users FROM authenticated;

REVOKE SELECT (is_admin, payout_method, stripe_account_id, wompi_merchant_id, total_earnings_cents)
  ON public.users FROM anon;

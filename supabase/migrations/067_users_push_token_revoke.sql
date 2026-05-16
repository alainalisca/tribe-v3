-- 067_users_push_token_revoke.sql
-- Conservative extension of 066 for columns that are SAFELY restrictable
-- without breaking any session-client read paths. The Week 4 audit
-- caught that `users` exposes a much wider set of sensitive columns
-- (payout_*, stripe_account_id, emergency_*, date_of_birth) cross-user.
-- Most of those are read by self via the session client in places like
-- /earnings/payout-settings and /api/stripe/connect/*, so a column-level
-- REVOKE would also block the user from reading their own data and
-- break the app.
--
-- The proper fix for those wider columns is the `users_public` view
-- architecture (see docs/LATER.md). This migration handles only the
-- subset where the answer is unambiguous:
--
--   push_subscription, fcm_token, fcm_platform, fcm_updated_at
--
-- These four are read ONLY by service-role server code (notifications
-- send route, chat-message webhook, cron jobs). Authenticated session
-- clients never need them. Restricting them is pure win — no app
-- breakage, blocks a real impersonation-adjacent leak (push
-- subscription contains private keys that could let a third party
-- send notifications impersonating the platform).
--
-- Same dynamic-GRANT pattern as 066 + 067 (now extended). Future
-- columns on users remain private-by-default.

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name NOT IN (
      -- Tribe.OS billing (excluded since 066)
      'tribe_os_stripe_customer_id',
      'tribe_os_stripe_subscription_id',
      'tribe_os_granted_at',
      'tribe_os_granted_by',
      -- Push / device identity. Read only by service-role. Safe to
      -- restrict from authenticated/anon. Blocks the impersonation-
      -- adjacent leak documented in the Week 4 audit.
      'push_subscription',
      'fcm_token',
      'fcm_platform',
      'fcm_updated_at'
    );

  IF cols IS NULL THEN
    RAISE EXCEPTION 'no safe columns found on public.users; refusing to apply';
  END IF;

  EXECUTE 'REVOKE SELECT ON public.users FROM authenticated';
  EXECUTE 'REVOKE SELECT ON public.users FROM anon';
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.users TO authenticated';
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.users TO anon';
END $$;

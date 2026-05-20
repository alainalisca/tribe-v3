-- Migration 093: restore SELECT grant on public.users to the authenticated role.
--
-- All profile pages were rendering blank with the error
-- `permission denied for table users` from the client SDK. Investigation showed
-- that the `authenticated` role had INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER on public.users but NO SELECT. Postgres checks table-level grants
-- BEFORE RLS, so RLS never even got a chance to evaluate — every profile read
-- returned "permission denied."
--
-- Most likely cause: migration 065's column-level
-- `REVOKE SELECT (sensitive_cols) ON public.users FROM authenticated`
-- inadvertently dropped the table-level SELECT grant (a long-standing Postgres
-- quirk where mixing column-level REVOKE with prior table-level GRANT can
-- collapse the table grant on some versions / re-runs).
--
-- This migration restores the table-level grant and then re-applies the
-- intended column-level revoke from 065 so the sensitive Tribe.OS billing
-- columns stay hidden from the client.

GRANT SELECT ON public.users TO authenticated;

REVOKE SELECT (
  tribe_os_stripe_customer_id,
  tribe_os_stripe_subscription_id,
  tribe_os_granted_at,
  tribe_os_granted_by
) ON public.users FROM authenticated;

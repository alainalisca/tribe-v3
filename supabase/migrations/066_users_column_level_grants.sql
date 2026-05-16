-- 066_users_column_level_grants.sql
-- Supersedes 065. The column-level REVOKE in 065 had no effect because
-- the table-level GRANT SELECT (applied by default by Supabase) takes
-- precedence over column-level REVOKE. To actually restrict specific
-- columns, we must:
--   1. REVOKE the table-level SELECT
--   2. GRANT SELECT on the specific safe columns
--
-- This makes the four sensitive Tribe.OS billing columns
-- (tribe_os_stripe_customer_id, tribe_os_stripe_subscription_id,
-- tribe_os_granted_at, tribe_os_granted_by) inaccessible to the
-- authenticated and anon roles. The service-role retains full access.
--
-- The GRANT list is generated dynamically from information_schema so
-- this migration applies safely regardless of what columns currently
-- exist on the table. Trade-off: future migrations adding columns to
-- public.users MUST include a `GRANT SELECT (new_col) ON public.users
-- TO authenticated, anon` line, otherwise the new column will be
-- invisible to non-service callers. This is the security-by-default
-- posture we want for Tribe.OS billing data.

DO $$
DECLARE
  cols text;
BEGIN
  -- Build a comma-separated list of every column on public.users
  -- EXCEPT the four sensitive Tribe.OS billing columns.
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name NOT IN (
      'tribe_os_stripe_customer_id',
      'tribe_os_stripe_subscription_id',
      'tribe_os_granted_at',
      'tribe_os_granted_by'
    );

  IF cols IS NULL THEN
    RAISE EXCEPTION 'no safe columns found on public.users; refusing to apply';
  END IF;

  -- Revoke the table-level SELECT first so column-level grants take effect.
  EXECUTE 'REVOKE SELECT ON public.users FROM authenticated';
  EXECUTE 'REVOKE SELECT ON public.users FROM anon';

  -- Re-grant SELECT on the safe-column subset only.
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.users TO authenticated';
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.users TO anon';
END $$;

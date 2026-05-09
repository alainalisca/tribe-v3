-- DRAFT — NOT APPLIED. See draft/README.md for promotion checklist.
--
-- Phase 2 Tribe.OS: aggregated revenue metrics for an instructor over a
-- period. Source for the future /os/revenue dashboard.
--
-- Implemented as a SQL function rather than a materialized view so it
-- can be parameterized by user + period. Marked STABLE so Postgres can
-- cache results within a single statement; not IMMUTABLE because the
-- underlying payments table changes over time.
--
-- Open questions to resolve before applying:
--   - Should we count `pending` payments (not yet confirmed by gateway)
--     toward "revenue" or only `approved`? Currently approved-only.
--     Validation signal will clarify whether instructors want a
--     "pending pipeline" view alongside.
--   - Should this reconcile against package_purchases (revenue from
--     packages) and subscription_payments (revenue from Tribe.OS itself,
--     for the platform's own dashboard)? Probably yes for full
--     instructor-facing accuracy. Out of scope for V1.
--   - Currency: returned as separate USD + COP totals rather than
--     converted, matching the rest of the codebase. UI does the display
--     conversion.

CREATE OR REPLACE FUNCTION instructor_revenue_summary(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS TABLE (
  total_payments_count bigint,
  total_amount_cents_usd bigint,
  total_amount_cents_cop bigint,
  platform_fee_cents_usd bigint,
  platform_fee_cents_cop bigint,
  net_to_instructor_cents_usd bigint,
  net_to_instructor_cents_cop bigint,
  unique_payers_count bigint,
  sessions_with_payments_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_payments_count,
    COALESCE(SUM(CASE WHEN p.currency = 'USD' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_amount_cents_usd,
    COALESCE(SUM(CASE WHEN p.currency = 'COP' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_amount_cents_cop,
    COALESCE(SUM(CASE WHEN p.currency = 'USD' THEN p.platform_fee_cents ELSE 0 END), 0)::bigint AS platform_fee_cents_usd,
    COALESCE(SUM(CASE WHEN p.currency = 'COP' THEN p.platform_fee_cents ELSE 0 END), 0)::bigint AS platform_fee_cents_cop,
    COALESCE(
      SUM(CASE WHEN p.currency = 'USD' THEN p.amount_cents - COALESCE(p.platform_fee_cents, 0) ELSE 0 END),
      0
    )::bigint AS net_to_instructor_cents_usd,
    COALESCE(
      SUM(CASE WHEN p.currency = 'COP' THEN p.amount_cents - COALESCE(p.platform_fee_cents, 0) ELSE 0 END),
      0
    )::bigint AS net_to_instructor_cents_cop,
    COUNT(DISTINCT p.user_id)::bigint AS unique_payers_count,
    COUNT(DISTINCT p.session_id)::bigint AS sessions_with_payments_count
  FROM public.payments p
  JOIN public.sessions s ON s.id = p.session_id
  WHERE s.creator_id = p_user_id
    AND p.status = 'approved'
    AND p.created_at >= p_period_start
    AND p.created_at < p_period_end;
$$;

-- Expose to the authenticated role only — instructors call this for
-- their own data via the dashboard. Service role calls it without grant
-- as usual.
GRANT EXECUTE ON FUNCTION instructor_revenue_summary(uuid, timestamptz, timestamptz) TO authenticated;

-- Defensive: ensure callers can only request their own data. This is
-- enforced at the SQL layer (the WHERE clause filters on s.creator_id =
-- p_user_id) but a future caller might pass an arbitrary uuid. Add an
-- auth.uid() = p_user_id guard at the API/DAL layer when wiring up.
COMMENT ON FUNCTION instructor_revenue_summary IS
  'Returns aggregate revenue metrics for an instructor across [period_start, period_end). Caller must enforce that p_user_id matches the authenticated user — this function does not check.';

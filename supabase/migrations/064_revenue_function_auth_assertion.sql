-- 064_revenue_function_auth_assertion.sql
-- Defense-in-depth for the revenue dashboard SQL functions.
--
-- Migration 063 introduced instructor_revenue_totals and
-- instructor_revenue_buckets as SECURITY DEFINER functions with the
-- documented contract that the caller (lib/dal/revenue.ts) MUST pass
-- p_user_id = auth.uid(). The DAL has always enforced this in practice
-- because it derives userId from supabase.auth.getUser().
--
-- The Week 4 pre-beta security audit flagged that the function bodies
-- themselves do not double-check the contract. If a future caller
-- (refactor mistake, new route, manual SQL call) ever passes the wrong
-- p_user_id, the function would happily return another user's revenue
-- because SECURITY DEFINER bypasses RLS.
--
-- This migration adds an explicit assertion:
--   IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN RAISE
-- The auth.uid() IS NOT NULL check preserves service-role compatibility:
-- service-role calls (e.g. future admin scripts) have auth.uid() = NULL
-- and pass through the check without rejection. Only authenticated
-- (JWT-bearing) callers who pass a mismatched user_id get blocked.
--
-- No data changes. Function bodies are otherwise identical to 063.

CREATE OR REPLACE FUNCTION public.instructor_revenue_totals(
  p_user_id uuid,
  p_period_start_date date,
  p_period_end_date date,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
  currency text,
  gross_cents bigint,
  fee_cents bigint,
  refund_cents bigint,
  net_cents bigint,
  payment_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func_totals$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  -- Defense-in-depth: an authenticated caller can only request their
  -- own data. Service-role calls (auth.uid() IS NULL) pass through.
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized: p_user_id must match auth.uid()'
      USING ERRCODE = '42501';
  END IF;

  v_period_start := p_period_start_date::timestamp AT TIME ZONE p_timezone;
  v_period_end := p_period_end_date::timestamp AT TIME ZONE p_timezone;

  RETURN QUERY
  WITH gross AS (
    SELECT
      p.currency,
      SUM(p.amount_cents)::bigint AS gross_cents,
      SUM(p.platform_fee_cents)::bigint AS fee_cents,
      COUNT(*)::bigint AS payment_count
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    LEFT JOIN users u_creator ON u_creator.id = s.creator_id
    LEFT JOIN users u_participant ON u_participant.id = p.participant_user_id
    WHERE s.creator_id = p_user_id
      AND p.status = 'approved'
      AND p.created_at >= v_period_start
      AND p.created_at < v_period_end
      AND COALESCE(u_creator.is_test_account, false) = false
      AND COALESCE(u_participant.is_test_account, false) = false
    GROUP BY p.currency
  ),
  refunds AS (
    SELECT
      p.currency,
      SUM(p.refunded_amount_cents)::bigint AS refund_cents
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    LEFT JOIN users u_creator ON u_creator.id = s.creator_id
    LEFT JOIN users u_participant ON u_participant.id = p.participant_user_id
    WHERE s.creator_id = p_user_id
      AND p.refunded_at IS NOT NULL
      AND p.refunded_at >= v_period_start
      AND p.refunded_at < v_period_end
      AND COALESCE(u_creator.is_test_account, false) = false
      AND COALESCE(u_participant.is_test_account, false) = false
    GROUP BY p.currency
  )
  SELECT
    COALESCE(g.currency, r.currency) AS currency,
    COALESCE(g.gross_cents, 0)::bigint AS gross_cents,
    COALESCE(g.fee_cents, 0)::bigint AS fee_cents,
    COALESCE(r.refund_cents, 0)::bigint AS refund_cents,
    (COALESCE(g.gross_cents, 0)
      - COALESCE(g.fee_cents, 0)
      - COALESCE(r.refund_cents, 0))::bigint AS net_cents,
    COALESCE(g.payment_count, 0)::bigint AS payment_count
  FROM gross g
  FULL OUTER JOIN refunds r USING (currency);
END
$func_totals$;

CREATE OR REPLACE FUNCTION public.instructor_revenue_buckets(
  p_user_id uuid,
  p_period_start_date date,
  p_period_end_date date,
  p_group_by text,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
  bucket_start timestamptz,
  currency text,
  gross_cents bigint,
  fee_cents bigint,
  refund_cents bigint,
  net_cents bigint,
  payment_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func_buckets$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  -- Defense-in-depth: an authenticated caller can only request their
  -- own data. Service-role calls (auth.uid() IS NULL) pass through.
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized: p_user_id must match auth.uid()'
      USING ERRCODE = '42501';
  END IF;

  IF p_group_by NOT IN ('week', 'month') THEN
    RAISE EXCEPTION 'invalid p_group_by: must be "week" or "month", got %', p_group_by;
  END IF;

  v_period_start := p_period_start_date::timestamp AT TIME ZONE p_timezone;
  v_period_end := p_period_end_date::timestamp AT TIME ZONE p_timezone;

  RETURN QUERY
  WITH gross AS (
    SELECT
      date_trunc(p_group_by, p.created_at, p_timezone) AS bucket_start,
      p.currency,
      SUM(p.amount_cents)::bigint AS gross_cents,
      SUM(p.platform_fee_cents)::bigint AS fee_cents,
      COUNT(*)::bigint AS payment_count
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    LEFT JOIN users u_creator ON u_creator.id = s.creator_id
    LEFT JOIN users u_participant ON u_participant.id = p.participant_user_id
    WHERE s.creator_id = p_user_id
      AND p.status = 'approved'
      AND p.created_at >= v_period_start
      AND p.created_at < v_period_end
      AND COALESCE(u_creator.is_test_account, false) = false
      AND COALESCE(u_participant.is_test_account, false) = false
    GROUP BY date_trunc(p_group_by, p.created_at, p_timezone), p.currency
  ),
  refunds AS (
    SELECT
      date_trunc(p_group_by, p.refunded_at, p_timezone) AS bucket_start,
      p.currency,
      SUM(p.refunded_amount_cents)::bigint AS refund_cents
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    LEFT JOIN users u_creator ON u_creator.id = s.creator_id
    LEFT JOIN users u_participant ON u_participant.id = p.participant_user_id
    WHERE s.creator_id = p_user_id
      AND p.refunded_at IS NOT NULL
      AND p.refunded_at >= v_period_start
      AND p.refunded_at < v_period_end
      AND COALESCE(u_creator.is_test_account, false) = false
      AND COALESCE(u_participant.is_test_account, false) = false
    GROUP BY date_trunc(p_group_by, p.refunded_at, p_timezone), p.currency
  )
  SELECT
    COALESCE(g.bucket_start, r.bucket_start) AS bucket_start,
    COALESCE(g.currency, r.currency) AS currency,
    COALESCE(g.gross_cents, 0)::bigint AS gross_cents,
    COALESCE(g.fee_cents, 0)::bigint AS fee_cents,
    COALESCE(r.refund_cents, 0)::bigint AS refund_cents,
    (COALESCE(g.gross_cents, 0)
      - COALESCE(g.fee_cents, 0)
      - COALESCE(r.refund_cents, 0))::bigint AS net_cents,
    COALESCE(g.payment_count, 0)::bigint AS payment_count
  FROM gross g
  FULL OUTER JOIN refunds r
    ON g.bucket_start = r.bucket_start
    AND g.currency = r.currency
  ORDER BY 1, 2;
END
$func_buckets$;

-- 071_gym_revenue_functions.sql
-- Phase 2 Tribe.OS Week 2 Mission 2: multi-coach revenue SQL functions.
--
-- Background
-- ----------
-- The Week 1 instructor_revenue_totals / instructor_revenue_buckets
-- functions (migration 063 + 064 auth assertion) are keyed on
-- p_user_id and gated by auth.uid() = p_user_id. They cannot be
-- invoked with a gym id today, which means non-owner coaches cannot
-- read the gym's revenue.
--
-- These new functions:
--   - Are keyed on p_gym_id
--   - Query payments via the denormalized payments.gym_id column
--     (backfilled in migration 069, indexed by idx_payments_gym_approved
--     in migration 068) — skips the sessions.creator_id hop entirely
--   - Are gated by EXISTS (SELECT 1 FROM gym_coaches WHERE gym_id =
--     p_gym_id AND user_id = auth.uid()), so any coach in the gym
--     can read the gym's revenue, not just the owner
--   - Preserve the same RETURNS TABLE shape as the user-keyed
--     functions so the DAL can swap with zero result-shape change
--   - Preserve the same test-account exclusion via the sessions +
--     users join (each session's creator might be a test account
--     coach; that coach's revenue stays excluded)
--
-- The user-keyed functions are NOT removed. They remain the path for
-- callers without a gym context yet (e.g. transition window where a
-- premium user's gym hasn't been provisioned). The DAL prefers the
-- gym-keyed wrapper when a gym id is available.
--
-- Caller contract
-- ---------------
-- p_gym_id MUST be a gym the caller is a member of (owner or coach).
-- Enforced by the EXISTS check at the top of each function. Unlike
-- the user-keyed contract (which is "caller MUST equal p_user_id"),
-- the gym-keyed contract spreads access across all coaches.

-- ============================================================
-- gym_revenue_totals
-- ============================================================

CREATE OR REPLACE FUNCTION public.gym_revenue_totals(
  p_gym_id uuid,
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
AS $func_gym_totals$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  -- Gate: caller must be a coach in this gym.
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_coaches gc
    WHERE gc.gym_id = p_gym_id AND gc.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller is not a coach in gym %', p_gym_id
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
    -- Sessions + creator join kept for test-account exclusion.
    -- payments.gym_id is the new scoping column (backfilled in 069),
    -- but we still want to skip rows whose creator is a test account.
    JOIN sessions s ON s.id = p.session_id
    LEFT JOIN users u_creator ON u_creator.id = s.creator_id
    LEFT JOIN users u_participant ON u_participant.id = p.participant_user_id
    WHERE p.gym_id = p_gym_id
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
    WHERE p.gym_id = p_gym_id
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
$func_gym_totals$;

GRANT EXECUTE ON FUNCTION public.gym_revenue_totals(uuid, date, date, text) TO authenticated;

COMMENT ON FUNCTION public.gym_revenue_totals IS
  'Returns aggregate revenue (gross, fee, refund, net, payment_count) per currency for a gym across [period_start_date, period_end_date) interpreted in p_timezone. Gated by gym_coaches membership: any coach in the gym can read these totals. Refunds counted in the period they were issued.';

-- ============================================================
-- gym_revenue_buckets
-- ============================================================

CREATE OR REPLACE FUNCTION public.gym_revenue_buckets(
  p_gym_id uuid,
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
AS $func_gym_buckets$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  IF p_group_by NOT IN ('week', 'month') THEN
    RAISE EXCEPTION 'invalid p_group_by: must be "week" or "month", got %', p_group_by;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gym_coaches gc
    WHERE gc.gym_id = p_gym_id AND gc.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller is not a coach in gym %', p_gym_id
      USING ERRCODE = '42501';
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
    WHERE p.gym_id = p_gym_id
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
    WHERE p.gym_id = p_gym_id
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
$func_gym_buckets$;

GRANT EXECUTE ON FUNCTION public.gym_revenue_buckets(uuid, date, date, text, text) TO authenticated;

COMMENT ON FUNCTION public.gym_revenue_buckets IS
  'Returns time-series revenue buckets per currency for a gym over [period_start_date, period_end_date) interpreted in p_timezone, grouped by week or month. Gated by gym_coaches membership. Refunds bucketed by refunded_at (the period they were issued), not the period of the original payment.';

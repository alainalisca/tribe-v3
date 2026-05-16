-- 063_revenue_dashboard.sql
-- Phase 2 Tribe.OS Week 3: revenue dashboard for premium instructors.
--
-- Adds:
--   1. users.timezone — IANA timezone string, for period bucketing in local time.
--   2. users.tribe_os_revenue_currency_default — which currency the dashboard
--      should lead with when an instructor has both USD and COP earnings.
--   3. payments.refunded_at + payments.refunded_amount_cents — refund tracking
--      populated by the charge.refunded Stripe webhook branch (see
--      app/api/payment/webhook/stripe/route.ts).
--   4. Composite + partial indexes on payments to keep the revenue queries
--      fast as payment volume grows.
--   5. Two SQL functions:
--        instructor_revenue_totals  — one row per currency, period totals.
--        instructor_revenue_buckets — one row per (bucket_start, currency),
--                                     grouped by week or month.
--      Both bucket by the instructor's local timezone (date_trunc 3-arg form),
--      and both treat refunds as occurring in the period they were issued, not
--      the period of the original charge.
--
-- Caller contract for the functions: p_user_id MUST equal auth.uid() of the
-- authenticated caller. The DAL layer (lib/dal/revenue.ts) enforces this. The
-- functions themselves do not check, by design — they are SECURITY DEFINER so
-- they can also serve service-role admin queries in the future.
--
-- Supersedes the draft at supabase/migrations/draft/instructor_revenue_summary.draft.sql.
-- Bug fixed during promotion: draft referenced p.user_id which does not exist
-- on the payments table; the real column is p.participant_user_id.
--
-- Scaling note: at <10k instructors and <100k payments total, the on-the-fly
-- scan via these functions is well under 500ms. Once we approach that scale,
-- the clean migration path is a materialized view of
-- (creator_id, bucket_start, currency, gross, fee, refund) refreshed nightly
-- with the current bucket recomputed on read. Function signatures here are
-- forward-compatible with that change — no app-code modifications required
-- when we cut over.
--
-- Test-mode pollution: we filter out payments where the creator OR participant
-- is flagged users.is_test_account = true (migration 052). This catches seed
-- accounts. If a future need arises to track Stripe livemode per payment,
-- add a payments.livemode column and update the WHERE clauses below.

-- ============================================================
-- 1. USERS additions
-- ============================================================

-- IANA timezone string (e.g. 'America/Bogota', 'America/New_York'). Default
-- to Bogotá for the current Medellín market. Non-Bogotá instructors get
-- their timezone auto-populated from the browser on first dashboard load
-- via Intl.DateTimeFormat().resolvedOptions().timeZone.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Bogota';

-- Which currency the revenue dashboard leads with when an instructor has both
-- USD and COP earnings. Nullable; UI infers from payment history if unset.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tribe_os_revenue_currency_default text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_tribe_os_revenue_currency_default_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_tribe_os_revenue_currency_default_check
      CHECK (
        tribe_os_revenue_currency_default IS NULL
        OR tribe_os_revenue_currency_default IN ('USD', 'COP')
      );
  END IF;
END $$;

-- ============================================================
-- 2. PAYMENTS additions (refund tracking)
-- ============================================================

-- When the most recent refund event was processed. NULL = never refunded.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Cumulative refunded amount in cents. Matches Stripe's charge.amount_refunded
-- semantics: it is the running total of all refunds against this charge,
-- not a per-event delta. 0 = no refund; > 0 and <= amount_cents = partial
-- or full refund.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refunded_amount_cents bigint NOT NULL DEFAULT 0;

-- Integrity: refunded_at and refunded_amount_cents must agree, and the
-- refunded amount cannot exceed what was charged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_refund_consistency'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_refund_consistency CHECK (
        (refunded_at IS NULL AND refunded_amount_cents = 0)
        OR (refunded_at IS NOT NULL
            AND refunded_amount_cents > 0
            AND refunded_amount_cents <= amount_cents)
      );
  END IF;
END $$;

-- ============================================================
-- 3. INDEXES for the revenue summary queries
-- ============================================================

-- Drives the gross/fee scan: filters on session_id (joined to creator),
-- status, and date range. Partial index on status='approved' keeps it
-- compact since that's the only status the dashboard reads.
CREATE INDEX IF NOT EXISTS idx_payments_session_status_created
  ON public.payments (session_id, created_at)
  WHERE status = 'approved';

-- Drives the refund scan. Partial index keeps it small since most
-- payments are never refunded.
CREATE INDEX IF NOT EXISTS idx_payments_session_refunded_at
  ON public.payments (session_id, refunded_at)
  WHERE refunded_at IS NOT NULL;

-- ============================================================
-- 4. SQL functions
-- ============================================================

-- Drop the legacy function name from the draft if it was ever applied.
DROP FUNCTION IF EXISTS public.instructor_revenue_summary(uuid, timestamptz, timestamptz);

-- ----- instructor_revenue_totals -----

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
  -- Convert the date inputs to timestamptz at the instructor's local TZ.
  -- p_period_end_date is treated as EXCLUSIVE (start of the day after the
  -- last day the caller wants to include).
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

GRANT EXECUTE ON FUNCTION public.instructor_revenue_totals(uuid, date, date, text) TO authenticated;

COMMENT ON FUNCTION public.instructor_revenue_totals IS
  'Returns aggregate revenue (gross, fee, refund, net, payment_count) per currency for a creator across [period_start_date, period_end_date) interpreted in p_timezone. Refunds counted in the period they were issued. CALLER CONTRACT: p_user_id MUST equal auth.uid() — enforced by lib/dal/revenue.ts, not this function.';

-- ----- instructor_revenue_buckets -----

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

GRANT EXECUTE ON FUNCTION public.instructor_revenue_buckets(uuid, date, date, text, text) TO authenticated;

COMMENT ON FUNCTION public.instructor_revenue_buckets IS
  'Returns time-series revenue buckets per currency for a creator over [period_start_date, period_end_date) interpreted in p_timezone, grouped by week or month. Refunds bucketed by refunded_at (the period they were issued), not the period of the original payment. CALLER CONTRACT: p_user_id MUST equal auth.uid() — enforced by lib/dal/revenue.ts, not this function.';

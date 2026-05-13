-- Migration 083 — refund tracking on client_attendance
--
-- Adds three columns + one CHECK constraint so coaches can record
-- refunds against manual (non-Stripe) attendance rows that were
-- marked paid=true. Before this migration the only way to "undo" a
-- paid attendance was to flip `paid` back to false via the edit
-- form, which dropped the historical fact that money had changed
-- hands at all — bad for both accounting and audit.
--
-- After this migration:
--   - paid stays true (the payment did happen)
--   - refunded_amount_cents records how much was returned
--   - refunded_at records when
--   - refund_reason records a free-text reason (max 500 chars)
--
-- Following the same shape as payments.refunded_at / refunded_amount_cents
-- from migration 063 so future code can treat both surfaces uniformly.
--
-- Currency carry-over: the refund is recorded in the same currency
-- as the original `currency` column on the attendance row. We don't
-- duplicate the column because a refund in a different currency
-- doesn't reconcile against the original — the constraint forbids
-- partial currency conversions inside this row.
--
-- Revenue dashboard caveat: the existing gym_revenue_totals function
-- (migration 071) reads from `payments`, not `client_attendance`.
-- This migration unlocks accurate per-row refund tracking, but a
-- follow-up migration is needed if you want the dashboard to subtract
-- manual-attendance refunds. Documented in HUMAN_TODOS.

ALTER TABLE public.client_attendance
  ADD COLUMN IF NOT EXISTS refunded_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text;

-- Drop & recreate the check constraint so re-running the migration
-- with a different shape just replaces it cleanly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_attendance_refund_consistency'
  ) THEN
    ALTER TABLE public.client_attendance DROP CONSTRAINT client_attendance_refund_consistency;
  END IF;
END$$;

ALTER TABLE public.client_attendance
  ADD CONSTRAINT client_attendance_refund_consistency CHECK (
    -- Either no refund at all, or all three refund fields are set
    -- together AND the refunded amount is within the bounds of what
    -- was actually paid. The reason cap is 500 chars to keep payloads
    -- bounded.
    (refunded_amount_cents IS NULL AND refunded_at IS NULL AND refund_reason IS NULL)
    OR (
      refunded_amount_cents IS NOT NULL
      AND refunded_at IS NOT NULL
      AND refund_reason IS NOT NULL
      AND char_length(refund_reason) BETWEEN 1 AND 500
      AND refunded_amount_cents > 0
      AND amount_paid_cents IS NOT NULL
      AND refunded_amount_cents <= amount_paid_cents
    )
  );

-- Partial index for "find me refunds in a window" queries. Most
-- attendance rows are never refunded so a partial index keeps it
-- small. Sorted by refunded_at DESC for the natural "show me
-- recent refunds" query path.
CREATE INDEX IF NOT EXISTS idx_client_attendance_refunded
  ON public.client_attendance (refunded_at DESC)
  WHERE refunded_amount_cents IS NOT NULL;

COMMENT ON COLUMN public.client_attendance.refunded_amount_cents IS
  'Refunded amount in minor units. NULL = not refunded. When set, refunded_at + refund_reason must also be set, and value must be > 0 and <= amount_paid_cents.';

COMMENT ON COLUMN public.client_attendance.refunded_at IS
  'When the refund was recorded. NULL when no refund. Coach-facing audit timestamp; not tied to Stripe.';

COMMENT ON COLUMN public.client_attendance.refund_reason IS
  'Free-text reason for the refund, 1-500 chars. NULL when no refund. Surfaces in the audit log + the attendance row UI.';

-- Verification:
--   SELECT COUNT(*) FROM client_attendance WHERE refunded_amount_cents IS NOT NULL;
--   \d+ public.client_attendance

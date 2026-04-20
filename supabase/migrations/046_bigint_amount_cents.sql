-- 046_bigint_amount_cents.sql
-- LOGIC-06: amount_cents columns are INTEGER (max 2,147,483,647).
-- That's ~21M USD or 2B COP — enough for one payment today, but close
-- enough to the ceiling that aggregate views of all payments / tips /
-- subscriptions could hit it. Widening to bigint costs nothing and
-- eliminates the future foot-gun.
--
-- PostgreSQL widens INTEGER → bigint in place without a rewrite on modern
-- versions; constraints carry over.

ALTER TABLE tips
  ALTER COLUMN amount_cents SET DATA TYPE bigint;

ALTER TABLE subscription_payments
  ALTER COLUMN amount_cents SET DATA TYPE bigint;

-- payments table: if the column is already bigint this is a no-op; if it's
-- integer it's widened. Either way we end up with bigint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'amount_cents'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE payments ALTER COLUMN amount_cents SET DATA TYPE bigint;
  END IF;
END $$;

-- product_orders has several cents columns; widen all of them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_orders'
      AND column_name IN ('unit_price_cents', 'total_price_cents', 'platform_fee_cents', 'instructor_payout_cents', 'discount_cents')
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE product_orders ALTER COLUMN unit_price_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN total_price_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN platform_fee_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN instructor_payout_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN discount_cents SET DATA TYPE bigint;
  END IF;
END $$;

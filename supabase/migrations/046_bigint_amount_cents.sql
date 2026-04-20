-- 046_bigint_amount_cents.sql
-- LOGIC-06: amount_cents columns are INTEGER (max 2,147,483,647).
-- That's ~21M USD or 2B COP — enough for any single payment but close
-- enough to the ceiling that aggregate views could hit it. Widening to
-- bigint costs nothing and eliminates the future foot-gun.
--
-- Guard every ALTER with a table + column-type check so this migration
-- works regardless of which feature set is deployed (tips, subscriptions,
-- storefront may each be staged in/out).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tips'
      AND column_name = 'amount_cents'
      AND data_type = 'integer'
  ) THEN
    EXECUTE 'ALTER TABLE tips ALTER COLUMN amount_cents SET DATA TYPE bigint';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_payments'
      AND column_name = 'amount_cents'
      AND data_type = 'integer'
  ) THEN
    EXECUTE 'ALTER TABLE subscription_payments ALTER COLUMN amount_cents SET DATA TYPE bigint';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'amount_cents'
      AND data_type = 'integer'
  ) THEN
    EXECUTE 'ALTER TABLE payments ALTER COLUMN amount_cents SET DATA TYPE bigint';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_orders'
      AND column_name = 'unit_price_cents'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE product_orders ALTER COLUMN unit_price_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN total_price_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN platform_fee_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN instructor_payout_cents SET DATA TYPE bigint;
    ALTER TABLE product_orders ALTER COLUMN discount_cents SET DATA TYPE bigint;
  END IF;
END $$;

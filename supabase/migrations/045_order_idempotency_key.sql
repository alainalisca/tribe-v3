-- 045_order_idempotency_key.sql
-- SEC-07: product order creation is not idempotent. A client retry on flaky
-- network creates two orders before the payment webhook arrives, which
-- manifests as a double charge.
--
-- Add an idempotency_key column. Clients send a UUID in the Idempotency-Key
-- HTTP header. Server-side INSERT uses ON CONFLICT DO NOTHING so retries are
-- safe.
--
-- NOTE: product_orders (migration 013) may not be deployed in every
-- environment — the storefront feature rolls out independently. Guard
-- everything with a table-existence check so this migration is a clean
-- no-op on installations that don't have the storefront schema yet.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_orders'
  ) THEN
    RAISE NOTICE 'product_orders table does not exist; skipping 045';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_orders'
      AND column_name = 'idempotency_key'
  ) THEN
    EXECUTE 'ALTER TABLE product_orders ADD COLUMN idempotency_key uuid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'product_orders_idempotency_key_uniq'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX product_orders_idempotency_key_uniq
             ON product_orders (idempotency_key)
             WHERE idempotency_key IS NOT NULL';
  END IF;
END $$;

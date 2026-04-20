-- 045_order_idempotency_key.sql
-- SEC-07: product order creation is not idempotent. A client retry on flaky
-- network creates two orders before the payment webhook arrives, which
-- manifests as a double charge.
--
-- Add an idempotency_key column. Clients send a UUID in the Idempotency-Key
-- HTTP header. Server-side INSERT uses ON CONFLICT DO NOTHING so retries are
-- safe.

ALTER TABLE product_orders
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS product_orders_idempotency_key_uniq
  ON product_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

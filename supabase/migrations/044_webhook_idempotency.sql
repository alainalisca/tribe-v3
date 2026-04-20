-- 044_webhook_idempotency.sql
-- LOGIC-08: Wompi (and Stripe) webhook idempotency currently compares
-- existing_payment.status === newStatus. If the same event fires twice with
-- status='approved', both pass the check and fulfillment runs twice → user
-- double-credited. The fix is event-id based dedup.
--
-- SEC-04 (amount tamper): implemented inline in the webhook handlers — they
-- now compare webhook amount_in_cents against the stored payment amount
-- before applying the status change.
--
-- LOGIC-04 (full transactional finalize_payment RPC): deferred to its own PR
-- because rewriting both webhooks end-to-end needs integration tests first.

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  gateway text NOT NULL CHECK (gateway IN ('stripe', 'wompi')),
  event_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gateway, event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_recent
  ON processed_webhook_events (processed_at DESC);

-- Only the service role (webhook handlers) writes here; no public reads.
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = no authenticated/anon access. Only service_role can touch it.

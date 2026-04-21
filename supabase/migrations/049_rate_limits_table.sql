-- 049_rate_limits_table.sql
-- AUDIT-P0-1: lib/rate-limit.ts has long documented a `rate_limits` table for
-- its Supabase-backed `checkRateLimit` helper, but no numbered migration ever
-- created it. As a result, every caller in app/api/**/route.ts was using the
-- in-memory `rateLimit()` fallback, which resets on every serverless cold
-- start — effective throttle in production was ~0 on any endpoint with
-- cold-start churn.
--
-- This migration creates the table + index expected by checkRateLimit.
--
-- Schema notes:
--   - `key` is the full bucket key the caller constructs (e.g.
--     "signup:1.2.3.4" or "invite:<user-uuid>"). We don't enforce shape
--     because different endpoints want different partitioning.
--   - `created_at` is what checkRateLimit counts within a sliding window.
--   - No updated_at, no soft-delete — rows are fire-and-forget and cleaned
--     up by checkRateLimit itself.
--
-- RLS: this table is only written to by service-role (route handlers using
-- the service client or supabase SSR client). Authenticated role has no
-- business touching it. Enable RLS with no policies so authenticated is
-- denied by default; service_role always bypasses RLS.

CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created
  ON rate_limits (key, created_at);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = denied by default for every role except service_role, which
-- is what we want. If you ever need an authenticated-role debug tool, scope
-- it with USING (false) rather than opening reads.

-- 035_tribe_plus.sql
-- Athlete subscription (Tribe+). Adds subscription fields to users and
-- creates a subscription_payments log for billing events.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'plus', 'pro'));
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_gateway TEXT
    CHECK (subscription_gateway IN ('wompi', 'stripe', 'manual'));
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_gateway_id TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_auto_renew BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  gateway TEXT NOT NULL,
  gateway_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'refunded')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_user
  ON subscription_payments (user_id, created_at DESC);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_sub_payments" ON subscription_payments;
CREATE POLICY "own_sub_payments" ON subscription_payments
  FOR SELECT USING (auth.uid() = user_id);

-- Optional: early-access window on sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS early_access_only_until TIMESTAMPTZ;

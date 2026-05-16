-- 060_tribe_os_premium.sql
-- Tribe.OS premium tier on users. Namespaced under tribe_os_* to avoid
-- colliding with the athlete-side Tribe+ subscription_tier from migration
-- 035 — those columns describe a separate product (Tribe+ for athletes,
-- free/plus/pro), this one is the instructor-side premium tier (solo/
-- team_studio).
--
-- During the trip these columns are set manually via the
-- /api/admin/tribe-os/grant-premium endpoint or the
-- scripts/grant-tribe-os-premium.js CLI so Studio San Diego instructors
-- can be flipped to premium without a billing flow. Stripe customer +
-- subscription IDs are reserved for when paid billing kicks in
-- post-validation.
--
-- All columns nullable. Existing users stay at NULL (= not premium).
-- "Premium active" is derived: tribe_os_tier IS NOT NULL AND
-- (tribe_os_status IS NULL OR tribe_os_status = 'active').
-- Status NULL means manually granted with no Stripe billing yet — the
-- design-partner case.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tribe_os_tier text
    CHECK (tribe_os_tier IS NULL OR tribe_os_tier IN ('solo', 'team_studio')),
  ADD COLUMN IF NOT EXISTS tribe_os_status text
    CHECK (tribe_os_status IS NULL OR tribe_os_status IN ('active', 'past_due', 'canceled', 'trialing')),
  ADD COLUMN IF NOT EXISTS tribe_os_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tribe_os_granted_by text
    CHECK (tribe_os_granted_by IS NULL OR char_length(tribe_os_granted_by) <= 255),
  ADD COLUMN IF NOT EXISTS tribe_os_stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS tribe_os_stripe_subscription_id text;

-- Partial indexes keep them tiny: only rows with a populated value get an
-- index entry. The tier index is the hot path (admin "who has premium?"
-- queries); Stripe ID indexes serve future webhook lookups.
CREATE INDEX IF NOT EXISTS idx_users_tribe_os_tier
  ON users (tribe_os_tier)
  WHERE tribe_os_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_tribe_os_stripe_customer_id
  ON users (tribe_os_stripe_customer_id)
  WHERE tribe_os_stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_tribe_os_stripe_subscription_id
  ON users (tribe_os_stripe_subscription_id)
  WHERE tribe_os_stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN users.tribe_os_tier IS
  'Tribe.OS premium tier the user is on. ''solo'' = single instructor; ''team_studio'' = multi-instructor studio. NULL means not on Tribe.OS premium. Distinct from subscription_tier (Tribe+ for athletes).';

COMMENT ON COLUMN users.tribe_os_status IS
  'Stripe subscription status. NULL means manually granted (design partner) without billing. Active billing states: active, past_due, canceled, trialing.';

COMMENT ON COLUMN users.tribe_os_granted_at IS
  'When premium access was granted. Set by the admin grant route or the CLI script.';

COMMENT ON COLUMN users.tribe_os_granted_by IS
  'Audit trail: admin email or "system" for who flipped this user to premium.';

COMMENT ON COLUMN users.tribe_os_stripe_customer_id IS
  'Stripe customer ID for paid Tribe.OS billing. Populated when the instructor moves from manual grant to paid subscription.';

COMMENT ON COLUMN users.tribe_os_stripe_subscription_id IS
  'Stripe subscription ID for paid Tribe.OS billing. Used by webhook handlers to sync subscription status changes.';

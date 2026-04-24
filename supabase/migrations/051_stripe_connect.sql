-- 051_stripe_connect.sql
--
-- Adds Stripe Connect columns to the users table.
--
-- Context: instructors who want to receive USD payouts through Stripe Connect
-- go through a hosted onboarding flow (ID + bank verification). The result of
-- that flow is a Stripe-managed "Express" account whose ID we store on the
-- user, plus a flag indicating whether onboarding is complete enough that we
-- can safely route funds to the account.
--
-- Columns:
--   stripe_account_id            -- the 'acct_...' string Stripe returns when
--                                   we call stripe.accounts.create(). Nullable
--                                   because only instructors who opt in will
--                                   have one. Not unique-constrained in case a
--                                   future support edge-case needs a re-link.
--   stripe_onboarding_complete   -- becomes true when the 'account.updated'
--                                   webhook reports charges_enabled = true
--                                   AND payouts_enabled = true. Until then we
--                                   refuse to create Checkout Sessions that
--                                   would route funds to this account.
--   stripe_onboarding_started_at -- set the first time we generate an
--                                   AccountLink, useful for surfacing
--                                   'Resume onboarding' CTAs.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_started_at TIMESTAMPTZ;

-- Webhook handler looks users up by stripe_account_id when processing
-- account.updated events. Partial index keeps the index tiny (only
-- rows where the column is populated).
CREATE INDEX IF NOT EXISTS idx_users_stripe_account_id
  ON public.users (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- Safety: document that these columns are written by the service role
-- (from the webhook handler and the Connect onboarding API route), not by
-- the user directly. RLS on public.users already scopes UPDATE to
-- auth.uid() = id; the service role bypasses RLS so webhook writes
-- continue to work. No policy changes required.

COMMENT ON COLUMN public.users.stripe_account_id IS
  'Stripe Connect Express account ID (acct_...). Populated when the instructor starts onboarding. Written by the service role via /api/stripe/connect/onboard.';

COMMENT ON COLUMN public.users.stripe_onboarding_complete IS
  'True once the account.updated webhook reports charges_enabled=true AND payouts_enabled=true. Gate for routing funds via transfer_data.destination.';

COMMENT ON COLUMN public.users.stripe_onboarding_started_at IS
  'Set on first AccountLink generation. Used to surface Resume onboarding CTAs in the UI.';

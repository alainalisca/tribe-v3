-- DRAFT — NOT APPLIED. See draft/README.md for promotion checklist.
--
-- Phase 2 Tribe.OS: prepaid session packages. An instructor sells a pack
-- ("10 sessions for $200, valid 90 days"); a client purchases the pack
-- and burns down sessions_remaining each time they attend.
--
-- Open questions to resolve before applying:
--   - Decrement model: does sessions_remaining drop on attendance
--     (client_attendance.attended = true) or on booking? Probably
--     attendance — no-shows shouldn't burn paid sessions.
--   - Refund semantics on partial use: do we refund pro-rata or block
--     refunds once any session is consumed? Likely block, with manual
--     admin override for edge cases.
--   - Currency: COP/USD only, matching existing payments table?
--     Confirmed yes — multi-currency is a future-future problem.
--   - Should we constrain (instructor, name) to be unique on
--     session_packages? Probably not — instructor may want to retire
--     and re-launch a pack with the same name.

CREATE TABLE IF NOT EXISTS session_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  price_cents bigint NOT NULL CHECK (price_cents > 0),
  currency text NOT NULL CHECK (currency IN ('USD', 'COP')),
  session_count integer NOT NULL CHECK (session_count > 0),
  -- Days from purchase before the pack expires. NULL = never expires
  -- (open question: do we want that as an option, or force an expiry?
  -- Defaulting to "expiring is the norm" but allowing NULL for flexibility).
  validity_days integer CHECK (validity_days IS NULL OR validity_days > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_packages_instructor_active
  ON session_packages (instructor_user_id)
  WHERE active = true;

ALTER TABLE session_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own packages"
  ON session_packages FOR ALL
  USING (auth.uid() = instructor_user_id)
  WITH CHECK (auth.uid() = instructor_user_id);

CREATE POLICY "Anyone can view active packages"
  ON session_packages FOR SELECT
  USING (active = true);

-- Purchases. References clients (from clients_and_attendance.draft.sql)
-- so this draft cannot be applied independently — clients must come
-- first. Each purchase is a separate row; if a client buys two packs,
-- both rows exist and burn down independently.
CREATE TABLE IF NOT EXISTS package_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES session_packages(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  sessions_remaining integer NOT NULL CHECK (sessions_remaining >= 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  -- expires_at is NULL only when the package's validity_days was NULL
  -- at purchase time. Snapshotted so package.validity_days changes
  -- don't retroactively shorten or extend an existing purchase.
  expires_at timestamptz,
  -- One of these is set depending on which gateway processed the
  -- purchase. Both NULL = manual / off-platform purchase (admin-recorded).
  stripe_payment_intent_id text,
  wompi_transaction_id text,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_purchases_client_active
  ON package_purchases (client_id, expires_at)
  WHERE refunded_at IS NULL AND sessions_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_package_purchases_package
  ON package_purchases (package_id);

CREATE INDEX IF NOT EXISTS idx_package_purchases_stripe_pi
  ON package_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_package_purchases_wompi_tx
  ON package_purchases (wompi_transaction_id)
  WHERE wompi_transaction_id IS NOT NULL;

ALTER TABLE package_purchases ENABLE ROW LEVEL SECURITY;

-- Instructor can see all purchases of their packages. Routed through
-- the package row's ownership rather than denormalizing instructor_id
-- onto purchases — denormalization invites drift.
CREATE POLICY "Instructors see purchases of own packages"
  ON package_purchases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM session_packages
      WHERE session_packages.id = package_purchases.package_id
        AND session_packages.instructor_user_id = auth.uid()
    )
  );

-- Service role handles inserts (from webhook + admin script). No
-- end-user INSERT policy by design.

COMMENT ON TABLE session_packages IS
  'Prepaid session pack offered by an instructor (e.g. "10 yoga sessions for $200, 90 days").';

COMMENT ON TABLE package_purchases IS
  'A client''s purchase of a session pack. sessions_remaining is decremented as the client attends.';

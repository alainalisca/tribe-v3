-- Migration 089: Align referrals table with the DAL in lib/dal/referrals.ts.
--
-- The original referrals table was created in migration 009 with a shape that
-- assumed every referral row links a referrer to an already-signed-up referred
-- user. The DAL in lib/dal/referrals.ts uses a "template row" pattern instead:
-- each user gets one row with referred_id = null holding their reusable code,
-- and additional rows get inserted when other users sign up with that code.
--
-- 014_referrals.sql tried to create the table with the new shape but was a
-- no-op because the table already existed (CREATE TABLE IF NOT EXISTS).
-- This migration brings the existing table in line.

ALTER TABLE referrals ALTER COLUMN referred_id DROP NOT NULL;
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_unique_pair;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Carry over old completed_at values if any rows exist.
UPDATE referrals SET converted_at = completed_at
WHERE converted_at IS NULL AND completed_at IS NOT NULL;

-- The old INSERT policy required auth.uid() = referred_id, which blocks the
-- referrer's initial template-row insert (referred_id is null at that point).
-- Replace it with one keyed on referrer_id.
DROP POLICY IF EXISTS "Authenticated users can create referrals" ON referrals;
DROP POLICY IF EXISTS "Users can insert referrals" ON referrals;
CREATE POLICY "Users can insert referrals" ON referrals
  FOR INSERT WITH CHECK (auth.uid() = referrer_id);

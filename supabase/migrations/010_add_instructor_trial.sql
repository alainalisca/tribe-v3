-- Migration 010: Add instructor free trial support
-- Adds instructor_since timestamp to track when a user became an instructor.
-- This timestamp is the basis for the 3-month (90-day) free trial period.
-- During the trial, all paid features (Boosts, Pro Storefront) are free.
-- After the trial, payment via Stripe or Wompi is required.

-- Add instructor_since column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS instructor_since timestamptz DEFAULT NULL;

-- Backfill: for existing instructors who don't have this set,
-- use their account created_at as the trial start (conservative approach)
UPDATE users
SET instructor_since = created_at
WHERE is_instructor = true
  AND instructor_since IS NULL;

-- Index for efficient trial status queries
CREATE INDEX IF NOT EXISTS idx_users_instructor_since
  ON users (instructor_since)
  WHERE instructor_since IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN users.instructor_since IS
  'Timestamp when user completed instructor onboarding. Used as trial start date for 90-day free period.';

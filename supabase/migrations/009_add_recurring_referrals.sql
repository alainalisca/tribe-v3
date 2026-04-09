-- Migration 009: Recurring sessions, referral system, and subscription support
-- Run in Supabase SQL editor

-- ============================================
-- 1. RECURRING SESSIONS — add columns to sessions table
-- ============================================
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_pattern text; -- 'weekly', 'biweekly', 'monthly'
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_days text[]; -- e.g. ['monday', 'wednesday']
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_end_date date;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurring_parent_id uuid REFERENCES sessions(id); -- links child sessions to parent

-- ============================================
-- 2. SUBSCRIPTION flag on session_participants
-- ============================================
ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS is_subscription boolean DEFAULT false;

-- ============================================
-- 3. REFERRAL SYSTEM — new tables
-- ============================================
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT referral_codes_user_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'completed' (completed = referred user attended first session)
  reward_granted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT referrals_unique_pair UNIQUE (referrer_id, referred_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_sessions_recurring ON sessions(is_recurring) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_participants_subscription ON session_participants(is_subscription) WHERE is_subscription = true;

-- ============================================
-- 4. RLS POLICIES
-- ============================================

-- Referral codes: users can read their own, insert their own
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own referral code"
    ON referral_codes FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own referral code"
    ON referral_codes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Referrals: referrer and referred can read, system inserts
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own referrals"
    ON referrals FOR SELECT
    USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can create referrals"
    ON referrals FOR INSERT
    WITH CHECK (auth.uid() = referred_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 5. Add referred_by to users table for tracking
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;

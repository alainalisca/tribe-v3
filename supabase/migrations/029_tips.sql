-- 029_tips.sql
-- Athletes can tip instructors as gratitude. 100% goes to the instructor
-- (no platform fee on tips, at least initially).

CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('COP', 'USD')),
  gateway TEXT NOT NULL CHECK (gateway IN ('wompi', 'stripe')),
  gateway_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'error')),
  message TEXT,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tips_instructor
  ON tips (instructor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_tipper
  ON tips (tipper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_session
  ON tips (session_id) WHERE session_id IS NOT NULL;

-- Cached totals on instructor's user row
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_tips_received_cents BIGINT DEFAULT 0;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_tips_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION update_instructor_tip_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE users SET
      total_tips_received_cents = COALESCE(total_tips_received_cents, 0) + NEW.amount_cents,
      total_tips_count = COALESCE(total_tips_count, 0) + 1
    WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tip_approved_trigger ON tips;
CREATE TRIGGER tip_approved_trigger
  AFTER INSERT OR UPDATE OF status ON tips
  FOR EACH ROW
  EXECUTE FUNCTION update_instructor_tip_totals();

ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tippers_own_tips" ON tips;
CREATE POLICY "tippers_own_tips" ON tips
  FOR ALL USING (auth.uid() = tipper_id);

DROP POLICY IF EXISTS "instructors_view_tips" ON tips;
CREATE POLICY "instructors_view_tips" ON tips
  FOR SELECT USING (auth.uid() = instructor_id);

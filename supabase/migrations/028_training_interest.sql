-- 028_training_interest.sql
-- Training interest signals from athletes to instructors.
-- Gives instructors warm leads without requiring the athlete to book yet.

CREATE TABLE IF NOT EXISTS training_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT,
  sport TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'contacted', 'booked', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (athlete_id, instructor_id)
);

CREATE INDEX IF NOT EXISTS idx_training_interest_instructor
  ON training_interest (instructor_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_interest_athlete
  ON training_interest (athlete_id, created_at DESC);

-- Keep updated_at fresh on status/message changes
CREATE OR REPLACE FUNCTION touch_training_interest_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_interest_touch_updated_at ON training_interest;
CREATE TRIGGER training_interest_touch_updated_at
  BEFORE UPDATE ON training_interest
  FOR EACH ROW EXECUTE FUNCTION touch_training_interest_updated_at();

ALTER TABLE training_interest ENABLE ROW LEVEL SECURITY;

-- Athletes own their interest signals (full CRUD on their own rows)
DROP POLICY IF EXISTS "athletes_own_interest" ON training_interest;
CREATE POLICY "athletes_own_interest" ON training_interest
  FOR ALL USING (auth.uid() = athlete_id);

-- Instructors can read interest signals directed at them
DROP POLICY IF EXISTS "instructors_view_interest" ON training_interest;
CREATE POLICY "instructors_view_interest" ON training_interest
  FOR SELECT USING (auth.uid() = instructor_id);

-- Instructors can update the status of signals directed at them
-- (e.g. mark 'contacted', 'booked', 'dismissed')
DROP POLICY IF EXISTS "instructors_update_interest" ON training_interest;
CREATE POLICY "instructors_update_interest" ON training_interest
  FOR UPDATE USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

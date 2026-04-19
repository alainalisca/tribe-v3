-- 036_lead_discovery.sql
-- Premium lead discovery. Athletes can opt in as "seeking a trainer";
-- instructors with credits can "reach out" and are billed per reach.

ALTER TABLE users ADD COLUMN IF NOT EXISTS seeking_trainer BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seeking_trainer_sports TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS seeking_trainer_budget TEXT
  CHECK (seeking_trainer_budget IN ('free_only', 'budget', 'moderate', 'premium', 'any'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS seeking_trainer_schedule TEXT
  CHECK (seeking_trainer_schedule IN ('mornings', 'afternoons', 'evenings', 'weekends', 'flexible'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS seeking_trainer_note TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_credits_remaining INTEGER DEFAULT 3;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_credits_reset_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_tier TEXT DEFAULT 'free'
  CHECK (lead_tier IN ('free', 'growth', 'unlimited'));

CREATE TABLE IF NOT EXISTS lead_reaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resulted_in_booking BOOLEAN DEFAULT false,
  UNIQUE (instructor_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_reaches_instructor
  ON lead_reaches (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seeking_trainer
  ON users (seeking_trainer) WHERE seeking_trainer = true;

ALTER TABLE lead_reaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "instructors_own_reaches" ON lead_reaches;
CREATE POLICY "instructors_own_reaches" ON lead_reaches
  FOR ALL USING (auth.uid() = instructor_id);

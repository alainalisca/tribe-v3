-- 030_instructor_challenges.sql
-- Extend challenges with instructor-branded features: linked sessions,
-- rewards, difficulty, and structured daily tasks.

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS is_instructor_challenge BOOLEAN DEFAULT false;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS linked_session_ids UUID[] DEFAULT '{}';

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS reward_description TEXT;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS reward_description_es TEXT;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS difficulty TEXT
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))
    DEFAULT 'beginner';

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS daily_tasks JSONB DEFAULT '[]';
-- daily_tasks shape:
--   [{ "day": 1, "title": "...", "title_es": "...",
--      "description": "...", "description_es": "...",
--      "session_id": "uuid-or-null" }, ...]

CREATE INDEX IF NOT EXISTS idx_challenges_instructor
  ON challenges (creator_id, is_instructor_challenge)
  WHERE is_instructor_challenge = true;

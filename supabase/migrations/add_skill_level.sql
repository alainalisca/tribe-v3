-- Add skill_level column to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS skill_level TEXT DEFAULT 'all_levels';

-- Add check constraint for valid skill levels
ALTER TABLE sessions
ADD CONSTRAINT valid_skill_level
CHECK (skill_level IN ('all_levels', 'beginner', 'intermediate', 'advanced'));

-- Add index for efficient filtering by skill level
CREATE INDEX IF NOT EXISTS idx_sessions_skill_level
ON sessions(skill_level);

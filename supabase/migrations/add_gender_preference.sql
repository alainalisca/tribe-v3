-- Add gender_preference column to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS gender_preference TEXT DEFAULT 'all';

-- Add check constraint for valid gender preferences
ALTER TABLE sessions
ADD CONSTRAINT valid_gender_preference
CHECK (gender_preference IN ('all', 'women_only', 'men_only'));

-- Add index for efficient filtering by gender preference
CREATE INDEX IF NOT EXISTS idx_sessions_gender_preference
ON sessions(gender_preference);

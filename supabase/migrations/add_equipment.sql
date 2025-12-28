-- Add equipment column to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS equipment TEXT;

-- Add index for sessions with equipment (for potential filtering)
CREATE INDEX IF NOT EXISTS idx_sessions_equipment
ON sessions(equipment) WHERE equipment IS NOT NULL;

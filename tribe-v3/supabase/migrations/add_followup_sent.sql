-- Add followup_sent column to sessions table
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS followup_sent BOOLEAN DEFAULT FALSE;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_sessions_followup_sent 
ON sessions(followup_sent, date) 
WHERE followup_sent = FALSE;

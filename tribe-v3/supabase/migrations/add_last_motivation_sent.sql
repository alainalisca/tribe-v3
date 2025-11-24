-- Add last_motivation_sent column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_motivation_sent TIMESTAMP WITH TIME ZONE;

-- Add preferred_language column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(2) DEFAULT 'en';

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_motivation_sent 
ON users(last_motivation_sent) 
WHERE push_subscription IS NOT NULL;

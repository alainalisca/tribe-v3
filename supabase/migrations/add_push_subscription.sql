-- Add push_subscription column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS push_subscription JSONB;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_push_subscription 
ON users(id) 
WHERE push_subscription IS NOT NULL;

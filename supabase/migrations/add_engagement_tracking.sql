-- Add engagement tracking columns to users table for push notification system

-- Track which motivation message IDs have been sent to avoid repeats
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_motivation_message_id TEXT;

-- Track when weekly recap notification was last sent
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_weekly_recap_sent TIMESTAMP WITH TIME ZONE;

-- Track when re-engagement notification was last sent
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_reengagement_sent TIMESTAMP WITH TIME ZONE;

-- Add indexes for efficient querying on engagement cron jobs
CREATE INDEX IF NOT EXISTS idx_users_weekly_recap_sent
ON users(last_weekly_recap_sent)
WHERE push_subscription IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_reengagement_sent
ON users(last_reengagement_sent, updated_at)
WHERE push_subscription IS NOT NULL;

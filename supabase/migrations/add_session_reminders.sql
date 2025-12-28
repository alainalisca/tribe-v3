-- Add session reminder columns to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS reminder_1hr_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS reminder_15min_sent BOOLEAN DEFAULT FALSE;

-- Add user preference for session reminders
ALTER TABLE users
ADD COLUMN IF NOT EXISTS session_reminders_enabled BOOLEAN DEFAULT TRUE;

-- Create index for efficient querying of sessions needing reminders
CREATE INDEX IF NOT EXISTS idx_sessions_reminder_1hr
ON sessions(date, start_time, reminder_1hr_sent)
WHERE reminder_1hr_sent = FALSE AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_sessions_reminder_15min
ON sessions(date, start_time, reminder_15min_sent)
WHERE reminder_15min_sent = FALSE AND status = 'active';

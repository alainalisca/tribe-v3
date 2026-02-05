-- Add FCM token columns to users table for native push notifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_platform VARCHAR(10); -- 'ios' or 'android'
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_updated_at TIMESTAMPTZ;

-- Create index for faster FCM token lookups
CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token) WHERE fcm_token IS NOT NULL;

-- Comment explaining the columns
COMMENT ON COLUMN users.fcm_token IS 'Firebase Cloud Messaging token for native iOS/Android push notifications';
COMMENT ON COLUMN users.fcm_platform IS 'Platform of the FCM token: ios or android';
COMMENT ON COLUMN users.fcm_updated_at IS 'Timestamp when the FCM token was last updated';

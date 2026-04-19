-- 037_notification_preferences.sql
-- Per-user notification preferences. In-app notifications are always
-- created; push/email delivery checks these flags before sending.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_reminders BOOLEAN DEFAULT true,
  session_updates BOOLEAN DEFAULT true,
  social_activity BOOLEAN DEFAULT true,
  messages BOOLEAN DEFAULT true,
  training_nudges BOOLEAN DEFAULT true,
  instructor_updates BOOLEAN DEFAULT true,
  challenges BOOLEAN DEFAULT true,
  marketing BOOLEAN DEFAULT false,
  weekly_recap BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_prefs" ON notification_preferences;
CREATE POLICY "own_prefs" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION touch_notification_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notification_prefs_touch ON notification_preferences;
CREATE TRIGGER notification_prefs_touch
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION touch_notification_prefs_updated_at();

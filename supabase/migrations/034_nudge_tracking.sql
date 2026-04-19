-- 034_nudge_tracking.sql
-- Log of behavioral nudges sent to users. Drives anti-spam rules and
-- per-nudge-type A/B metrics (open / conversion rates).

CREATE TABLE IF NOT EXISTS nudge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nudge_type TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  converted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_nudge_log_user
  ON nudge_log (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nudge_log_type
  ON nudge_log (nudge_type, sent_at DESC);

ALTER TABLE nudge_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_nudge_log" ON nudge_log;
CREATE POLICY "own_nudge_log" ON nudge_log
  FOR SELECT USING (auth.uid() = user_id);
-- Writes performed by service role in cron context.

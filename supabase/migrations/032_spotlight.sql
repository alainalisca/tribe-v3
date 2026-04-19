-- 032_spotlight.sql
-- Weekly "Instructor of the Week" editorial spotlight.

CREATE TABLE IF NOT EXISTS instructor_spotlight (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  selection_reason TEXT,            -- 'algorithmic', 'manual', or free text
  is_active BOOLEAN DEFAULT true,
  featured_quote TEXT,
  featured_quote_es TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instructor_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_spotlight_active
  ON instructor_spotlight (is_active, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_spotlight_dates
  ON instructor_spotlight (start_date, end_date)
  WHERE is_active = true;

ALTER TABLE instructor_spotlight ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_spotlight" ON instructor_spotlight;
CREATE POLICY "anyone_can_read_spotlight" ON instructor_spotlight
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE are performed via service role in admin/cron contexts.

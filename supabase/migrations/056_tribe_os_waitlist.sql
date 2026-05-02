-- 056_tribe_os_waitlist.sql
-- Captures fitness instructor signups for the "Tribe OS - Coming Soon" landing
-- page section. Public form on the marketing site; admins read for outreach.
--
-- RLS:
--   - INSERT: anonymous + authenticated allowed (public form submission).
--   - SELECT/UPDATE/DELETE: admins only (via existing is_app_admin() helper).
--   - Service role bypasses RLS for server-side operations.

CREATE TABLE IF NOT EXISTS tribe_os_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 255),
  what_they_teach text NOT NULL CHECK (char_length(what_they_teach) BETWEEN 1 AND 255),
  sessions_per_week integer CHECK (sessions_per_week IS NULL OR sessions_per_week >= 0),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tribe_os_waitlist_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_tribe_os_waitlist_created_at
  ON tribe_os_waitlist (created_at DESC);

ALTER TABLE tribe_os_waitlist ENABLE ROW LEVEL SECURITY;

-- Public form: anyone (anon or authed) can join the waitlist.
CREATE POLICY "Anyone can join Tribe OS waitlist"
  ON tribe_os_waitlist FOR INSERT
  WITH CHECK (true);

-- Admins can read all signups for outreach.
CREATE POLICY "Admins can view Tribe OS waitlist"
  ON tribe_os_waitlist FOR SELECT
  USING (is_app_admin());

-- Admins can manage entries (e.g. remove duplicates, mark contacted).
CREATE POLICY "Admins can update Tribe OS waitlist"
  ON tribe_os_waitlist FOR UPDATE
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "Admins can delete Tribe OS waitlist"
  ON tribe_os_waitlist FOR DELETE
  USING (is_app_admin());

-- DRAFT — NOT APPLIED. See draft/README.md for promotion checklist.
--
-- Phase 2 Tribe.OS: instructor's private client roster + per-session
-- attendance / payment tracking. Lets an instructor keep their existing
-- WhatsApp/spreadsheet client list inside Tribe and tag who showed up
-- to which session.
--
-- Open questions to resolve before applying:
--   - Do we need separate `email`, `phone`, `whatsapp`, etc. columns or
--     stick with the single `contact_info` jsonb? Validation signal will
--     tell us which fields instructors actually use day-to-day.
--   - Should `client_attendance.attended_at` be derived from the joined
--     session's start_time, or recorded separately? The latter survives
--     session edits.
--   - Is `unique (client_id, session_id)` correct, or should an
--     instructor be able to log the same client attending the same
--     session twice (e.g. drop-in + paid)? Probably no.

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  email text CHECK (email IS NULL OR char_length(email) <= 255),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 64),
  -- Free-form structured contact info: WhatsApp, Instagram, etc. Schema
  -- intentionally loose during early discovery; tighten when patterns
  -- stabilize.
  contact_info jsonb,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_instructor_active
  ON clients (instructor_user_id)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_clients_email
  ON clients (email)
  WHERE email IS NOT NULL;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own clients"
  ON clients FOR ALL
  USING (auth.uid() = instructor_user_id)
  WITH CHECK (auth.uid() = instructor_user_id);

-- Per-session attendance records. One row per (client, session) pair.
CREATE TABLE IF NOT EXISTS client_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  attended boolean NOT NULL DEFAULT false,
  paid boolean NOT NULL DEFAULT false,
  -- Recorded at marking-time, not derived from session.start_time so
  -- post-session edits to the session don't rewrite history.
  attended_at timestamptz,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_client_session UNIQUE (client_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_client_attendance_client
  ON client_attendance (client_id, attended_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_client_attendance_session
  ON client_attendance (session_id);

ALTER TABLE client_attendance ENABLE ROW LEVEL SECURITY;

-- Attendance is gated by ownership of the parent client row. The
-- instructor's own client → their attendance.
CREATE POLICY "Instructors manage own client attendance"
  ON client_attendance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_attendance.client_id
        AND clients.instructor_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_attendance.client_id
        AND clients.instructor_user_id = auth.uid()
    )
  );

COMMENT ON TABLE clients IS
  'Instructor''s private client roster. Distinct from session_participants — clients exist independent of any specific session.';

COMMENT ON TABLE client_attendance IS
  'Per-session attendance + payment marker for a client. Replaces the WhatsApp-spreadsheet bookkeeping pattern.';

-- 062_clients_and_attendance.sql
-- Phase 2 Tribe.OS: instructor's private client roster + per-session
-- attendance / payment tracking. Lets an instructor keep their existing
-- WhatsApp/spreadsheet client list inside Tribe and tag who showed up
-- to which session.
--
-- Promoted from supabase/migrations/draft/clients_and_attendance.draft.sql
-- on 2026-05-10. Several columns added during promotion to match the
-- Mission 2 DAL spec (tags, payment fields, archive timestamp, updated_at
-- triggers). See migration body for rationale on each.
--
-- Design decisions:
--   - Soft-delete via `archived` boolean (NOT a deleted_at timestamp).
--     Keeps attendance history queryable for the instructor's revenue
--     dashboard even after a client is archived. Active-client queries
--     filter `archived = false`.
--   - `tags text[]` on clients (not a separate join table). Tags are
--     instructor-private metadata; no cross-instructor analytics need
--     normalization. Array column + GIN index gives fast tag filtering
--     at the scale of one instructor's roster (low hundreds of clients).
--   - `client_attendance.amount_paid_cents` + `currency` + `payment_method`
--     all nullable. Attendance can be marked without payment (e.g. drop-in
--     who paid via package, or comp). When `amount_paid_cents` is set,
--     `currency` MUST be set — enforced via CHECK constraint.
--   - ON DELETE CASCADE on session FK matches the existing
--     session_participants pattern (deleting a session cleans up its
--     dependent rows). Financial history that needs to survive session
--     deletion lives in the payments table separately.
--   - RLS join-through-clients (rather than denormalizing
--     instructor_user_id onto client_attendance) — avoids drift risk and
--     EXISTS subquery uses primary-key index, fast at expected scale.
--     Revisit if attendance grows past ~10k rows per instructor.
--   - `updated_at` triggers follow the per-table pattern from migration
--     028_training_interest.sql.

-- ------------------------------------------------------------------
-- clients
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  email text CHECK (email IS NULL OR char_length(email) <= 255),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 64),
  -- Free-form structured contact info: WhatsApp handle, Instagram, etc.
  -- Schema intentionally loose during early discovery; tighten when
  -- patterns stabilize from real instructor usage.
  contact_info jsonb,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  -- Tags are instructor-private categorization (e.g. "vip", "lead",
  -- "yoga", "cycling"). Empty array (not NULL) so we can always
  -- compare with `tags @> ARRAY[...]` without null handling.
  --
  -- DB-layer constraint caps the count only — PostgreSQL forbids
  -- subqueries in CHECK constraints, so per-tag char length cannot be
  -- expressed here. The Mission 3 Zod schema enforces per-tag length
  -- (1..30 chars) at the API boundary, which is the right layer for
  -- input shape validation. Direct SQL writers get the array cap;
  -- everything writing through the app gets both.
  tags text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 20),
  archived boolean NOT NULL DEFAULT false,
  -- Set when archived flips true; null otherwise. Lets the UI offer
  -- "recently archived (last 30 days)" undo and lets us audit cleanup
  -- timing later. Enforced by trigger (below) so the app can't lie
  -- about it.
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_archived_at_consistency CHECK (
    (archived = false AND archived_at IS NULL) OR
    (archived = true AND archived_at IS NOT NULL)
  )
);

-- Active client list per instructor — partial index keeps it small even
-- when an instructor has accumulated many archived rows.
CREATE INDEX IF NOT EXISTS idx_clients_instructor_active
  ON clients (instructor_user_id, created_at DESC)
  WHERE archived = false;

-- Email lookup for de-duplication ("did this person already sign up
-- as one of my clients?"). Partial — most rows have null email.
CREATE INDEX IF NOT EXISTS idx_clients_email
  ON clients (instructor_user_id, lower(email))
  WHERE email IS NOT NULL;

-- Tag filtering. GIN supports `tags @> ARRAY['vip']` containment.
CREATE INDEX IF NOT EXISTS idx_clients_tags
  ON clients USING gin (tags)
  WHERE archived = false;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Instructors manage own clients" ON clients;
CREATE POLICY "Instructors manage own clients"
  ON clients FOR ALL
  USING (auth.uid() = instructor_user_id)
  WITH CHECK (auth.uid() = instructor_user_id);

-- updated_at + archived_at sync trigger. Single trigger handles both
-- so the app can't forget to set archived_at when flipping archived.
CREATE OR REPLACE FUNCTION touch_clients_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  -- Sync archived_at to the archived flag transitions. App-set
  -- archived_at values are honored on first archive; subsequent
  -- updates overwrite to keep them consistent with the boolean.
  IF NEW.archived = true AND OLD.archived = false THEN
    NEW.archived_at = now();
  ELSIF NEW.archived = false AND OLD.archived = true THEN
    NEW.archived_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_touch_updated_at ON clients;
CREATE TRIGGER clients_touch_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION touch_clients_updated_at();

-- ------------------------------------------------------------------
-- client_attendance
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  attended boolean NOT NULL DEFAULT false,
  paid boolean NOT NULL DEFAULT false,
  -- Recorded at marking-time, not derived from session.start_time so
  -- post-session edits to the session don't rewrite attendance history.
  attended_at timestamptz,
  -- Payment fields. All three are co-required: when one is set, all
  -- three must be set. Enforced via CHECK below.
  amount_paid_cents bigint
    CHECK (amount_paid_cents IS NULL OR amount_paid_cents >= 0),
  currency text
    CHECK (currency IS NULL OR currency IN ('USD', 'COP')),
  payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'stripe', 'other')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_client_session UNIQUE (client_id, session_id),
  CONSTRAINT attendance_payment_consistency CHECK (
    -- Either nothing about payment is set, or all three payment fields
    -- are set together. Avoids partially-recorded payments that the UI
    -- would have to special-case.
    (amount_paid_cents IS NULL AND currency IS NULL AND payment_method IS NULL) OR
    (amount_paid_cents IS NOT NULL AND currency IS NOT NULL AND payment_method IS NOT NULL)
  ),
  CONSTRAINT paid_implies_amount CHECK (
    -- `paid = true` requires positive amount_paid_cents. Prevents
    -- "marked paid but no money recorded" rows that would corrupt
    -- revenue totals.
    paid = false OR (amount_paid_cents IS NOT NULL AND amount_paid_cents > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_client_attendance_client
  ON client_attendance (client_id, attended_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_client_attendance_session
  ON client_attendance (session_id);

-- For revenue queries that filter by date range across an instructor's
-- attendance. Uses the join-through-clients pattern in the DAL but a
-- created_at index helps the planner pick efficient scan order.
CREATE INDEX IF NOT EXISTS idx_client_attendance_paid_created
  ON client_attendance (created_at DESC)
  WHERE paid = true;

ALTER TABLE client_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Instructors manage own client attendance" ON client_attendance;
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

CREATE OR REPLACE FUNCTION touch_client_attendance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_attendance_touch_updated_at ON client_attendance;
CREATE TRIGGER client_attendance_touch_updated_at
  BEFORE UPDATE ON client_attendance
  FOR EACH ROW EXECUTE FUNCTION touch_client_attendance_updated_at();

-- ------------------------------------------------------------------
-- Documentation
-- ------------------------------------------------------------------

COMMENT ON TABLE clients IS
  'Instructor''s private client roster. Distinct from session_participants — clients exist independent of any specific session.';

COMMENT ON COLUMN clients.tags IS
  'Instructor-private free-form labels. Empty array (not NULL) so containment checks never need null handling.';

COMMENT ON COLUMN clients.archived_at IS
  'Auto-synced with archived flag via touch_clients_updated_at trigger. Do not write directly from the app.';

COMMENT ON TABLE client_attendance IS
  'Per-session attendance + payment marker for a client. Replaces the WhatsApp-spreadsheet bookkeeping pattern. Source for instructor_revenue_summary aggregations.';

COMMENT ON COLUMN client_attendance.amount_paid_cents IS
  'Amount paid for this specific attendance, in minor units. NULL when no money changed hands here (e.g. drop-in covered by a session package). When set, currency and payment_method must also be set.';

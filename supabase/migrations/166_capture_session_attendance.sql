-- 166_capture_session_attendance.sql
--
-- Captures public.session_attendance, which exists in production and in NO
-- tracked migration. It is one of the 19 live tables with no CREATE anywhere
-- under supabase/migrations (DB-02). A from-scratch rebuild does not reproduce
-- it today, and migration 167 is about to change its policies -- changing an
-- object the repo cannot recreate is how a rollback stops being possible.
--
-- Same intent and shape as 143-147: capture is capture. Every value below was
-- read from the live catalog (pg_attribute, pg_constraint, pg_indexes,
-- pg_policies, information_schema.role_table_grants) and is recorded verbatim,
-- including the parts that look like mistakes. This migration changes NOTHING
-- on production: the table, constraints and policies already exist there, so
-- every guarded statement is a no-op.
--
-- THREE CAPTURED ODDITIES, RECORDED AS-IS AND DELIBERATELY NOT "FIXED" HERE
--
-- 1. session_id, user_id, marked_by and attended are all NULLABLE. On a table
--    whose entire purpose is "did this user attend this session", both halves
--    of the key being optional is surprising. It is also load-bearing: the
--    UNIQUE (session_id, user_id) constraint is what upsertAttendance
--    (lib/dal/live.ts:141) conflicts on, and because NULLs do not collide in a
--    unique constraint, it is exactly why the one live row with user_id IS NULL
--    can exist at all -- and why a second such row could be added without
--    tripping the constraint. Capturing it, not changing it.
--
-- 2. session_attendance_marked_by_fkey has NO ON DELETE action, so it defaults
--    to NO ACTION, while the other two foreign keys are ON DELETE CASCADE.
--    That means deleting a user who marked attendance is blocked by this FK,
--    while deleting the athlete or the session removes the row. Asymmetric and
--    probably unintended; captured as-is.
--
-- 3. Both timestamps are `timestamp without time zone`, against the grain of
--    the rest of this schema (user_follows.created_at is timestamptz). This is
--    the detail a hand-reconstruction would have got wrong, and it would only
--    have surfaced on a from-scratch rebuild -- which is the exact scenario
--    this file exists to make reliable.
--
-- NOT RECREATED HERE: the two indexes the catalog reports,
-- session_attendance_pkey and session_attendance_session_id_user_id_key, are
-- both constraint-backed. Postgres creates them automatically when the PRIMARY
-- KEY and UNIQUE constraints below are added, so emitting CREATE INDEX for them
-- would fail with "relation already exists" on a rebuild. There are no
-- standalone indexes on this table -- note the absence of one on user_id, which
-- every read path filters by.

-- ── 1. Table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_attendance (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id  uuid,
  user_id     uuid,
  attended    boolean DEFAULT false,
  marked_by   uuid,
  marked_at   timestamp without time zone,
  notes       text,
  created_at  timestamp without time zone DEFAULT now()
);

-- ── 2. Constraints (names and definitions read from production) ────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_attendance_pkey') THEN
    ALTER TABLE public.session_attendance
      ADD CONSTRAINT session_attendance_pkey PRIMARY KEY (id);
  END IF;

  -- The conflict target for upsertAttendance. See oddity 1 in the header:
  -- NULLs do not collide here, so rows with a NULL user_id are not deduplicated.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_attendance_session_id_user_id_key') THEN
    ALTER TABLE public.session_attendance
      ADD CONSTRAINT session_attendance_session_id_user_id_key UNIQUE (session_id, user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_attendance_session_id_fkey') THEN
    ALTER TABLE public.session_attendance
      ADD CONSTRAINT session_attendance_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_attendance_user_id_fkey') THEN
    ALTER TABLE public.session_attendance
      ADD CONSTRAINT session_attendance_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  -- NO ON DELETE action, unlike the two above. Captured as-is; see oddity 2.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_attendance_marked_by_fkey') THEN
    ALTER TABLE public.session_attendance
      ADD CONSTRAINT session_attendance_marked_by_fkey
      FOREIGN KEY (marked_by) REFERENCES public.users(id);
  END IF;
END $$;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
-- Live state: ENABLED. No-op where it already is.
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

-- ── 4. Policies, verbatim as they exist today ──────────────────────────────
-- All four are PERMISSIVE and TO public (which includes anon). They are
-- captured exactly as-is, INCLUDING the two that 167 is about to replace.
--
-- Capturing a policy that is about to be removed looks redundant and is not:
-- without it, a database rebuilt from these migrations would never have the
-- open policy, so 167's DROP would be a silent no-op on the rebuild while being
-- a real security change on production. The two would diverge at exactly the
-- point the fix lands. 166 records the starting line; 167 is the diff.

-- The read leak. USING (true) TO public: anyone with the anon key reads every
-- row. Replaced by 167.
DROP POLICY IF EXISTS "Anyone can view attendance" ON public.session_attendance;
CREATE POLICY "Anyone can view attendance"
  ON public.session_attendance
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);

-- Hardcodes one operator's email instead of calling public.is_app_admin().
-- FOR ALL, so it carries INSERT/UPDATE/DELETE reach as well as SELECT.
-- Replaced by 167's sa_admin_manage, which preserves the FOR ALL scope.
DROP POLICY IF EXISTS "Admin can mark attendance" ON public.session_attendance;
CREATE POLICY "Admin can mark attendance"
  ON public.session_attendance
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    auth.uid() IN (
      SELECT users.id FROM public.users
      WHERE users.email = 'alainalisca@aplusfitnessllc.com'::text
    )
  );

-- The write policies. Both already require session ownership, and 167 leaves
-- them untouched.
DROP POLICY IF EXISTS "Hosts can mark attendance" ON public.session_attendance;
CREATE POLICY "Hosts can mark attendance"
  ON public.session_attendance
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = session_attendance.session_id
        AND sessions.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Hosts can update attendance" ON public.session_attendance;
CREATE POLICY "Hosts can update attendance"
  ON public.session_attendance
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = session_attendance.session_id
        AND sessions.creator_id = auth.uid()
    )
  );

-- There is NO DELETE policy. With RLS enabled that default-denies every delete
-- regardless of the DELETE grants below. Captured by its absence, stated here
-- so the absence reads as deliberate rather than as something this file missed.

-- ── 5. Grants, verbatim ────────────────────────────────────────────────────
-- Live state: anon, authenticated, postgres and service_role each hold all
-- seven of SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER --
-- granted DIRECTLY to each role, not inherited from PUBLIC. That distinction
-- matters for 167: REVOKE ... FROM PUBLIC does not remove a direct grant.
--
-- TRUNCATE is the one privilege here that escapes RLS entirely. Holding it as
-- anon and as authenticated is the sharpest edge in this grant set, and 167
-- removes it from both.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.session_attendance TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.session_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.session_attendance TO service_role;

COMMENT ON TABLE public.session_attendance IS
  'Per-user attendance record for a session, keyed on user_id (so it cannot '
  'represent guests -- see migration 153). NOT the authoritative attendance '
  'signal: session_participants.status = ''confirmed'' is, per 117 and 153. '
  'Captured by 166; read policy and grants locked down by 167.';

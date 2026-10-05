-- PROGRAM: T-AV
-- TICKET: T-AV2
-- TABLE: public.session_attendance OWNER: consumer
-- ALTERS: public.session_attendance (3 columns, 4 CHECK constraints, INSERT and UPDATE revoked from clients)
-- CREATES: av_mark_attendance(uuid, uuid, text)
-- RISK: HIGH
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV2: canonical attendance for consumer sessions
-- ════════════════════════════════════════════════════════════════════════════
--
-- Written on 2026-10-04 in the reserved T-AV block as 8000 (branch
-- feat/t-av2-canonical-attendance, 1f6cc137) and renumbered 224 on 2026-10-19
-- when it was cherry-picked onto main (feat/t-av2b-attendance): origin/main
-- ends at 223 (T-MOM1), 219 stays reserved for T-PLAN1.
--
-- RE-CHECKED ON PRODUCTION, 2026-10-19 (read-only catalog SELECTs): every
-- column this file reads has the type it assumes (pre-flight below asserts
-- them again); status, method and checked_in_at do not exist yet; no trigger
-- on the table; the only function that mentions it is
-- get_user_attendance_stats, a reader. 11 rows, unchanged since 2026-10-04.
--
-- RISK: HIGH, REVIEW NOTE REQUIRED. session_attendance is a consumer table that
-- main's code reads (StreakBanner, AchievementBadges, the session page,
-- post-session-followups, get_user_attendance_stats, get_session_attendance)
-- and, until this migration, writes from the client (upsertAttendance).
--
-- WHAT PRODUCTION HAS (read-only SELECTs, 2026-10-04)
--   rows 11; attended true 11, false 0, null 0; duplicate (session_id,
--   user_id) pairs 0; NULL session_id 0; NULL user_id 1; marked_by NULL on all
--   11 (the client writer never set it); 5 of 388 past sessions have any row.
--   UNIQUE (session_id, user_id) already exists (session_attendance_session_id_
--   user_id_key), so the spec's "unique index" step is done. NULLs are distinct
--   under UNIQUE, which is what the NOT VALID key check below closes for new
--   rows. The one NULL-user row is LEFT ALONE: deleting production data is
--   Al's call, and the check is NOT VALID so it does not block on that row.
--   Grants: authenticated holds table-level INSERT, SELECT, UPDATE. Policies:
--   hosts INSERT and UPDATE, sa_admin_manage (ALL, is_app_admin()),
--   sa_select_own_or_host (SELECT).
--
-- WHAT IT CHANGES
--   1. status text: 'attended' | 'no_show' | 'excused'; NULL means not marked.
--      method text: 'host' | 'voucher_scan' | 'admin'; NULL on legacy rows,
--      because nobody recorded how they were marked.
--      checked_in_at timestamptz: when the person was confirmed present.
--   2. attended stays and is kept equal to (status = 'attended') by a CHECK,
--      so every existing reader, all of which filter attended = true, returns
--      exactly what it returned before. Backfill: attended true becomes status
--      'attended'. attended false stays status NULL: false was both "no-show"
--      and "not marked", and which one it was cannot be recovered.
--   3. One write path: av_mark_attendance. INSERT and UPDATE are revoked from
--      anon and authenticated, so a client can no longer write the table at all.
--      The host INSERT and UPDATE policies are left in place; without the grant
--      they admit nothing, and removing them is not needed to close the path.
--   4. av_mark_attendance(session, user, status):
--        * caller must be the session's host (sessions.creator_id) or an app
--          admin. There is no co-host concept in this schema (checked).
--        * the person must be a CONFIRMED participant and not the host.
--        * window: from 30 minutes before start to 72 hours after end, in
--          America/Bogota. Admins are exempt, so a mistake can be corrected.
--        * a real upsert on (session_id, user_id): a duplicate is impossible.
--        * records marked_by and marked_at, the method, and checked_in_at
--          (kept from the first time the person was marked attended).
--        * an unauthorized caller and a missing session get the SAME
--          'not_found', as in T-AV21, so no response reveals which sessions
--          exist.
--
-- marked_at and created_at are timestamp WITHOUT time zone (recon). marked_at
-- is written as UTC wall-clock, the same value created_at's now() default
-- produces on this server.

BEGIN;

-- ── 0. Pre-flight ──────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '224_t_av2_canonical_attendance') THEN
    RAISE EXCEPTION '224 ABORTED: 224 is already recorded as applied.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'session_attendance'
                AND column_name IN ('status', 'method', 'checked_in_at')) THEN
    RAISE EXCEPTION '224 ABORTED: status, method or checked_in_at already exists on session_attendance; this file creates them and would not match it.';
  END IF;
  IF to_regprocedure('public.av_mark_attendance(uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION '224 ABORTED: av_mark_attendance already exists.';
  END IF;
  -- Every column the function and the backfill read, with the type they assume.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name, data_type) IN (
               ('session_attendance', 'session_id', 'uuid'),
               ('session_attendance', 'user_id', 'uuid'),
               ('session_attendance', 'attended', 'boolean'),
               ('session_attendance', 'marked_by', 'uuid'),
               ('session_attendance', 'marked_at', 'timestamp without time zone'),
               ('sessions', 'id', 'uuid'),
               ('sessions', 'creator_id', 'uuid'),
               ('sessions', 'date', 'date'),
               ('sessions', 'start_time', 'time without time zone'),
               ('sessions', 'end_time', 'time without time zone'),
               ('sessions', 'duration', 'integer'),
               ('session_participants', 'session_id', 'uuid'),
               ('session_participants', 'user_id', 'uuid'),
               ('session_participants', 'status', 'text'))) <> 14 THEN
    RAISE EXCEPTION '224 ABORTED: a column av_mark_attendance reads is missing or has another type.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.session_attendance'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION '224 ABORTED: session_attendance has a trigger now; it was written for a table with none.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.session_attendance'::regclass
                    AND contype = 'u'
                    AND pg_get_constraintdef(oid) = 'UNIQUE (session_id, user_id)') THEN
    RAISE EXCEPTION '224 ABORTED: UNIQUE (session_id, user_id) is missing; the upsert in av_mark_attendance depends on it.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.session_attendance
              GROUP BY session_id, user_id HAVING count(*) > 1 AND session_id IS NOT NULL AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION '224 ABORTED: duplicate (session_id, user_id) rows exist.';
  END IF;
  IF to_regprocedure('public.is_app_admin()') IS NULL THEN
    RAISE EXCEPTION '224 ABORTED: public.is_app_admin() does not exist.';
  END IF;
END $pre$;

-- ── 1. Columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.session_attendance ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.session_attendance ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE public.session_attendance ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

COMMENT ON COLUMN public.session_attendance.status IS
  'T-AV2. attended | no_show | excused. NULL means NOT MARKED, which is not the same as no-show. Written only by av_mark_attendance. attended is kept equal to (status = ''attended'').';
COMMENT ON COLUMN public.session_attendance.method IS
  'T-AV2. How the mark was made: host | voucher_scan | admin. NULL on rows from before T-AV2, whose method was never recorded.';
COMMENT ON COLUMN public.session_attendance.checked_in_at IS
  'T-AV2. When the person was first confirmed present. NULL unless status = attended, and NULL on rows from before T-AV2.';

-- ── 2. Backfill, then constraints ──────────────────────────────────────────
UPDATE public.session_attendance SET status = 'attended' WHERE attended IS TRUE AND status IS NULL;

ALTER TABLE public.session_attendance DROP CONSTRAINT IF EXISTS session_attendance_status_check;
ALTER TABLE public.session_attendance ADD CONSTRAINT session_attendance_status_check
  CHECK (status IS NULL OR status IN ('attended', 'no_show', 'excused'));

ALTER TABLE public.session_attendance DROP CONSTRAINT IF EXISTS session_attendance_method_check;
ALTER TABLE public.session_attendance ADD CONSTRAINT session_attendance_method_check
  CHECK (method IS NULL OR method IN ('host', 'voucher_scan', 'admin'));

-- The compatibility contract: every reader filters attended = true.
ALTER TABLE public.session_attendance DROP CONSTRAINT IF EXISTS session_attendance_attended_matches_status;
ALTER TABLE public.session_attendance ADD CONSTRAINT session_attendance_attended_matches_status
  CHECK (coalesce(attended, false) = (coalesce(status, '') = 'attended'));

-- New rows must name a session and a person. NOT VALID: production holds one
-- legacy row with a NULL user_id, left for Al to decide.
ALTER TABLE public.session_attendance DROP CONSTRAINT IF EXISTS session_attendance_keys_present;
ALTER TABLE public.session_attendance ADD CONSTRAINT session_attendance_keys_present
  CHECK (session_id IS NOT NULL AND user_id IS NOT NULL) NOT VALID;

-- ── 3. The one write path ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_mark_attendance(p_session_id uuid, p_user_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_admin    boolean;
  v_session  record;
  v_start    timestamptz;
  v_end      timestamptz;
  v_method   text;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('attended', 'no_show', 'excused') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  IF v_uid IS NULL OR p_session_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  SELECT s.id, s.creator_id, s.date, s.start_time, s.end_time, s.duration
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id;
  v_admin := coalesce(public.is_app_admin(), false);
  IF NOT FOUND OR (v_session.creator_id IS DISTINCT FROM v_uid AND NOT v_admin) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF p_user_id = v_session.creator_id
     OR NOT EXISTS (SELECT 1 FROM public.session_participants sp
                     WHERE sp.session_id = p_session_id
                       AND sp.user_id = p_user_id
                       AND sp.status = 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_participant');
  END IF;

  -- Session times are Medellin wall-clock. An end before the start means the
  -- session crosses midnight; no end falls back to start plus duration.
  v_start := (v_session.date + v_session.start_time) AT TIME ZONE 'America/Bogota';
  v_end := CASE
             WHEN v_session.end_time IS NOT NULL THEN
               (v_session.date + v_session.end_time
                + CASE WHEN v_session.end_time < v_session.start_time THEN interval '1 day' ELSE interval '0' END)
               AT TIME ZONE 'America/Bogota'
             ELSE v_start + make_interval(mins => coalesce(v_session.duration, 60))
           END;
  IF NOT v_admin AND (now() < v_start - interval '30 minutes' OR now() > v_end + interval '72 hours') THEN
    RETURN jsonb_build_object('success', false, 'error', 'outside_window');
  END IF;

  v_method := CASE WHEN v_session.creator_id = v_uid THEN 'host' ELSE 'admin' END;

  INSERT INTO public.session_attendance AS a
         (session_id, user_id, status, attended, method, marked_by, marked_at, checked_in_at)
  VALUES (p_session_id, p_user_id, p_status, coalesce(p_status = 'attended', false), v_method, v_uid,
          now() AT TIME ZONE 'UTC', CASE WHEN p_status = 'attended' THEN now() END)
  ON CONFLICT (session_id, user_id) DO UPDATE
     SET status        = EXCLUDED.status,
         attended      = EXCLUDED.attended,
         method        = EXCLUDED.method,
         marked_by     = EXCLUDED.marked_by,
         marked_at     = EXCLUDED.marked_at,
         checked_in_at = CASE WHEN EXCLUDED.status = 'attended'
                              THEN coalesce(a.checked_in_at, EXCLUDED.checked_in_at)
                         END;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$fn$;

COMMENT ON FUNCTION public.av_mark_attendance(uuid, uuid, text) IS
  'T-AV2. The only write path to session_attendance. Host or app admin; confirmed participant who is not the host; 30 min before start to 72 h after end (Bogota), admins exempt. status NULL un-marks.';

REVOKE ALL ON FUNCTION public.av_mark_attendance(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.av_mark_attendance(uuid, uuid, text) TO authenticated;

-- ── 4. Clients stop writing the table ──────────────────────────────────────
REVOKE INSERT, UPDATE ON public.session_attendance FROM anon, authenticated;

-- ── 5. Assert the end state ────────────────────────────────────────────────
DO $$
BEGIN
  IF has_any_column_privilege('authenticated', 'public.session_attendance', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.session_attendance', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.session_attendance', 'INSERT')
     OR has_any_column_privilege('anon', 'public.session_attendance', 'UPDATE') THEN
    RAISE EXCEPTION '224 ABORTED: a client role can still write session_attendance directly.';
  END IF;
  IF NOT has_any_column_privilege('authenticated', 'public.session_attendance', 'SELECT') THEN
    RAISE EXCEPTION '224 ABORTED: authenticated lost SELECT; every attendance reader would fail.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.av_mark_attendance(uuid,uuid,text)'::regprocedure)
     OR (SELECT proconfig FROM pg_proc WHERE oid = 'public.av_mark_attendance(uuid,uuid,text)'::regprocedure) IS NULL THEN
    RAISE EXCEPTION '224 ABORTED: av_mark_attendance must be SECURITY DEFINER with a pinned search_path.';
  END IF;
  IF has_function_privilege('anon', 'public.av_mark_attendance(uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.av_mark_attendance(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '224 ABORTED: av_mark_attendance has the wrong grants.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.session_attendance
              WHERE coalesce(attended, false) <> (coalesce(status, '') = 'attended')) THEN
    RAISE EXCEPTION '224 ABORTED: a row''s attended disagrees with its status after the backfill.';
  END IF;
  RAISE NOTICE '224: session_attendance canonical; av_mark_attendance is the only writer.';
END $$;

-- ── Record this migration as applied (renumbered into main's sequence, so it
--    records itself like every migration since 184) ───────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('224_t_av2_canonical_attendance',
        'T-AV2: session_attendance status/method/checked_in_at, attended held equal to status, av_mark_attendance the only writer, client INSERT/UPDATE revoked')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

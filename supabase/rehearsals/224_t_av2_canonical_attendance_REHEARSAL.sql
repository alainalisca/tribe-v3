-- 224_t_av2_canonical_attendance_REHEARSAL.sql. Dry run of 224. Applies nothing.
--
-- Run it with scripts/av-rehearse.sh, never by hand:
--
--   scripts/av-rehearse.sh 224_t_av2_canonical_attendance
--
-- PART M IS 224'S BODY, SPLICED VERBATIM (supabase/rehearsalBodyVerbatim.test.ts):
-- everything between the migration's own BEGIN and its "Record this migration
-- as applied" marker, guards and comments included, never retyped. Re-splice
-- after editing the migration. The runner still refuses a body with a COMMIT,
-- and T0 checks the transaction id is the same after the body as before it, so
-- a COMMIT that slipped in is a FAIL row, not a silent persist.
--
-- One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- FIXTURE (inside the transaction): six existing users (host H, confirmed
-- participants P1 and P2, pending Q, outsider O, admin A) and four sessions
-- hosted by H, timed against now() in America/Bogota:
--   S_now   started 1 hour ago, ends in 1 hour        (inside the window)
--   S_soon  starts in 20 minutes                       (inside: 30 min early)
--   S_early starts in 45 minutes                       (outside: too early)
--   S_old   ended 4 days ago                           (outside: past 72 h)
--   S_71    ended 71 hours ago                         (inside: the 72 h edge)
--   S_73    ended 73 hours ago                         (outside: the 72 h edge)
-- plus one LEGACY attendance row (P1 on S_old, attended true, no status),
-- written before 224 the way upsertAttendance wrote it.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_224 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_224_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_224_before (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE reh_224_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;

-- Runs one statement as a role and returns its single text value or the
-- error. The result is recorded only after RESET ROLE.
CREATE FUNCTION pg_temp.reh_case(p_arm text, p_actor text, p_expect text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_uid uuid;
  v_out text;
  v_got text;
BEGIN
  IF p_actor <> 'anon' THEN
    SELECT v INTO v_uid FROM reh_224_ids WHERE k = p_actor;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', CASE WHEN p_actor = 'anon' THEN 'anon' ELSE 'authenticated' END)::text, true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_uid::text, ''), true);
    EXECUTE CASE WHEN p_actor = 'anon' THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
    EXECUTE p_sql INTO v_out;
    EXECUTE 'RESET ROLE';
    v_got := coalesce(v_out, '<null>');
  EXCEPTION WHEN others THEN
    v_got := 'error=' || SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO reh_224 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got = p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('actor=%s expected %s, got %s', p_actor, p_expect, v_got));
END $f$;

-- A row's state, as postgres, in one comparable string.
-- plpgsql, not sql: a sql function's body is checked at CREATE, before 224
-- has added the columns it reads.
CREATE FUNCTION pg_temp.row_state(p_session text, p_user text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  RETURN coalesce((SELECT format('status=%s attended=%s method=%s marked_by=%s checked_in=%s',
                                 coalesce(a.status, 'null'), a.attended, coalesce(a.method, 'null'),
                                 CASE WHEN a.marked_by = (SELECT v FROM reh_224_ids WHERE k = 'H') THEN 'H'
                                      WHEN a.marked_by = (SELECT v FROM reh_224_ids WHERE k = 'A') THEN 'A'
                                      ELSE coalesce(a.marked_by::text, 'null') END,
                                 a.checked_in_at IS NOT NULL)
                     FROM public.session_attendance a
                    WHERE a.session_id = (SELECT v FROM reh_224_ids WHERE k = p_session)
                      AND a.user_id = (SELECT v FROM reh_224_ids WHERE k = p_user)), 'no row');
END $f$;

INSERT INTO reh_224 (arm, verdict, detail)
SELECT 'E0 ENV session_user and current_user', 'PASS', format('session_user=%s current_user=%s', session_user, current_user);

-- ── F. Fixture ─────────────────────────────────────────────────────────────
DO $f$
DECLARE
  u uuid[];
  u_a uuid;
  v_now timestamp := (now() AT TIME ZONE 'America/Bogota');
  s_now uuid; s_soon uuid; s_early uuid; s_old uuid; s_71 uuid; s_73 uuid;
BEGIN
  SELECT id INTO u_a FROM public.users WHERE is_admin AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT array_agg(id) INTO u FROM (
    SELECT id FROM public.users WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL
     ORDER BY created_at LIMIT 5) x;
  IF u_a IS NULL OR coalesce(cardinality(u), 0) < 5 THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need one admin and five non-admin users.';
  END IF;

  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now - interval '1 hour')::date, (v_now - interval '1 hour')::time,
          (v_now + interval '1 hour')::time, 120, 'Rehearsal 224 now', 10) RETURNING id INTO s_now;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now + interval '20 minutes')::date, (v_now + interval '20 minutes')::time,
          NULL, 60, 'Rehearsal 224 soon', 10) RETURNING id INTO s_soon;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now + interval '45 minutes')::date, (v_now + interval '45 minutes')::time,
          NULL, 60, 'Rehearsal 224 early', 10) RETURNING id INTO s_early;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now - interval '4 days 2 hours')::date, (v_now - interval '4 days 2 hours')::time,
          (v_now - interval '4 days 1 hour')::time, 60, 'Rehearsal 224 old', 10) RETURNING id INTO s_old;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now - interval '72 hours')::date, (v_now - interval '72 hours')::time,
          NULL, 60, 'Rehearsal 224 71h', 10) RETURNING id INTO s_71;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now - interval '74 hours')::date, (v_now - interval '74 hours')::time,
          NULL, 60, 'Rehearsal 224 73h', 10) RETURNING id INTO s_73;

  INSERT INTO public.session_participants (session_id, user_id, status)
  SELECT s, p.u, p.st FROM unnest(ARRAY[s_now, s_soon, s_early, s_old, s_71, s_73]) s,
       (VALUES (u[2], 'confirmed'), (u[3], 'confirmed'), (u[4], 'pending')) p(u, st);
  -- The host also holds a confirmed participant row, as on 23 live sessions
  -- (T-ATH7). Without it, C9 passes because the host is "not a participant",
  -- not because the function refuses the host: the first mutation run of this
  -- rehearsal missed exactly that.
  INSERT INTO public.session_participants (session_id, user_id, status) VALUES (s_now, u[1], 'confirmed');

  -- The legacy row, as upsertAttendance wrote it before 224.
  INSERT INTO public.session_attendance (session_id, user_id, attended) VALUES (s_old, u[2], true);

  INSERT INTO reh_224_ids VALUES ('H', u[1]), ('P1', u[2]), ('P2', u[3]), ('Q', u[4]), ('O', u[5]), ('A', u_a),
    ('S_now', s_now), ('S_soon', s_soon), ('S_early', s_early), ('S_old', s_old), ('S_71', s_71), ('S_73', s_73);
END $f$;

-- ── R0. What every existing reader returns BEFORE 224 ─────────────────────
INSERT INTO reh_224_before
SELECT 'stats', (SELECT row(total_sessions, attended_sessions, attendance_rate)::text
                   FROM public.get_user_attendance_stats((SELECT v FROM reh_224_ids WHERE k = 'P1')))
UNION ALL
SELECT 'attended_rows', (SELECT count(*)::text FROM public.session_attendance
                          WHERE user_id = (SELECT v FROM reh_224_ids WHERE k = 'P1') AND attended = true);

-- ── M. THE MIGRATION BODY, verbatim minus its own BEGIN and COMMIT ─────────
INSERT INTO reh_224_tx VALUES ('before', txid_current());
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
INSERT INTO reh_224 (arm, verdict, detail)
SELECT 'T0 the body did not commit (same transaction before and after)',
       CASE WHEN (SELECT v FROM reh_224_tx WHERE k = 'before') = txid_current() THEN 'PASS' ELSE 'FAIL' END,
       format('txid before=%s after=%s', (SELECT v FROM reh_224_tx WHERE k = 'before'), txid_current());

-- ── R. Existing readers: same output for the same data ─────────────────────
INSERT INTO reh_224 (arm, verdict, detail)
SELECT 'R1 get_user_attendance_stats unchanged for the legacy row',
       CASE WHEN b.v = a.v THEN 'PASS' ELSE 'FAIL' END, format('before %s, after %s', b.v, a.v)
  FROM reh_224_before b,
       (SELECT row(total_sessions, attended_sessions, attendance_rate)::text AS v
          FROM public.get_user_attendance_stats((SELECT v FROM reh_224_ids WHERE k = 'P1'))) a
 WHERE b.k = 'stats';
INSERT INTO reh_224 (arm, verdict, detail)
SELECT 'R2 attended = true rows unchanged (StreakBanner, AchievementBadges, followups)',
       CASE WHEN b.v = a.v THEN 'PASS' ELSE 'FAIL' END, format('before %s, after %s', b.v, a.v)
  FROM reh_224_before b,
       (SELECT count(*)::text AS v FROM public.session_attendance
         WHERE user_id = (SELECT v FROM reh_224_ids WHERE k = 'P1') AND attended = true) a
 WHERE b.k = 'attended_rows';
INSERT INTO reh_224 (arm, verdict, detail)
SELECT 'R3 backfill: the legacy row reads status attended, method unknown',
       CASE WHEN pg_temp.row_state('S_old', 'P1') = 'status=attended attended=t method=null marked_by=null checked_in=f'
            THEN 'PASS' ELSE 'FAIL' END, pg_temp.row_state('S_old', 'P1');

-- ── C. Cases ───────────────────────────────────────────────────────────────
DO $c$
DECLARE
  id record;
  mark text := 'SELECT (public.av_mark_attendance(%L, %L, %L))->>%L';
  achievement text;
BEGIN
  SELECT (SELECT v FROM reh_224_ids WHERE k = 'S_now') s_now, (SELECT v FROM reh_224_ids WHERE k = 'S_soon') s_soon,
         (SELECT v FROM reh_224_ids WHERE k = 'S_early') s_early, (SELECT v FROM reh_224_ids WHERE k = 'S_old') s_old,
         (SELECT v FROM reh_224_ids WHERE k = 'H') h, (SELECT v FROM reh_224_ids WHERE k = 'P1') p1,
         (SELECT v FROM reh_224_ids WHERE k = 'P2') p2, (SELECT v FROM reh_224_ids WHERE k = 'Q') q,
         (SELECT v FROM reh_224_ids WHERE k = 'O') o,
         (SELECT v FROM reh_224_ids WHERE k = 'S_71') s_71, (SELECT v FROM reh_224_ids WHERE k = 'S_73') s_73
    INTO id;
  -- What AchievementBadges on /my-training counts for the athlete.
  achievement := format('SELECT count(*)::text FROM public.session_attendance WHERE user_id = %L AND attended = true', id.p1);

  PERFORM pg_temp.reh_case('S0 athlete: My Training "sessions attended" before the host marks', 'P1', '1', achievement);
  PERFORM pg_temp.reh_case('S1 host marks a confirmed participant attended', 'H', 'true', format(mark, id.s_now, id.p1, 'attended', 'success'));
  INSERT INTO reh_224 (arm, verdict, detail)
  SELECT 'S2 the row: status, attended, method host, marked_by host, checked in',
         CASE WHEN pg_temp.row_state('S_now', 'P1') = 'status=attended attended=t method=host marked_by=H checked_in=t'
              THEN 'PASS' ELSE 'FAIL' END, pg_temp.row_state('S_now', 'P1');
  PERFORM pg_temp.reh_case('S3 athlete: My Training "sessions attended" reflects the mark', 'P1', '2', achievement);
  PERFORM pg_temp.reh_case('S4 athlete reads their own row', 'P1', 'attended',
    format('SELECT status FROM public.session_attendance WHERE session_id = %L AND user_id = %L', id.s_now, id.p1));

  PERFORM pg_temp.reh_case('S5 marking again is an update, never a second row', 'H', 'true', format(mark, id.s_now, id.p1, 'no_show', 'success'));
  PERFORM pg_temp.reh_case('S6 still exactly one row for that person and session', 'H', '1',
    format('SELECT count(*)::text FROM public.session_attendance WHERE session_id = %L AND user_id = %L', id.s_now, id.p1));
  INSERT INTO reh_224 (arm, verdict, detail)
  SELECT 'S7 no_show: attended false, check-in cleared',
         CASE WHEN pg_temp.row_state('S_now', 'P1') = 'status=no_show attended=f method=host marked_by=H checked_in=f'
              THEN 'PASS' ELSE 'FAIL' END, pg_temp.row_state('S_now', 'P1');
  PERFORM pg_temp.reh_case('S8 un-mark (NULL): back to not marked', 'H', 'true', format(mark, id.s_now, id.p1, NULL, 'success'));
  INSERT INTO reh_224 (arm, verdict, detail)
  SELECT 'S9 un-marked row: status null, attended false',
         CASE WHEN pg_temp.row_state('S_now', 'P1') LIKE 'status=null attended=f %' THEN 'PASS' ELSE 'FAIL' END,
         pg_temp.row_state('S_now', 'P1');
  PERFORM pg_temp.reh_case('S10 excused is a valid mark', 'H', 'true', format(mark, id.s_now, id.p2, 'excused', 'success'));
  PERFORM pg_temp.reh_case('S11 30 minutes early is inside the window', 'H', 'true', format(mark, id.s_soon, id.p1, 'attended', 'success'));
  PERFORM pg_temp.reh_case('S12 admin may correct outside the window', 'A', 'true', format(mark, id.s_old, id.p2, 'attended', 'success'));
  INSERT INTO reh_224 (arm, verdict, detail)
  SELECT 'S13 admin mark records method admin', CASE WHEN pg_temp.row_state('S_old', 'P2') LIKE '% method=admin marked_by=A %' THEN 'PASS' ELSE 'FAIL' END,
         pg_temp.row_state('S_old', 'P2');

  PERFORM pg_temp.reh_case('C1 confirmed participant cannot mark someone else', 'P2', 'not_found', format(mark, id.s_now, id.p1, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C2 athlete cannot mark themselves', 'P1', 'not_found', format(mark, id.s_now, id.p1, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C3 outsider cannot mark', 'O', 'not_found', format(mark, id.s_now, id.p1, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C4 anon cannot run the function', 'anon', 'error=42501', format(mark, id.s_now, id.p1, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C5 host cannot INSERT the table directly', 'H', 'error=42501',
    format('WITH x AS (INSERT INTO public.session_attendance (session_id, user_id, attended) VALUES (%L, %L, true) RETURNING 1) SELECT count(*)::text FROM x', id.s_now, id.p2));
  PERFORM pg_temp.reh_case('C6 host cannot UPDATE the table directly', 'H', 'error=42501',
    format('WITH x AS (UPDATE public.session_attendance SET attended = true WHERE session_id = %L RETURNING 1) SELECT count(*)::text FROM x', id.s_now));
  PERFORM pg_temp.reh_case('C7 pending participant cannot be marked', 'H', 'not_participant', format(mark, id.s_now, id.q, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C8 a non-participant cannot be marked', 'H', 'not_participant', format(mark, id.s_now, id.o, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C9 the host cannot be marked', 'H', 'not_participant', format(mark, id.s_now, id.h, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C10 more than 30 minutes before start is outside', 'H', 'outside_window', format(mark, id.s_early, id.p1, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C11 more than 72 hours after end is outside', 'H', 'outside_window', format(mark, id.s_old, id.p1, 'no_show', 'error'));
  PERFORM pg_temp.reh_case('S14 71 hours after the end is still inside', 'H', 'true', format(mark, id.s_71, id.p1, 'attended', 'success'));
  PERFORM pg_temp.reh_case('C14 73 hours after the end is outside', 'H', 'outside_window', format(mark, id.s_73, id.p1, 'attended', 'error'));
  PERFORM pg_temp.reh_case('C12 an unknown status is refused', 'H', 'invalid_status', format(mark, id.s_now, id.p1, 'present', 'error'));
  PERFORM pg_temp.reh_case('C13 an unknown session reads not_found', 'H', 'not_found', format(mark, gen_random_uuid(), id.p1, 'attended', 'error'));
END $c$;

-- ── P. checked_in_at is kept from the FIRST attended mark ─────────────────
DO $p$
DECLARE s uuid := (SELECT v FROM reh_224_ids WHERE k = 'S_soon'); u uuid := (SELECT v FROM reh_224_ids WHERE k = 'P1');
        first_in timestamptz; second_in timestamptz;
BEGIN
  -- S11 marked P1 attended on S_soon. Push its check-in into the past, as if
  -- marked an hour ago, then mark attended again.
  UPDATE public.session_attendance SET checked_in_at = now() - interval '1 hour' WHERE session_id = s AND user_id = u
  RETURNING checked_in_at INTO first_in;
  PERFORM pg_temp.reh_case('S15 re-marking attended', 'H', 'true',
    format('SELECT (public.av_mark_attendance(%L, %L, %L))->>%L', s, u, 'attended', 'success'));
  SELECT checked_in_at INTO second_in FROM public.session_attendance WHERE session_id = s AND user_id = u;
  INSERT INTO reh_224 (arm, verdict, detail)
  VALUES ('S16 a second attended mark keeps the first check-in time',
          CASE WHEN first_in IS NOT NULL AND second_in = first_in THEN 'PASS' ELSE 'FAIL' END,
          format('first=%s second=%s', first_in, second_in));
END $p$;

-- ── K. Constraints refuse inconsistent rows even from a privileged writer ──
DO $k$
DECLARE v_err text;
BEGIN
  BEGIN
    INSERT INTO public.session_attendance (session_id, user_id, attended, status)
    VALUES ((SELECT v FROM reh_224_ids WHERE k = 'S_now'), (SELECT v FROM reh_224_ids WHERE k = 'P2'), true, NULL)
    ON CONFLICT (session_id, user_id) DO UPDATE SET attended = true, status = NULL;
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh_224 (arm, verdict, detail)
  VALUES ('K1 attended true with no status is refused', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
  BEGIN
    INSERT INTO public.session_attendance (session_id, user_id, attended) VALUES ((SELECT v FROM reh_224_ids WHERE k = 'S_now'), NULL, false);
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh_224 (arm, verdict, detail)
  VALUES ('K2 a new row with no person is refused', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
END $k$;

-- ── The arms this file must emit, in order. The run below is compared with
--    this list, so a skipped or reordered arm shows instead of a short set. ──
CREATE TEMP TABLE reh_224_manifest (seq int PRIMARY KEY, arm text NOT NULL) ON COMMIT DROP;
INSERT INTO reh_224_manifest (seq, arm) VALUES
  (1, 'E0 ENV session_user and current_user'),
  (2, 'T0 the body did not commit (same transaction before and after)'),
  (3, 'R1 get_user_attendance_stats unchanged for the legacy row'),
  (4, 'R2 attended = true rows unchanged (StreakBanner, AchievementBadges, followups)'),
  (5, 'R3 backfill: the legacy row reads status attended, method unknown'),
  (6, 'S0 athlete: My Training "sessions attended" before the host marks'),
  (7, 'S1 host marks a confirmed participant attended'),
  (8, 'S2 the row: status, attended, method host, marked_by host, checked in'),
  (9, 'S3 athlete: My Training "sessions attended" reflects the mark'),
  (10, 'S4 athlete reads their own row'),
  (11, 'S5 marking again is an update, never a second row'),
  (12, 'S6 still exactly one row for that person and session'),
  (13, 'S7 no_show: attended false, check-in cleared'),
  (14, 'S8 un-mark (NULL): back to not marked'),
  (15, 'S9 un-marked row: status null, attended false'),
  (16, 'S10 excused is a valid mark'),
  (17, 'S11 30 minutes early is inside the window'),
  (18, 'S12 admin may correct outside the window'),
  (19, 'S13 admin mark records method admin'),
  (20, 'C1 confirmed participant cannot mark someone else'),
  (21, 'C2 athlete cannot mark themselves'),
  (22, 'C3 outsider cannot mark'),
  (23, 'C4 anon cannot run the function'),
  (24, 'C5 host cannot INSERT the table directly'),
  (25, 'C6 host cannot UPDATE the table directly'),
  (26, 'C7 pending participant cannot be marked'),
  (27, 'C8 a non-participant cannot be marked'),
  (28, 'C9 the host cannot be marked'),
  (29, 'C10 more than 30 minutes before start is outside'),
  (30, 'C11 more than 72 hours after end is outside'),
  (31, 'S14 71 hours after the end is still inside'),
  (32, 'C14 73 hours after the end is outside'),
  (33, 'C12 an unknown status is refused'),
  (34, 'C13 an unknown session reads not_found'),
  (35, 'S15 re-marking attended'),
  (36, 'S16 a second attended mark keeps the first check-in time'),
  (37, 'K1 attended true with no status is refused'),
  (38, 'K2 a new row with no person is refused');

SELECT seq, arm, verdict, detail FROM reh_224 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_224;
SELECT CASE WHEN (SELECT array_agg(arm ORDER BY seq) FROM reh_224)
                 = (SELECT array_agg(arm ORDER BY seq) FROM reh_224_manifest)
            THEN 'manifest matches: every arm ran, in order' ELSE 'MANIFEST MISMATCH' END AS manifest;

-- The one result set for the transaction. Every row must read PASS. 38 of 38.

ROLLBACK;

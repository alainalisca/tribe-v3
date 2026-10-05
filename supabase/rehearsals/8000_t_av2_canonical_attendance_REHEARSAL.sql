-- 8000_t_av2_canonical_attendance_REHEARSAL.sql. Dry run of 8000. Applies nothing.
--
-- Run it with scripts/av-rehearse.sh, never by hand:
--
--   scripts/av-rehearse.sh 8000_t_av2_canonical_attendance
--
-- WHY A RUNNER. 8000 carries its own BEGIN and COMMIT (the T-AV house shape).
-- Inside this script's outer transaction that COMMIT would end the transaction
-- and persist everything before it, on a local stack other sessions share. The
-- runner writes a copy with those two lines removed, refuses to run if any
-- COMMIT survives, and passes the copy in as :body. The script then checks that
-- the transaction id is the same after the body as before it (T0), so a COMMIT
-- that slipped through is a FAIL row, not a silent persist.
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
-- written before 8000 the way upsertAttendance wrote it.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_8000 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_8000_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_8000_before (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE reh_8000_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;

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
    SELECT v INTO v_uid FROM reh_8000_ids WHERE k = p_actor;
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
  INSERT INTO reh_8000 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got = p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('actor=%s expected %s, got %s', p_actor, p_expect, v_got));
END $f$;

-- A row's state, as postgres, in one comparable string.
-- plpgsql, not sql: a sql function's body is checked at CREATE, before 8000
-- has added the columns it reads.
CREATE FUNCTION pg_temp.row_state(p_session text, p_user text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  RETURN coalesce((SELECT format('status=%s attended=%s method=%s marked_by=%s checked_in=%s',
                                 coalesce(a.status, 'null'), a.attended, coalesce(a.method, 'null'),
                                 CASE WHEN a.marked_by = (SELECT v FROM reh_8000_ids WHERE k = 'H') THEN 'H'
                                      WHEN a.marked_by = (SELECT v FROM reh_8000_ids WHERE k = 'A') THEN 'A'
                                      ELSE coalesce(a.marked_by::text, 'null') END,
                                 a.checked_in_at IS NOT NULL)
                     FROM public.session_attendance a
                    WHERE a.session_id = (SELECT v FROM reh_8000_ids WHERE k = p_session)
                      AND a.user_id = (SELECT v FROM reh_8000_ids WHERE k = p_user)), 'no row');
END $f$;

INSERT INTO reh_8000 (arm, verdict, detail)
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
          (v_now + interval '1 hour')::time, 120, 'Rehearsal 8000 now', 10) RETURNING id INTO s_now;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now + interval '20 minutes')::date, (v_now + interval '20 minutes')::time,
          NULL, 60, 'Rehearsal 8000 soon', 10) RETURNING id INTO s_soon;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now + interval '45 minutes')::date, (v_now + interval '45 minutes')::time,
          NULL, 60, 'Rehearsal 8000 early', 10) RETURNING id INTO s_early;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now - interval '4 days 2 hours')::date, (v_now - interval '4 days 2 hours')::time,
          (v_now - interval '4 days 1 hour')::time, 60, 'Rehearsal 8000 old', 10) RETURNING id INTO s_old;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now - interval '72 hours')::date, (v_now - interval '72 hours')::time,
          NULL, 60, 'Rehearsal 8000 71h', 10) RETURNING id INTO s_71;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, end_time, duration, location, max_participants)
  VALUES (u[1], 'Running', (v_now - interval '74 hours')::date, (v_now - interval '74 hours')::time,
          NULL, 60, 'Rehearsal 8000 73h', 10) RETURNING id INTO s_73;

  INSERT INTO public.session_participants (session_id, user_id, status)
  SELECT s, p.u, p.st FROM unnest(ARRAY[s_now, s_soon, s_early, s_old, s_71, s_73]) s,
       (VALUES (u[2], 'confirmed'), (u[3], 'confirmed'), (u[4], 'pending')) p(u, st);
  -- The host also holds a confirmed participant row, as on 23 live sessions
  -- (T-ATH7). Without it, C9 passes because the host is "not a participant",
  -- not because the function refuses the host: the first mutation run of this
  -- rehearsal missed exactly that.
  INSERT INTO public.session_participants (session_id, user_id, status) VALUES (s_now, u[1], 'confirmed');

  -- The legacy row, as upsertAttendance wrote it before 8000.
  INSERT INTO public.session_attendance (session_id, user_id, attended) VALUES (s_old, u[2], true);

  INSERT INTO reh_8000_ids VALUES ('H', u[1]), ('P1', u[2]), ('P2', u[3]), ('Q', u[4]), ('O', u[5]), ('A', u_a),
    ('S_now', s_now), ('S_soon', s_soon), ('S_early', s_early), ('S_old', s_old), ('S_71', s_71), ('S_73', s_73);
END $f$;

-- ── R0. What every existing reader returns BEFORE 8000 ─────────────────────
INSERT INTO reh_8000_before
SELECT 'stats', (SELECT row(total_sessions, attended_sessions, attendance_rate)::text
                   FROM public.get_user_attendance_stats((SELECT v FROM reh_8000_ids WHERE k = 'P1')))
UNION ALL
SELECT 'attended_rows', (SELECT count(*)::text FROM public.session_attendance
                          WHERE user_id = (SELECT v FROM reh_8000_ids WHERE k = 'P1') AND attended = true);

-- ── M. THE MIGRATION BODY, verbatim minus its own BEGIN and COMMIT ─────────
INSERT INTO reh_8000_tx VALUES ('before', txid_current());
\i :body
INSERT INTO reh_8000 (arm, verdict, detail)
SELECT 'T0 the body did not commit (same transaction before and after)',
       CASE WHEN (SELECT v FROM reh_8000_tx WHERE k = 'before') = txid_current() THEN 'PASS' ELSE 'FAIL' END,
       format('txid before=%s after=%s', (SELECT v FROM reh_8000_tx WHERE k = 'before'), txid_current());

-- ── R. Existing readers: same output for the same data ─────────────────────
INSERT INTO reh_8000 (arm, verdict, detail)
SELECT 'R1 get_user_attendance_stats unchanged for the legacy row',
       CASE WHEN b.v = a.v THEN 'PASS' ELSE 'FAIL' END, format('before %s, after %s', b.v, a.v)
  FROM reh_8000_before b,
       (SELECT row(total_sessions, attended_sessions, attendance_rate)::text AS v
          FROM public.get_user_attendance_stats((SELECT v FROM reh_8000_ids WHERE k = 'P1'))) a
 WHERE b.k = 'stats';
INSERT INTO reh_8000 (arm, verdict, detail)
SELECT 'R2 attended = true rows unchanged (StreakBanner, AchievementBadges, followups)',
       CASE WHEN b.v = a.v THEN 'PASS' ELSE 'FAIL' END, format('before %s, after %s', b.v, a.v)
  FROM reh_8000_before b,
       (SELECT count(*)::text AS v FROM public.session_attendance
         WHERE user_id = (SELECT v FROM reh_8000_ids WHERE k = 'P1') AND attended = true) a
 WHERE b.k = 'attended_rows';
INSERT INTO reh_8000 (arm, verdict, detail)
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
  SELECT (SELECT v FROM reh_8000_ids WHERE k = 'S_now') s_now, (SELECT v FROM reh_8000_ids WHERE k = 'S_soon') s_soon,
         (SELECT v FROM reh_8000_ids WHERE k = 'S_early') s_early, (SELECT v FROM reh_8000_ids WHERE k = 'S_old') s_old,
         (SELECT v FROM reh_8000_ids WHERE k = 'H') h, (SELECT v FROM reh_8000_ids WHERE k = 'P1') p1,
         (SELECT v FROM reh_8000_ids WHERE k = 'P2') p2, (SELECT v FROM reh_8000_ids WHERE k = 'Q') q,
         (SELECT v FROM reh_8000_ids WHERE k = 'O') o,
         (SELECT v FROM reh_8000_ids WHERE k = 'S_71') s_71, (SELECT v FROM reh_8000_ids WHERE k = 'S_73') s_73
    INTO id;
  -- What AchievementBadges on /my-training counts for the athlete.
  achievement := format('SELECT count(*)::text FROM public.session_attendance WHERE user_id = %L AND attended = true', id.p1);

  PERFORM pg_temp.reh_case('S0 athlete: My Training "sessions attended" before the host marks', 'P1', '1', achievement);
  PERFORM pg_temp.reh_case('S1 host marks a confirmed participant attended', 'H', 'true', format(mark, id.s_now, id.p1, 'attended', 'success'));
  INSERT INTO reh_8000 (arm, verdict, detail)
  SELECT 'S2 the row: status, attended, method host, marked_by host, checked in',
         CASE WHEN pg_temp.row_state('S_now', 'P1') = 'status=attended attended=t method=host marked_by=H checked_in=t'
              THEN 'PASS' ELSE 'FAIL' END, pg_temp.row_state('S_now', 'P1');
  PERFORM pg_temp.reh_case('S3 athlete: My Training "sessions attended" reflects the mark', 'P1', '2', achievement);
  PERFORM pg_temp.reh_case('S4 athlete reads their own row', 'P1', 'attended',
    format('SELECT status FROM public.session_attendance WHERE session_id = %L AND user_id = %L', id.s_now, id.p1));

  PERFORM pg_temp.reh_case('S5 marking again is an update, never a second row', 'H', 'true', format(mark, id.s_now, id.p1, 'no_show', 'success'));
  PERFORM pg_temp.reh_case('S6 still exactly one row for that person and session', 'H', '1',
    format('SELECT count(*)::text FROM public.session_attendance WHERE session_id = %L AND user_id = %L', id.s_now, id.p1));
  INSERT INTO reh_8000 (arm, verdict, detail)
  SELECT 'S7 no_show: attended false, check-in cleared',
         CASE WHEN pg_temp.row_state('S_now', 'P1') = 'status=no_show attended=f method=host marked_by=H checked_in=f'
              THEN 'PASS' ELSE 'FAIL' END, pg_temp.row_state('S_now', 'P1');
  PERFORM pg_temp.reh_case('S8 un-mark (NULL): back to not marked', 'H', 'true', format(mark, id.s_now, id.p1, NULL, 'success'));
  INSERT INTO reh_8000 (arm, verdict, detail)
  SELECT 'S9 un-marked row: status null, attended false',
         CASE WHEN pg_temp.row_state('S_now', 'P1') LIKE 'status=null attended=f %' THEN 'PASS' ELSE 'FAIL' END,
         pg_temp.row_state('S_now', 'P1');
  PERFORM pg_temp.reh_case('S10 excused is a valid mark', 'H', 'true', format(mark, id.s_now, id.p2, 'excused', 'success'));
  PERFORM pg_temp.reh_case('S11 30 minutes early is inside the window', 'H', 'true', format(mark, id.s_soon, id.p1, 'attended', 'success'));
  PERFORM pg_temp.reh_case('S12 admin may correct outside the window', 'A', 'true', format(mark, id.s_old, id.p2, 'attended', 'success'));
  INSERT INTO reh_8000 (arm, verdict, detail)
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
DECLARE s uuid := (SELECT v FROM reh_8000_ids WHERE k = 'S_soon'); u uuid := (SELECT v FROM reh_8000_ids WHERE k = 'P1');
        first_in timestamptz; second_in timestamptz;
BEGIN
  -- S11 marked P1 attended on S_soon. Push its check-in into the past, as if
  -- marked an hour ago, then mark attended again.
  UPDATE public.session_attendance SET checked_in_at = now() - interval '1 hour' WHERE session_id = s AND user_id = u
  RETURNING checked_in_at INTO first_in;
  PERFORM pg_temp.reh_case('S15 re-marking attended', 'H', 'true',
    format('SELECT (public.av_mark_attendance(%L, %L, %L))->>%L', s, u, 'attended', 'success'));
  SELECT checked_in_at INTO second_in FROM public.session_attendance WHERE session_id = s AND user_id = u;
  INSERT INTO reh_8000 (arm, verdict, detail)
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
    VALUES ((SELECT v FROM reh_8000_ids WHERE k = 'S_now'), (SELECT v FROM reh_8000_ids WHERE k = 'P2'), true, NULL)
    ON CONFLICT (session_id, user_id) DO UPDATE SET attended = true, status = NULL;
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh_8000 (arm, verdict, detail)
  VALUES ('K1 attended true with no status is refused', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
  BEGIN
    INSERT INTO public.session_attendance (session_id, user_id, attended) VALUES ((SELECT v FROM reh_8000_ids WHERE k = 'S_now'), NULL, false);
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh_8000 (arm, verdict, detail)
  VALUES ('K2 a new row with no person is refused', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
END $k$;

SELECT seq, arm, verdict, detail FROM reh_8000 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_8000;

ROLLBACK;

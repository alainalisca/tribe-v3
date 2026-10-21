-- 227_t_polish1_session_capacity_and_start_REHEARSAL.sql. Dry run of 227. Applies nothing.
--
-- Run it with scripts/av-rehearse.sh, never by hand:
--
--   scripts/av-rehearse.sh 227_t_polish1_session_capacity_and_start
--
-- PART M IS 227'S BODY, SPLICED VERBATIM (supabase/rehearsalBodyVerbatim.test.ts):
-- everything between the migration's own BEGIN and its "Record this migration
-- as applied" marker, guards and comments included, never retyped. Re-splice
-- after editing the migration. T0 checks the transaction id is the same after
-- the body as before it, so a COMMIT that slipped in is a FAIL row.
--
-- One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- FIXTURE (inside the transaction, written as the superuser before the body):
-- one existing non-admin user H, and three of H's sessions: S_future (active,
-- one-off, two days ahead), S_started (active, one-off, started an hour ago)
-- and S_cancelled (cancelled, two days ahead). Every arm runs in its own
-- subtransaction and is rolled back after its result is read, so no arm sees
-- another's rows.
--
-- ARMS
--   B   before 227: the gap reproduces (a host inserts 600 athletes, and a
--       session that started an hour ago).
--   A   after 227: the CHECK, the trigger and the function have the expected
--       shape and privileges.
--   C   capacity: 2 and 500 pass, 1 and 501 are refused, on insert and update.
--   D   start: an hour ago is refused, five minutes ago passes (the grace), an
--       hour ahead passes. D3 also proves the time is read as Bogotá: an hour
--       ahead in Bogotá is four hours BEHIND if read as UTC.
--   X   every exemption: the service role, a recurring parent, an update that
--       does not touch date or time, one that names them unchanged, a row that
--       is not active.
--   U   an update that moves a start: into the past refused, to the future fine.
--   G   the pre-flight and the post-check, called again against states built to
--       fail: each abort fires, the applied state reads 're-run', an empty one
--       'first run'.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_227 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_227_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_227_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;

-- Runs one statement as an actor and records 'ok rows=N' or the error
-- (SQLSTATE and message), then rolls the statement back. p_expect is a LIKE
-- pattern. Actor 'H' is the host as an authenticated browser client; 'SR' is
-- the service role, which carries no sub.
CREATE FUNCTION pg_temp.reh_case(p_arm text, p_actor text, p_expect text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_uid uuid;
  v_n bigint;
  v_got text;
BEGIN
  SELECT v INTO v_uid FROM reh_227_ids WHERE k = p_actor;
  BEGIN
    IF p_actor = 'SR' THEN
      PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
      PERFORM set_config('request.jwt.claim.sub', '', true);
      EXECUTE 'SET LOCAL ROLE service_role';
    ELSE
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', coalesce(v_uid::text, ''), true);
      EXECUTE 'SET LOCAL ROLE authenticated';
    END IF;
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_got := 'ok rows=' || v_n;
    RAISE EXCEPTION 'reh_227 undo' USING ERRCODE = 'P0227';
  EXCEPTION
    WHEN SQLSTATE 'P0227' THEN NULL;
    WHEN others THEN v_got := 'error=' || SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO reh_227 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got LIKE p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('actor=%s expected %s, got %s', p_actor, p_expect, coalesce(v_got, '<null>')));
END $f$;

-- Builds a state inside a subtransaction, calls one of the migration's own
-- checks on it, records what it said, and rolls the state back.
CREATE FUNCTION pg_temp.reh_shape(p_arm text, p_check text, p_expect text, p_build text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_got text;
BEGIN
  BEGIN
    EXECUTE p_build;
    EXECUTE format('SELECT pg_temp.%I()', p_check) INTO v_got;
    RAISE EXCEPTION 'reh_227 undo' USING ERRCODE = 'P0227';
  EXCEPTION
    WHEN SQLSTATE 'P0227' THEN NULL;
    WHEN others THEN v_got := 'error=' || SQLERRM;
  END;
  INSERT INTO reh_227 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got LIKE p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('%s: expected %s, got %s', p_check, p_expect, coalesce(v_got, '<null>')));
END $f$;

-- An insert of one of H's sessions whose start is a Bogotá wall-clock timestamp.
CREATE FUNCTION pg_temp.ins_sql(p_actor text, p_start timestamp, p_max int, p_status text, p_recurring boolean)
RETURNS text LANGUAGE sql AS $f$
  SELECT format(
    'INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status, is_recurring, recurrence_pattern) '
    'VALUES (%L, %L, %L, %L, 60, %L, %s, %L, %L, %L)',
    (SELECT v FROM reh_227_ids WHERE k = 'H'), 'Boxing', p_start::date, p_start::time,
    'Rehearsal 227 ' || p_actor, p_max, p_status, p_recurring,
    CASE WHEN p_recurring THEN 'weekly_2' END);
$f$;

-- Bogotá wall-clock now, shifted.
CREATE FUNCTION pg_temp.bog(p_shift interval) RETURNS timestamp LANGUAGE sql AS $f$
  SELECT (now() + p_shift) AT TIME ZONE 'America/Bogota';
$f$;

CREATE FUNCTION pg_temp.upd_sql(p_session text, p_set text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('UPDATE public.sessions SET %s WHERE id = %L', p_set, (SELECT v FROM reh_227_ids WHERE k = p_session));
$f$;

INSERT INTO reh_227 (arm, verdict, detail)
SELECT 'E0 ENV session_user and current_user', 'PASS', format('session_user=%s current_user=%s', session_user, current_user);

-- ── F. Fixture ─────────────────────────────────────────────────────────────
DO $f$
DECLARE
  u_h uuid;
  s_future uuid; s_started uuid; s_cancelled uuid;
  t_future timestamp := (now() + interval '2 days') AT TIME ZONE 'America/Bogota';
  t_started timestamp := (now() - interval '1 hour') AT TIME ZONE 'America/Bogota';
BEGIN
  SELECT id INTO u_h FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF u_h IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need one non-admin user.';
  END IF;

  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u_h, 'Boxing', t_future::date, '07:00', 60, 'Rehearsal 227 future', 10, 'active') RETURNING id INTO s_future;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u_h, 'Boxing', t_started::date, t_started::time, 60, 'Rehearsal 227 started', 10, 'active') RETURNING id INTO s_started;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u_h, 'Boxing', t_future::date, '08:00', 60, 'Rehearsal 227 cancelled', 10, 'cancelled') RETURNING id INTO s_cancelled;

  INSERT INTO reh_227_ids VALUES ('H', u_h), ('S_future', s_future), ('S_started', s_started), ('S_cancelled', s_cancelled);
END $f$;

-- ── B. Before 227 ──────────────────────────────────────────────────────────
SELECT pg_temp.reh_case('B1 before 227: a host inserts a session for 600 athletes', 'H', 'ok rows=1',
                        pg_temp.ins_sql('B1', pg_temp.bog('2 days'), 600, 'active', false));
SELECT pg_temp.reh_case('B2 before 227: a host inserts a session that started an hour ago', 'H', 'ok rows=1',
                        pg_temp.ins_sql('B2', pg_temp.bog('-1 hour'), 10, 'active', false));

INSERT INTO reh_227_tx VALUES ('before', txid_current());

-- ══════════════════════════════════════════════════════════════════════════
-- PART M. 227's body, verbatim.
-- ══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.m227_preflight() RETURNS text LANGUAGE plpgsql AS $pre$
DECLARE
  v_bad integer;
  v_def text;
  v_fn regprocedure := to_regprocedure('public.sessions_start_ahead_guard()');
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sessions'
         AND ((column_name = 'date' AND data_type = 'date' AND is_nullable = 'NO')
           OR (column_name = 'start_time' AND data_type = 'time without time zone' AND is_nullable = 'NO')
           OR (column_name = 'max_participants' AND data_type = 'integer' AND is_nullable = 'NO')
           OR (column_name = 'status' AND data_type = 'text')
           OR (column_name = 'is_recurring' AND data_type = 'boolean'))) <> 5 THEN
    RAISE EXCEPTION '227 ABORTED: sessions.date, start_time, max_participants, status or is_recurring is not the shape measured on 2026-10-21.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = 'America/Bogota') THEN
    RAISE EXCEPTION '227 ABORTED: this server has no America/Bogota time zone.';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION '227 ABORTED: auth.uid() does not exist.';
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.sessions'::regclass AND c.conname = 'sessions_max_participants_range';
  -- A constraint someone added NOT VALID by hand reads back with that suffix;
  -- VALIDATE below finishes it.
  IF v_def IS NOT NULL
     AND regexp_replace(v_def, ' NOT VALID$', '') <> 'CHECK (((max_participants >= 2) AND (max_participants <= 500)))' THEN
    RAISE EXCEPTION '227 ABORTED: sessions_max_participants_range already exists as %; read it before replacing it.', v_def;
  END IF;
  SELECT count(*) INTO v_bad FROM public.sessions WHERE max_participants NOT BETWEEN 2 AND 500;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '227 ABORTED: % session row(s) have max_participants outside 2..500; fix them before the CHECK.', v_bad;
  END IF;

  IF v_fn IS NOT NULL
     AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM 'dd101314a57efabd2bd8c86b62ff0afa' THEN
    RAISE EXCEPTION '227 ABORTED: public.sessions_start_ahead_guard() exists with a body this file did not write.';
  END IF;
  IF v_fn IS NULL AND EXISTS (SELECT 1 FROM pg_trigger
                               WHERE tgrelid = 'public.sessions'::regclass
                                 AND tgname = 'sessions_start_ahead_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '227 ABORTED: a trigger named sessions_start_ahead_guard exists without its function.';
  END IF;

  RETURN CASE WHEN v_def IS NULL AND v_fn IS NULL THEN 'first run' ELSE 're-run' END;
END $pre$;

DO $$
BEGIN
  RAISE NOTICE '227 pre-flight: %', pg_temp.m227_preflight();
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.sessions'::regclass AND conname = 'sessions_max_participants_range') THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_max_participants_range CHECK (max_participants BETWEEN 2 AND 500) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.sessions VALIDATE CONSTRAINT sessions_max_participants_range;

COMMENT ON CONSTRAINT sessions_max_participants_range ON public.sessions IS
  'T-POLISH1 (227): 2 to 500 athletes. Same bounds as MIN_ATHLETES / MAX_ATHLETES in lib/sessions/sessionFormRules.ts.';

CREATE OR REPLACE FUNCTION public.sessions_start_ahead_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'active' OR NEW.is_recurring IS TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time THEN
    RETURN NEW;
  END IF;
  IF ((NEW.date + NEW.start_time) AT TIME ZONE 'America/Bogota') < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'session_start_in_past'
      USING ERRCODE = 'check_violation',
            DETAIL = format('The session would start at %s (America/Bogota), which has passed.', NEW.date + NEW.start_time),
            HINT = 'Pick a start time that is still ahead.';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sessions_start_ahead_guard() IS
  'T-POLISH1 (227): a signed-in client cannot write an active one-off session that started more than 10 minutes ago (America/Bogota). Service role, recurring parents, non-active rows and updates that keep date and start_time pass.';

REVOKE ALL ON FUNCTION public.sessions_start_ahead_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sessions_start_ahead_guard ON public.sessions;
CREATE TRIGGER sessions_start_ahead_guard
  BEFORE INSERT OR UPDATE OF date, start_time ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.sessions_start_ahead_guard();

CREATE FUNCTION pg_temp.m227_postcheck() RETURNS text LANGUAGE plpgsql AS $post$
DECLARE
  v_fn regprocedure := to_regprocedure('public.sessions_start_ahead_guard()');
  v_trg record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.sessions'::regclass AND conname = 'sessions_max_participants_range'
                    AND contype = 'c' AND convalidated
                    AND pg_get_constraintdef(oid) = 'CHECK (((max_participants >= 2) AND (max_participants <= 500)))') THEN
    RAISE EXCEPTION '227 ABORTED: sessions_max_participants_range is missing, not validated, or not 2..500.';
  END IF;

  IF v_fn IS NULL THEN
    RAISE EXCEPTION '227 ABORTED: public.sessions_start_ahead_guard() is missing.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM 'dd101314a57efabd2bd8c86b62ff0afa' THEN
    RAISE EXCEPTION '227 ABORTED: public.sessions_start_ahead_guard() is not this file''s body.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn
              AND (prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=public'])) THEN
    RAISE EXCEPTION '227 ABORTED: public.sessions_start_ahead_guard() is SECURITY DEFINER or lost its search_path.';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '227 ABORTED: anon or authenticated can EXECUTE sessions_start_ahead_guard().';
  END IF;

  -- tgtype 23 = ROW (1) + BEFORE (2) + INSERT (4) + UPDATE (16). The column
  -- list is exactly date and start_time; no WHEN clause.
  SELECT t.tgtype, t.tgfoid, t.tgenabled, t.tgqual,
         (SELECT array_agg(a.attname::text ORDER BY a.attname)
            FROM unnest(t.tgattr::int2[]) k JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = k) AS cols
    INTO v_trg
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.sessions'::regclass AND t.tgname = 'sessions_start_ahead_guard' AND NOT t.tgisinternal;
  IF v_trg.tgfoid IS DISTINCT FROM v_fn::oid OR v_trg.tgtype <> 23 OR v_trg.tgenabled = 'D'
     OR v_trg.tgqual IS NOT NULL OR v_trg.cols IS DISTINCT FROM ARRAY['date', 'start_time'] THEN
    RAISE EXCEPTION '227 ABORTED: sessions_start_ahead_guard is not the enabled BEFORE INSERT OR UPDATE OF date, start_time row trigger.';
  END IF;

  RETURN 'CHECK 2..500 validated; start-ahead trigger in place';
END $post$;

DO $$
BEGIN
  RAISE NOTICE '227: %', pg_temp.m227_postcheck();
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- After 227
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO reh_227 (arm, verdict, detail)
SELECT 'T0 the body did not commit (same transaction before and after)',
       CASE WHEN (SELECT v FROM reh_227_tx WHERE k = 'before') = txid_current() THEN 'PASS' ELSE 'FAIL' END,
       format('txid before=%s after=%s', (SELECT v FROM reh_227_tx WHERE k = 'before'), txid_current());

INSERT INTO reh_227 (arm, verdict, detail)
SELECT 'A1 the CHECK is there, validated, 2..500',
       CASE WHEN c.convalidated AND pg_get_constraintdef(c.oid) = 'CHECK (((max_participants >= 2) AND (max_participants <= 500)))'
            THEN 'PASS' ELSE 'FAIL' END,
       format('validated=%s def=%s', c.convalidated, pg_get_constraintdef(c.oid))
  FROM (SELECT NULL) x
  LEFT JOIN pg_constraint c ON c.conrelid = 'public.sessions'::regclass AND c.conname = 'sessions_max_participants_range';

INSERT INTO reh_227 (arm, verdict, detail)
SELECT 'A2 the trigger is BEFORE INSERT OR UPDATE OF date, start_time, enabled',
       CASE WHEN pg_get_triggerdef(t.oid) = 'CREATE TRIGGER sessions_start_ahead_guard BEFORE INSERT OR UPDATE OF date, start_time ON public.sessions FOR EACH ROW EXECUTE FUNCTION sessions_start_ahead_guard()'
                 AND t.tgenabled <> 'D' THEN 'PASS' ELSE 'FAIL' END,
       pg_get_triggerdef(t.oid)
  FROM (SELECT NULL) x
  LEFT JOIN pg_trigger t ON t.tgrelid = 'public.sessions'::regclass AND t.tgname = 'sessions_start_ahead_guard';

INSERT INTO reh_227 (arm, verdict, detail)
SELECT 'A3 the function is SECURITY INVOKER and no client role can EXECUTE it',
       CASE WHEN NOT p.prosecdef
                 AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                 AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END,
       format('secdef=%s anon=%s authenticated=%s', p.prosecdef,
              has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  FROM pg_proc p WHERE p.oid = to_regprocedure('public.sessions_start_ahead_guard()');

-- ── C. Capacity ────────────────────────────────────────────────────────────
SELECT pg_temp.reh_case('C1 a host cannot insert 501 athletes', 'H', 'error=23514 %sessions_max_participants_range%',
                        pg_temp.ins_sql('C1', pg_temp.bog('2 days'), 501, 'active', false));
SELECT pg_temp.reh_case('C2 a host inserts 500 athletes', 'H', 'ok rows=1',
                        pg_temp.ins_sql('C2', pg_temp.bog('2 days'), 500, 'active', false));
SELECT pg_temp.reh_case('C3 a host inserts 2 athletes', 'H', 'ok rows=1',
                        pg_temp.ins_sql('C3', pg_temp.bog('2 days'), 2, 'active', false));
SELECT pg_temp.reh_case('C4 a host cannot insert 1 athlete', 'H', 'error=23514 %sessions_max_participants_range%',
                        pg_temp.ins_sql('C4', pg_temp.bog('2 days'), 1, 'active', false));
SELECT pg_temp.reh_case('C5 a host cannot raise an existing session to 501', 'H', 'error=23514 %sessions_max_participants_range%',
                        pg_temp.upd_sql('S_future', 'max_participants = 501'));
SELECT pg_temp.reh_case('C6 the service role cannot insert 501 either (a CHECK has no exemptions)', 'SR', 'error=23514 %sessions_max_participants_range%',
                        pg_temp.ins_sql('C6', pg_temp.bog('2 days'), 501, 'active', false));

-- ── D. Start ───────────────────────────────────────────────────────────────
SELECT pg_temp.reh_case('D1 a host cannot insert an active one-off that started an hour ago', 'H', 'error=23514 session_start_in_past',
                        pg_temp.ins_sql('D1', pg_temp.bog('-1 hour'), 10, 'active', false));
SELECT pg_temp.reh_case('D2 a host inserts one that started 5 minutes ago (the grace)', 'H', 'ok rows=1',
                        pg_temp.ins_sql('D2', pg_temp.bog('-5 minutes'), 10, 'active', false));
SELECT pg_temp.reh_case('D3 a host inserts one an hour ahead in Bogota (4 hours behind if read as UTC)', 'H', 'ok rows=1',
                        pg_temp.ins_sql('D3', pg_temp.bog('1 hour'), 10, 'active', false));
SELECT pg_temp.reh_case('D4 a host cannot insert one that started 11 minutes ago', 'H', 'error=23514 session_start_in_past',
                        pg_temp.ins_sql('D4', pg_temp.bog('-11 minutes'), 10, 'active', false));

-- ── X. Exemptions ──────────────────────────────────────────────────────────
SELECT pg_temp.reh_case('X1 the service role inserts a session that happened yesterday (Moments past-session)', 'SR', 'ok rows=1',
                        pg_temp.ins_sql('X1', pg_temp.bog('-1 day'), 10, 'active', false));
SELECT pg_temp.reh_case('X2 a host inserts a recurring parent whose own start has passed', 'H', 'ok rows=1',
                        pg_temp.ins_sql('X2', pg_temp.bog('-1 day'), 10, 'active', true));
SELECT pg_temp.reh_case('X3 a host edits the description of a session that already started', 'H', 'ok rows=1',
                        pg_temp.upd_sql('S_started', 'description = ''rehearsal 227'''));
SELECT pg_temp.reh_case('X4 a host saves a started session naming its date and start_time unchanged', 'H', 'ok rows=1',
                        pg_temp.upd_sql('S_started', 'date = date, start_time = start_time, description = ''rehearsal 227'''));
SELECT pg_temp.reh_case('X5 a host moves a cancelled session into the past (status is not active)', 'H', 'ok rows=1',
                        pg_temp.upd_sql('S_cancelled', format('date = %L', (pg_temp.bog('-2 days'))::date)));
SELECT pg_temp.reh_case('X6 a host inserts a cancelled row whose start has passed', 'H', 'ok rows=1',
                        pg_temp.ins_sql('X6', pg_temp.bog('-1 day'), 10, 'cancelled', false));

-- ── U. Updates that move the start ─────────────────────────────────────────
SELECT pg_temp.reh_case('U1 a host cannot move a future session to an hour ago', 'H', 'error=23514 session_start_in_past',
                        pg_temp.upd_sql('S_future', format('date = %L, start_time = %L',
                                        (pg_temp.bog('-1 hour'))::date, (pg_temp.bog('-1 hour'))::time)));
SELECT pg_temp.reh_case('U2 a host moves a future session to another future time', 'H', 'ok rows=1',
                        pg_temp.upd_sql('S_future', 'start_time = ''09:30'''));
SELECT pg_temp.reh_case('U3 a host cannot move a started session to a different past time', 'H', 'error=23514 session_start_in_past',
                        pg_temp.upd_sql('S_started', 'start_time = start_time - interval ''1 minute'''));

-- ── G. The checks, against states built to fail ────────────────────────────
SELECT pg_temp.reh_shape('G1 the applied state reads re-run', 'm227_preflight', 're-run', 'SELECT 1');
SELECT pg_temp.reh_shape('G2 nothing applied reads first run', 'm227_preflight', 'first run',
  'DROP TRIGGER sessions_start_ahead_guard ON public.sessions; DROP FUNCTION public.sessions_start_ahead_guard(); ALTER TABLE public.sessions DROP CONSTRAINT sessions_max_participants_range');
SELECT pg_temp.reh_shape('G3 a row outside 2..500 aborts', 'm227_preflight', 'error=227 ABORTED: 1 session row(s) have max_participants outside 2..500%',
  format('ALTER TABLE public.sessions DROP CONSTRAINT sessions_max_participants_range; UPDATE public.sessions SET max_participants = 600 WHERE id = %L',
         (SELECT v FROM reh_227_ids WHERE k = 'S_future')));
SELECT pg_temp.reh_shape('G4 a different constraint under the name aborts', 'm227_preflight', 'error=227 ABORTED: sessions_max_participants_range already exists as%',
  'ALTER TABLE public.sessions DROP CONSTRAINT sessions_max_participants_range; ALTER TABLE public.sessions ADD CONSTRAINT sessions_max_participants_range CHECK (max_participants BETWEEN 2 AND 100)');
SELECT pg_temp.reh_shape('G5 the same constraint added NOT VALID reads re-run', 'm227_preflight', 're-run',
  'ALTER TABLE public.sessions DROP CONSTRAINT sessions_max_participants_range; ALTER TABLE public.sessions ADD CONSTRAINT sessions_max_participants_range CHECK (max_participants BETWEEN 2 AND 500) NOT VALID');
SELECT pg_temp.reh_shape('G6 a different function body aborts', 'm227_preflight', 'error=227 ABORTED: public.sessions_start_ahead_guard() exists with a body this file did not write.',
  'CREATE OR REPLACE FUNCTION public.sessions_start_ahead_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$');
SELECT pg_temp.reh_shape('G7 a trigger of the name without the function aborts', 'm227_preflight', 'error=227 ABORTED: a trigger named sessions_start_ahead_guard exists without its function.',
  'DROP TRIGGER sessions_start_ahead_guard ON public.sessions; DROP FUNCTION public.sessions_start_ahead_guard(); CREATE FUNCTION public.reh_227_stand_in() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$; CREATE TRIGGER sessions_start_ahead_guard BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.reh_227_stand_in()');
SELECT pg_temp.reh_shape('G8 a changed column shape aborts', 'm227_preflight', 'error=227 ABORTED: sessions.date, start_time, max_participants, status or is_recurring is not the shape%',
  'ALTER TABLE public.sessions ALTER COLUMN max_participants DROP NOT NULL');
SELECT pg_temp.reh_shape('G9 the post-check passes on the applied state', 'm227_postcheck', 'CHECK 2..500 validated; start-ahead trigger in place', 'SELECT 1');
SELECT pg_temp.reh_shape('G10 a disabled trigger fails the post-check', 'm227_postcheck', 'error=227 ABORTED: sessions_start_ahead_guard is not the enabled%',
  'ALTER TABLE public.sessions DISABLE TRIGGER sessions_start_ahead_guard');
SELECT pg_temp.reh_shape('G11 EXECUTE granted to authenticated fails the post-check', 'm227_postcheck', 'error=227 ABORTED: anon or authenticated can EXECUTE%',
  'GRANT EXECUTE ON FUNCTION public.sessions_start_ahead_guard() TO authenticated');
SELECT pg_temp.reh_shape('G12 a trigger on INSERT only fails the post-check', 'm227_postcheck', 'error=227 ABORTED: sessions_start_ahead_guard is not the enabled%',
  'DROP TRIGGER sessions_start_ahead_guard ON public.sessions; CREATE TRIGGER sessions_start_ahead_guard BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.sessions_start_ahead_guard()');

-- ── Result ─────────────────────────────────────────────────────────────────
CREATE TEMP TABLE reh_227_manifest (seq int PRIMARY KEY, arm text NOT NULL) ON COMMIT DROP;
INSERT INTO reh_227_manifest (seq, arm) VALUES
  (1, 'E0 ENV session_user and current_user'),
  (2, 'B1 before 227: a host inserts a session for 600 athletes'),
  (3, 'B2 before 227: a host inserts a session that started an hour ago'),
  (4, 'T0 the body did not commit (same transaction before and after)'),
  (5, 'A1 the CHECK is there, validated, 2..500'),
  (6, 'A2 the trigger is BEFORE INSERT OR UPDATE OF date, start_time, enabled'),
  (7, 'A3 the function is SECURITY INVOKER and no client role can EXECUTE it'),
  (8, 'C1 a host cannot insert 501 athletes'),
  (9, 'C2 a host inserts 500 athletes'),
  (10, 'C3 a host inserts 2 athletes'),
  (11, 'C4 a host cannot insert 1 athlete'),
  (12, 'C5 a host cannot raise an existing session to 501'),
  (13, 'C6 the service role cannot insert 501 either (a CHECK has no exemptions)'),
  (14, 'D1 a host cannot insert an active one-off that started an hour ago'),
  (15, 'D2 a host inserts one that started 5 minutes ago (the grace)'),
  (16, 'D3 a host inserts one an hour ahead in Bogota (4 hours behind if read as UTC)'),
  (17, 'D4 a host cannot insert one that started 11 minutes ago'),
  (18, 'X1 the service role inserts a session that happened yesterday (Moments past-session)'),
  (19, 'X2 a host inserts a recurring parent whose own start has passed'),
  (20, 'X3 a host edits the description of a session that already started'),
  (21, 'X4 a host saves a started session naming its date and start_time unchanged'),
  (22, 'X5 a host moves a cancelled session into the past (status is not active)'),
  (23, 'X6 a host inserts a cancelled row whose start has passed'),
  (24, 'U1 a host cannot move a future session to an hour ago'),
  (25, 'U2 a host moves a future session to another future time'),
  (26, 'U3 a host cannot move a started session to a different past time'),
  (27, 'G1 the applied state reads re-run'),
  (28, 'G2 nothing applied reads first run'),
  (29, 'G3 a row outside 2..500 aborts'),
  (30, 'G4 a different constraint under the name aborts'),
  (31, 'G5 the same constraint added NOT VALID reads re-run'),
  (32, 'G6 a different function body aborts'),
  (33, 'G7 a trigger of the name without the function aborts'),
  (34, 'G8 a changed column shape aborts'),
  (35, 'G9 the post-check passes on the applied state'),
  (36, 'G10 a disabled trigger fails the post-check'),
  (37, 'G11 EXECUTE granted to authenticated fails the post-check'),
  (38, 'G12 a trigger on INSERT only fails the post-check');

SELECT seq, arm, verdict, detail FROM reh_227 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_227;
SELECT CASE WHEN (SELECT array_agg(arm ORDER BY seq) FROM reh_227)
                 = (SELECT array_agg(arm ORDER BY seq) FROM reh_227_manifest)
            THEN 'manifest matches: every arm ran, in order' ELSE 'MANIFEST MISMATCH' END AS manifest;

-- The one result set for the transaction. Every row must read PASS. 38 of 38.

ROLLBACK;

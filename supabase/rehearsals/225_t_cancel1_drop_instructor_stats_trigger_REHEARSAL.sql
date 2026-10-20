-- 225_t_cancel1_drop_instructor_stats_trigger_REHEARSAL.sql. Dry run of 225. Applies nothing.
--
-- Run it with scripts/av-rehearse.sh, never by hand:
--
--   scripts/av-rehearse.sh 225_t_cancel1_drop_instructor_stats_trigger
--
-- The local stack carries the same two live-only objects as production: on
-- 2026-10-19 md5(prosrc) of update_instructor_stats() and of
-- protect_verified_instructor(), and md5 of the trigger definition, matched
-- production exactly.
--
-- PART M IS 225'S BODY, SPLICED VERBATIM (supabase/rehearsalBodyVerbatim.test.ts):
-- everything between the migration's own BEGIN and its "Record this migration
-- as applied" marker, guards and comments included, never retyped. Re-splice
-- after editing the migration. T0 checks the transaction id is the same after
-- the body as before it, so a COMMIT that slipped in is a FAIL row.
--
-- One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- FIXTURE (inside the transaction): two existing non-admin users (host H,
-- athlete P) and one admin (A); upcoming sessions hosted by H: S_full and
-- S_after with P confirmed, S_empty with no rows, S_other with P confirmed;
-- S_admin hosted by A with P confirmed.
--
-- ARMS
--   B   before 225: the failure reproduces (the host cannot cancel S_full) and
--       the narrow case passes (the host can cancel S_empty).
--   A   after 225: both objects are gone, the guard is still there and still
--       refuses, the host cancels S_after, the host's counters did not move,
--       an admin still cancels, an athlete still cannot cancel someone else's.
--   G   the shape check, called again against shapes built to fail, inside
--       subtransactions: each abort fires, the captured shape passes, and a
--       re-run reads 'absent'.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_225 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_225_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_225_before (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE reh_225_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;

-- Runs one statement as a role and returns its single text value or the error
-- (SQLSTATE and message). p_expect is a LIKE pattern. The result is recorded
-- only after RESET ROLE.
CREATE FUNCTION pg_temp.reh_case(p_arm text, p_actor text, p_expect text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_uid uuid;
  v_out text;
  v_got text;
BEGIN
  SELECT v INTO v_uid FROM reh_225_ids WHERE k = p_actor;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_uid::text, ''), true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql INTO v_out;
    EXECUTE 'RESET ROLE';
    v_got := coalesce(v_out, '<null>');
  EXCEPTION WHEN others THEN
    v_got := 'error=' || SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO reh_225 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got LIKE p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('actor=%s expected %s, got %s', p_actor, p_expect, v_got));
END $f$;

-- Builds a shape inside a subtransaction, calls the migration's own shape
-- check, records what it said, and rolls the shape back.
CREATE FUNCTION pg_temp.reh_shape(p_arm text, p_expect text, p_build text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_got text;
BEGIN
  BEGIN
    EXECUTE p_build;
    v_got := pg_temp.m225_shape();
    RAISE EXCEPTION 'reh_225 undo' USING ERRCODE = 'P0225';
  EXCEPTION
    WHEN SQLSTATE 'P0225' THEN NULL;
    WHEN others THEN v_got := 'error=' || SQLERRM;
  END;
  INSERT INTO reh_225 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got LIKE p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('expected %s, got %s', p_expect, coalesce(v_got, '<null>')));
END $f$;

INSERT INTO reh_225 (arm, verdict, detail)
SELECT 'E0 ENV session_user and current_user', 'PASS', format('session_user=%s current_user=%s', session_user, current_user);

-- ── F. Fixture ─────────────────────────────────────────────────────────────
DO $f$
DECLARE
  u uuid[];
  u_a uuid;
  s_full uuid; s_after uuid; s_empty uuid; s_other uuid; s_admin uuid;
BEGIN
  SELECT id INTO u_a FROM public.users WHERE is_admin AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT array_agg(id) INTO u FROM (
    SELECT id FROM public.users WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL
     ORDER BY created_at LIMIT 2) x;
  IF u_a IS NULL OR coalesce(cardinality(u), 0) < 2 THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need one admin and two non-admin users.';
  END IF;

  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u[1], 'Boxing', current_date + 3, '07:00', 60, 'Rehearsal 225 full', 10, 'active') RETURNING id INTO s_full;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u[1], 'Boxing', current_date + 4, '07:00', 60, 'Rehearsal 225 after', 10, 'active') RETURNING id INTO s_after;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u[1], 'Boxing', current_date + 5, '07:00', 60, 'Rehearsal 225 empty', 10, 'active') RETURNING id INTO s_empty;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u[1], 'Boxing', current_date + 6, '07:00', 60, 'Rehearsal 225 other', 10, 'active') RETURNING id INTO s_other;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (u_a, 'Boxing', current_date + 7, '07:00', 60, 'Rehearsal 225 admin', 10, 'active') RETURNING id INTO s_admin;

  INSERT INTO public.session_participants (session_id, user_id, status)
  SELECT s, u[2], 'confirmed' FROM unnest(ARRAY[s_full, s_after, s_other, s_admin]) s;

  INSERT INTO reh_225_ids VALUES ('H', u[1]), ('P', u[2]), ('A', u_a),
    ('S_full', s_full), ('S_after', s_after), ('S_empty', s_empty), ('S_other', s_other), ('S_admin', s_admin);
END $f$;

-- A cancel, as the app sends it: one UPDATE of the session row.
CREATE FUNCTION pg_temp.cancel_sql(p_session text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('UPDATE public.sessions SET status = %L WHERE id = %L RETURNING status', 'cancelled',
                (SELECT v FROM reh_225_ids WHERE k = p_session));
$f$;

-- ── B. Before 225 ──────────────────────────────────────────────────────────
SELECT pg_temp.reh_case('B1 before 225: the host cannot cancel a session with a participant row', 'H',
                        'error=42501 total_participants_served can only be changed by an admin',
                        pg_temp.cancel_sql('S_full'));
SELECT pg_temp.reh_case('B2 before 225: the host can cancel a session with no rows', 'H',
                        'cancelled', pg_temp.cancel_sql('S_empty'));

INSERT INTO reh_225_before
SELECT 'host_counters', format('%s/%s', sessions_completed, total_participants_served)
  FROM public.users WHERE id = (SELECT v FROM reh_225_ids WHERE k = 'H');

INSERT INTO reh_225_tx VALUES ('before', txid_current());

-- ══════════════════════════════════════════════════════════════════════════
-- PART M. 225's body, verbatim.
-- ══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.m225_shape() RETURNS text LANGUAGE plpgsql AS $shape$
DECLARE
  v_fn  regprocedure := to_regprocedure('public.update_instructor_stats()');
  v_trg record;
  v_other integer;
BEGIN
  SELECT t.tgtype, t.tgqual, t.tgattr, t.tgfoid, t.tgenabled INTO v_trg
    FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.sessions')
     AND t.tgname = 'on_session_status_change'
     AND NOT t.tgisinternal;

  IF v_fn IS NULL THEN
    IF v_trg.tgfoid IS NOT NULL THEN
      RAISE EXCEPTION '225 ABORTED: on_session_status_change exists but update_instructor_stats() does not.';
    END IF;
    RETURN 'absent';
  END IF;

  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM '60a20b272df22dd83400dfbd9444c3e3' THEN
    RAISE EXCEPTION '225 ABORTED: update_instructor_stats() is not the body captured on 2026-10-19; read it before dropping it.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '225 ABORTED: update_instructor_stats() is no longer SECURITY DEFINER; it changed since 2026-10-19.';
  END IF;

  SELECT count(*) INTO v_other
    FROM pg_trigger t
   WHERE t.tgfoid = v_fn AND NOT t.tgisinternal
     AND NOT (t.tgrelid = to_regclass('public.sessions') AND t.tgname = 'on_session_status_change');
  IF v_other > 0 THEN
    RAISE EXCEPTION '225 ABORTED: % other trigger(s) call update_instructor_stats(); dropping it would break them.', v_other;
  END IF;

  IF v_trg.tgfoid IS NULL THEN
    RETURN 'function only';
  END IF;

  -- tgtype 17 = ROW (1) + UPDATE (16): AFTER (no BEFORE bit 2), not INSERT,
  -- DELETE or TRUNCATE. No WHEN clause, no column list.
  IF v_trg.tgfoid <> v_fn OR v_trg.tgtype <> 17 OR v_trg.tgqual IS NOT NULL
     OR coalesce(array_length(v_trg.tgattr::int2[], 1), 0) <> 0 THEN
    RAISE EXCEPTION '225 ABORTED: on_session_status_change is not the AFTER UPDATE FOR EACH ROW trigger captured on 2026-10-19.';
  END IF;

  RETURN 'captured';
END $shape$;

DO $$
BEGIN
  RAISE NOTICE '225 pre-flight: %', pg_temp.m225_shape();
END $$;

DROP TRIGGER IF EXISTS on_session_status_change ON public.sessions;
DROP FUNCTION IF EXISTS public.update_instructor_stats();

DO $$
BEGIN
  IF pg_temp.m225_shape() <> 'absent' THEN
    RAISE EXCEPTION '225 ABORTED: update_instructor_stats() or on_session_status_change is still there after the drop.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = to_regclass('public.users')
                    AND t.tgname = 'protect_verified_instructor_trigger'
                    AND t.tgfoid = to_regprocedure('public.protect_verified_instructor()')
                    AND t.tgenabled <> 'D') THEN
    RAISE EXCEPTION '225 ABORTED: protect_verified_instructor_trigger is missing or disabled; 225 drops the stats trigger, never the guard.';
  END IF;
  RAISE NOTICE '225: on_session_status_change and update_instructor_stats() dropped; protect_verified_instructor unchanged.';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- After 225
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO reh_225 (arm, verdict, detail)
SELECT 'T0 the body did not commit (same transaction before and after)',
       CASE WHEN (SELECT v FROM reh_225_tx WHERE k = 'before') = txid_current() THEN 'PASS' ELSE 'FAIL' END,
       format('txid before=%s after=%s', (SELECT v FROM reh_225_tx WHERE k = 'before'), txid_current());

INSERT INTO reh_225 (arm, verdict, detail)
SELECT 'A1 on_session_status_change is gone',
       CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, format('triggers named on_session_status_change on sessions: %s', n)
  FROM (SELECT count(*) AS n FROM pg_trigger
         WHERE tgrelid = to_regclass('public.sessions') AND tgname = 'on_session_status_change' AND NOT tgisinternal) x;

INSERT INTO reh_225 (arm, verdict, detail)
SELECT 'A2 update_instructor_stats() is gone',
       CASE WHEN to_regprocedure('public.update_instructor_stats()') IS NULL THEN 'PASS' ELSE 'FAIL' END,
       format('to_regprocedure: %s', coalesce(to_regprocedure('public.update_instructor_stats()')::text, 'null'));

INSERT INTO reh_225 (arm, verdict, detail)
SELECT 'A3 the users guard trigger is still there and enabled',
       CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, format('enabled protect_verified_instructor_trigger rows: %s', n)
  FROM (SELECT count(*) AS n FROM pg_trigger
         WHERE tgrelid = to_regclass('public.users') AND tgname = 'protect_verified_instructor_trigger'
           AND tgfoid = to_regprocedure('public.protect_verified_instructor()') AND tgenabled <> 'D') x;

-- The guard reads auth.uid() only, so this runs as postgres with the host's
-- claims: no column grant can be what refuses it, only the guard.
DO $a4$
DECLARE
  v_got text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', (SELECT v FROM reh_225_ids WHERE k = 'H')::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM reh_225_ids WHERE k = 'H'), 'role', 'authenticated')::text, true);
    UPDATE public.users SET total_participants_served = total_participants_served + 1
     WHERE id = (SELECT v FROM reh_225_ids WHERE k = 'H');
    v_got := 'updated';
  EXCEPTION WHEN others THEN
    v_got := 'error=' || SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO reh_225 (arm, verdict, detail)
  VALUES ('A4 the guard still refuses a non-admin writing total_participants_served',
          CASE WHEN v_got = 'error=42501 total_participants_served can only be changed by an admin' THEN 'PASS' ELSE 'FAIL' END,
          v_got);
END $a4$;

SELECT pg_temp.reh_case('A5 after 225: the host cancels a session with a participant row', 'H',
                        'cancelled', pg_temp.cancel_sql('S_after'));

INSERT INTO reh_225 (arm, verdict, detail)
SELECT 'A6 the cancel left the host''s counters where they were',
       CASE WHEN now_v = (SELECT v FROM reh_225_before WHERE k = 'host_counters') THEN 'PASS' ELSE 'FAIL' END,
       format('before %s, after %s', (SELECT v FROM reh_225_before WHERE k = 'host_counters'), now_v)
  FROM (SELECT format('%s/%s', sessions_completed, total_participants_served) AS now_v
          FROM public.users WHERE id = (SELECT v FROM reh_225_ids WHERE k = 'H')) x;

SELECT pg_temp.reh_case('A7 an admin still cancels their own session', 'A',
                        'cancelled', pg_temp.cancel_sql('S_admin'));
SELECT pg_temp.reh_case('A8 an athlete still cannot cancel someone else''s session', 'P',
                        '<null>', pg_temp.cancel_sql('S_other'));

-- ── G. The shape check, against shapes built to fail ────────────────────────
-- The captured function, byte for byte (md5 60a20b272df22dd83400dfbd9444c3e3).
CREATE FUNCTION pg_temp.captured_fn(p_secdef boolean, p_extra text) RETURNS text LANGUAGE sql AS $f$
  SELECT format(
    'CREATE FUNCTION public.update_instructor_stats() RETURNS trigger LANGUAGE plpgsql %s SET search_path TO ''public'' AS %s',
    CASE WHEN p_secdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
    quote_literal(E'\nDECLARE\n  participant_count integer;\nBEGIN\n  IF NEW.status IS DISTINCT FROM OLD.status THEN\n    IF NEW.creator_id IS NOT NULL THEN\n      SELECT COUNT(*) INTO participant_count FROM public.session_participants WHERE session_id = NEW.id;\n      UPDATE public.users\n        SET sessions_completed = sessions_completed + 1,\n            total_participants_served = total_participants_served + participant_count\n        WHERE id = NEW.creator_id;\n    END IF;\n  END IF;\n  RETURN NEW;\nEND;\n' || p_extra));
$f$;

SELECT pg_temp.reh_shape('G1 the captured shape passes', 'captured',
  pg_temp.captured_fn(true, '') || '; CREATE TRIGGER on_session_status_change AFTER UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_instructor_stats()');
SELECT pg_temp.reh_shape('G2 a changed body aborts', 'error=225 ABORTED: update_instructor_stats() is not the body captured%',
  pg_temp.captured_fn(true, '-- changed') || '; CREATE TRIGGER on_session_status_change AFTER UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_instructor_stats()');
SELECT pg_temp.reh_shape('G3 a function that is not SECURITY DEFINER aborts', 'error=225 ABORTED: update_instructor_stats() is no longer SECURITY DEFINER%',
  pg_temp.captured_fn(false, '') || '; CREATE TRIGGER on_session_status_change AFTER UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_instructor_stats()');
SELECT pg_temp.reh_shape('G4 a BEFORE trigger aborts', 'error=225 ABORTED: on_session_status_change is not the AFTER UPDATE%',
  pg_temp.captured_fn(true, '') || '; CREATE TRIGGER on_session_status_change BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_instructor_stats()');
SELECT pg_temp.reh_shape('G5 a WHEN clause aborts', 'error=225 ABORTED: on_session_status_change is not the AFTER UPDATE%',
  pg_temp.captured_fn(true, '') || '; CREATE TRIGGER on_session_status_change AFTER UPDATE ON public.sessions FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.update_instructor_stats()');
SELECT pg_temp.reh_shape('G6 another trigger calling the function aborts', 'error=225 ABORTED: 1 other trigger(s) call update_instructor_stats()%',
  pg_temp.captured_fn(true, '') || '; CREATE TRIGGER on_session_status_change AFTER UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_instructor_stats(); CREATE TRIGGER reh_225_other AFTER UPDATE ON public.session_participants FOR EACH ROW EXECUTE FUNCTION public.update_instructor_stats()');
SELECT pg_temp.reh_shape('G7 the trigger without its function aborts', 'error=225 ABORTED: on_session_status_change exists but update_instructor_stats() does not.',
  'CREATE FUNCTION public.reh_225_stand_in() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$; CREATE TRIGGER on_session_status_change AFTER UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.reh_225_stand_in()');
SELECT pg_temp.reh_shape('G8 the function without its trigger reads function only', 'function only',
  pg_temp.captured_fn(true, ''));
SELECT pg_temp.reh_shape('G9 a re-run, both gone, reads absent', 'absent', 'SELECT 1');

-- ── Result ─────────────────────────────────────────────────────────────────
CREATE TEMP TABLE reh_225_manifest (seq int PRIMARY KEY, arm text NOT NULL) ON COMMIT DROP;
INSERT INTO reh_225_manifest (seq, arm) VALUES
  (1, 'E0 ENV session_user and current_user'),
  (2, 'B1 before 225: the host cannot cancel a session with a participant row'),
  (3, 'B2 before 225: the host can cancel a session with no rows'),
  (4, 'T0 the body did not commit (same transaction before and after)'),
  (5, 'A1 on_session_status_change is gone'),
  (6, 'A2 update_instructor_stats() is gone'),
  (7, 'A3 the users guard trigger is still there and enabled'),
  (8, 'A4 the guard still refuses a non-admin writing total_participants_served'),
  (9, 'A5 after 225: the host cancels a session with a participant row'),
  (10, 'A6 the cancel left the host''s counters where they were'),
  (11, 'A7 an admin still cancels their own session'),
  (12, 'A8 an athlete still cannot cancel someone else''s session'),
  (13, 'G1 the captured shape passes'),
  (14, 'G2 a changed body aborts'),
  (15, 'G3 a function that is not SECURITY DEFINER aborts'),
  (16, 'G4 a BEFORE trigger aborts'),
  (17, 'G5 a WHEN clause aborts'),
  (18, 'G6 another trigger calling the function aborts'),
  (19, 'G7 the trigger without its function aborts'),
  (20, 'G8 the function without its trigger reads function only'),
  (21, 'G9 a re-run, both gone, reads absent');

SELECT seq, arm, verdict, detail FROM reh_225 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_225;
SELECT CASE WHEN (SELECT array_agg(arm ORDER BY seq) FROM reh_225)
                 = (SELECT array_agg(arm ORDER BY seq) FROM reh_225_manifest)
            THEN 'manifest matches: every arm ran, in order' ELSE 'MANIFEST MISMATCH' END AS manifest;

-- The one result set for the transaction. Every row must read PASS. 21 of 21.

ROLLBACK;

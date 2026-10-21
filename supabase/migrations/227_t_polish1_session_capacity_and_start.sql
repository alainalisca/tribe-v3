-- 227_t_polish1_session_capacity_and_start.sql
--
-- T-POLISH1 PR 4: two session rules the browser checks, enforced where a
-- browser cannot skip them.
-- NOT APPLIED when written (2026-10-21). Safe on either side of the code that
-- merges with it (see ORDER).
--
-- WHY. sessions are inserted and updated straight from the browser (insertSession
-- and updateSessionAsHost run on the anon key with the host's JWT), so a rule
-- that lives only in the form is a suggestion. Production, read-only,
-- 2026-10-21: sessions has no CHECK on max_participants and nothing about time;
-- the form allowed 2 to 100,000 athletes and any time on today's date.
--
-- WHAT THIS CHANGES
--   1. CHECK sessions_max_participants_range: max_participants BETWEEN 2 AND 500.
--      Added NOT VALID, then VALIDATE, so a row outside the range is named by
--      the pre-flight instead of surfacing as a bare constraint error. Al set
--      the upper bound at 500 (run clubs and events go above 100). Production,
--      read-only, 2026-10-21: 471 rows, max_participants NOT NULL, min 4, max
--      100, none outside 2..500.
--   2. public.sessions_start_ahead_guard(), as the BEFORE INSERT OR UPDATE OF
--      date, start_time FOR EACH ROW trigger sessions_start_ahead_guard. It
--      refuses a row whose start, read as America/Bogota wall time, is more
--      than 10 minutes before now(), with message 'session_start_in_past' and
--      SQLSTATE 23514, when ALL of these hold:
--        * auth.uid() IS NOT NULL: a signed-in browser client. Service-role
--          writes carry no sub and pass: the Moments past-session route
--          (app/api/moments/past-session, which creates a session that already
--          happened, for its photos) and the recurring-sessions cron's child
--          inserts. So does SQL an operator runs.
--        * NEW.status = 'active'. A cancelled row is history, not an offer.
--        * NEW.is_recurring IS NOT TRUE. A recurring parent's own date goes stale
--          by design while the cron generates occurrences from it, and the edit
--          page keeps it editable (editGuards.isEditLocked).
--        * on UPDATE, date or start_time actually changed. The edit page sends
--          both on every save, so OF date, start_time alone would refuse a host
--          fixing the description of a session that started five minutes ago.
--      The 10 minutes are for the frozen training-now flow
--      (app/training-now/useTrainingNow.ts, components/trainingNow/
--      useTrainingNowForm.ts): it inserts a session starting "now" from the
--      device clock, truncated to the minute, so a slow network or a clock a
--      few minutes off must not refuse it. The form itself is stricter (the
--      start must be after now: lib/sessions/sessionFormRules.ts) and maps this
--      message back onto the time field, so a host never sees the raw text.
--      The function is SECURITY INVOKER, reads no table, and EXECUTE is revoked
--      from PUBLIC, anon and authenticated; a trigger fires regardless.
--
-- WHAT IT DOES NOT CHANGE: any row, any policy, any grant on sessions, any
-- other trigger. No column is added, so nothing in the code waits on this.
--
-- ORDER. Either order is safe. Before this runs, main's forms are the only
-- check (merged code holds 2..500 and a start ahead). If it runs before the
-- code merges, the form on main (2..100,000, no time check) can submit a value
-- this refuses; the host sees "No se pudo crear la sesión" with the raw message
-- until the code deploys. Applying after the merge avoids that window.
--
-- GUARDS. Pre-flight (pg_temp.m227_preflight): the five columns have the
-- shapes measured on 2026-10-21; America/Bogota and auth.uid() exist; no row is
-- outside 2..500; a constraint already named sessions_max_participants_range is
-- exactly this one; a function already named sessions_start_ahead_guard is
-- exactly this file's body (a re-run), nothing else; a trigger of that name
-- never exists without it. After (pg_temp.m227_postcheck): the constraint is
-- there and validated; the trigger is BEFORE INSERT OR UPDATE OF date,
-- start_time, FOR EACH ROW, enabled, calling this function; the function body
-- is this file's, SECURITY INVOKER, search_path public, with no EXECUTE for
-- PUBLIC, anon or authenticated. Both are temporary functions, so the
-- rehearsal can call them again against states built to fail and prove each
-- abort fires.

BEGIN;

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

-- ── Record this migration as applied
INSERT INTO public.migrations_applied (migration, note)
VALUES ('227_t_polish1_session_capacity_and_start',
        'T-POLISH1 PR 4: sessions.max_participants CHECK 2..500, and a browser-written active one-off session must start no more than 10 minutes in the past (America/Bogota)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

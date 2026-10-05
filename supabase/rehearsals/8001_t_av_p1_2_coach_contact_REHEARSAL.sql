-- 8001_t_av_p1_2_coach_contact_REHEARSAL.sql. Dry run of 8001. Applies nothing.
--
--   scripts/av-rehearse.sh 8001_t_av_p1_2_coach_contact
--
-- One transaction, ended by ROLLBACK; the runner strips 8001's own BEGIN and
-- COMMIT, and T0 proves the body did not commit. Every row must read PASS.
--
-- FIXTURE: coach C and coach C2 (instructors), athlete U, non-instructor N
-- (also an athlete), admin A; session S hosted by C and S2 hosted by C2.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;

CREATE FUNCTION pg_temp.reh_case(p_arm text, p_actor text, p_expect text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_uid uuid; v_out text; v_got text;
BEGIN
  IF p_actor <> 'anon' THEN SELECT v INTO v_uid FROM reh_ids WHERE k = p_actor; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', CASE WHEN p_actor = 'anon' THEN 'anon' ELSE 'authenticated' END)::text, true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_uid::text, ''), true);
    EXECUTE CASE WHEN p_actor = 'anon' THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
    EXECUTE p_sql INTO v_out;
    EXECUTE 'RESET ROLE';
    v_got := coalesce(v_out, '<null>');
  EXCEPTION WHEN others THEN v_got := 'error=' || SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO reh (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got = p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('actor=%s expected %s, got %s', p_actor, p_expect, v_got));
END $f$;

DO $f$
DECLARE u uuid[]; u_a uuid; s uuid; s2 uuid;
BEGIN
  SELECT id INTO u_a FROM public.users WHERE is_admin AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT array_agg(id) INTO u FROM (SELECT id FROM public.users
    WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 4) x;
  IF u_a IS NULL OR coalesce(cardinality(u), 0) < 4 THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need one admin and four non-admin users.';
  END IF;
  UPDATE public.users SET is_instructor = true WHERE id IN (u[1], u[2]);
  UPDATE public.users SET is_instructor = false WHERE id IN (u[3], u[4]);
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (u[1], 'Boxing', current_date + 1, '07:00', 60, 'Rehearsal 8001', 10) RETURNING id INTO s;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (u[2], 'Boxing', current_date + 1, '08:00', 60, 'Rehearsal 8001 b', 10) RETURNING id INTO s2;
  INSERT INTO reh_ids VALUES ('C', u[1]), ('C2', u[2]), ('U', u[3]), ('N', u[4]), ('A', u_a), ('S', s), ('S2', s2);
END $f$;

INSERT INTO reh_tx VALUES ('before', txid_current());
\i :body
INSERT INTO reh (arm, verdict, detail)
SELECT 'T0 the body did not commit', CASE WHEN (SELECT v FROM reh_tx) = txid_current() THEN 'PASS' ELSE 'FAIL' END,
       format('txid before=%s after=%s', (SELECT v FROM reh_tx), txid_current());

DO $c$
DECLARE
  id record;
  setw text := 'SELECT coalesce(public.av_set_whatsapp_contact(%L, %L)->>''error'', ''ok'')';
  opts text := 'SELECT public.av_coach_contact_options(%L)->>''whatsapp''';
  tap text := 'SELECT coalesce(public.av_coach_contact_tap(%L, %L, %L, %L)->>''error'', ''ok'')';
BEGIN
  SELECT (SELECT v FROM reh_ids WHERE k = 'C') c, (SELECT v FROM reh_ids WHERE k = 'C2') c2,
         (SELECT v FROM reh_ids WHERE k = 'S') s, (SELECT v FROM reh_ids WHERE k = 'S2') s2
    INTO id;

  -- Settings
  PERFORM pg_temp.reh_case('S1 instructor opts in with a number', 'C', 'ok', format(setw, true, '+573001112233'));
  PERFORM pg_temp.reh_case('C1 a non-instructor cannot save settings', 'N', 'not_instructor', format(setw, true, '+573001112233'));
  PERFORM pg_temp.reh_case('C2 a number not in E.164 is refused', 'C2', 'invalid_whatsapp', format(setw, true, '3001112233'));
  PERFORM pg_temp.reh_case('C3 opting in without a number is refused', 'C2', 'whatsapp_required', format(setw, true, NULL));
  PERFORM pg_temp.reh_case('C4 anon cannot save settings', 'anon', 'error=42501', format(setw, true, '+573001112233'));

  -- What a viewer gets
  PERFORM pg_temp.reh_case('S2 athlete sees the opted-in coach''s number', 'U', '+573001112233', format(opts, id.c));
  PERFORM pg_temp.reh_case('S3 no settings: no number, no button', 'U', '<null>', format(opts, id.c2));
  PERFORM pg_temp.reh_case('S4 opt out keeps the number saved', 'C', 'ok', format(setw, false, '+573001112233'));
  PERFORM pg_temp.reh_case('C5 opted out: no number, no button', 'U', '<null>', format(opts, id.c));
  PERFORM pg_temp.reh_case('S5 opt back in', 'C', 'ok', format(setw, true, '+573001112233'));
  PERFORM pg_temp.reh_case('C6 anon cannot read contact options', 'anon', 'error=42501', format(opts, id.c));

  -- Taps
  PERFORM pg_temp.reh_case('S6 athlete tap on the storefront is logged', 'U', 'ok', format(tap, id.c, 'whatsapp', 'storefront', NULL));
  PERFORM pg_temp.reh_case('S7 athlete tap on the coach''s session is logged', 'U', 'ok', format(tap, id.c, 'whatsapp', 'session', id.s));
  PERFORM pg_temp.reh_case('S8 a second tap is a second row (every tap)', 'N', 'ok', format(tap, id.c, 'whatsapp', 'storefront', NULL));
  PERFORM pg_temp.reh_case('C7 a session the coach does not host is refused', 'U', 'not_found', format(tap, id.c, 'whatsapp', 'session', id.s2));
  PERFORM pg_temp.reh_case('C8 a coach who did not opt in cannot be tapped', 'U', 'not_found', format(tap, id.c2, 'whatsapp', 'storefront', NULL));
  PERFORM pg_temp.reh_case('C9 a coach''s own tap is not a contact', 'C', 'own_profile', format(tap, id.c, 'whatsapp', 'storefront', NULL));
  PERFORM pg_temp.reh_case('C10 an unknown channel is refused', 'U', 'invalid_channel', format(tap, id.c, 'sms', 'storefront', NULL));
  PERFORM pg_temp.reh_case('C11 an unknown source is refused', 'U', 'invalid_source', format(tap, id.c, 'whatsapp', 'feed', NULL));
  PERFORM pg_temp.reh_case('C12 anon cannot tap', 'anon', 'error=42501', format(tap, id.c, 'whatsapp', 'storefront', NULL));

  -- Who reads the log
  PERFORM pg_temp.reh_case('S9 the coach reads their own log', 'C', '3', format('SELECT count(*)::text FROM public.coach_contact_log WHERE coach_id = %L', id.c));
  PERFORM pg_temp.reh_case('S10 an admin reads every log', 'A', '3', format('SELECT count(*)::text FROM public.coach_contact_log WHERE coach_id = %L', id.c));
  PERFORM pg_temp.reh_case('C13 another instructor reads none of it', 'C2', '0', format('SELECT count(*)::text FROM public.coach_contact_log WHERE coach_id = %L', id.c));
  PERFORM pg_temp.reh_case('C14 the athlete who tapped reads none of it', 'U', '0', 'SELECT count(*)::text FROM public.coach_contact_log');
  PERFORM pg_temp.reh_case('C15 anon cannot read the log', 'anon', 'error=42501', 'SELECT count(*)::text FROM public.coach_contact_log');
  PERFORM pg_temp.reh_case('C16 nobody inserts a log row directly', 'U', 'error=42501',
    format('WITH x AS (INSERT INTO public.coach_contact_log (coach_id, channel, source) VALUES (%L, ''whatsapp'', ''storefront'') RETURNING 1) SELECT count(*)::text FROM x', id.c));
  PERFORM pg_temp.reh_case('C17 the coach cannot delete their log', 'C', 'error=42501',
    format('WITH x AS (DELETE FROM public.coach_contact_log WHERE coach_id = %L RETURNING 1) SELECT count(*)::text FROM x', id.c));

  -- Who reads the settings
  PERFORM pg_temp.reh_case('S11 the coach reads their own settings', 'C', '1', 'SELECT count(*)::text FROM public.coach_contact_settings');
  PERFORM pg_temp.reh_case('C18 an athlete reads no settings row', 'U', '0', 'SELECT count(*)::text FROM public.coach_contact_settings');
  PERFORM pg_temp.reh_case('C19 the coach cannot write settings directly', 'C', 'error=42501',
    format('WITH x AS (UPDATE public.coach_contact_settings SET whatsapp_opt_in = true WHERE coach_id = %L RETURNING 1) SELECT count(*)::text FROM x', id.c));
  PERFORM pg_temp.reh_case('C20 anon cannot read settings', 'anon', 'error=42501', 'SELECT count(*)::text FROM public.coach_contact_settings');
END $c$;

INSERT INTO reh (arm, verdict, detail)
SELECT 'S12 the session tap row names the session; the storefront ones do not',
       CASE WHEN count(*) FILTER (WHERE source = 'session' AND session_id = (SELECT v FROM reh_ids WHERE k = 'S')) = 1
             AND count(*) FILTER (WHERE source = 'storefront' AND session_id IS NULL) = 2
             AND count(*) FILTER (WHERE contact_user_id = (SELECT v FROM reh_ids WHERE k = 'U')) = 2
            THEN 'PASS' ELSE 'FAIL' END,
       string_agg(source || ':' || (session_id IS NOT NULL), ' ')
  FROM public.coach_contact_log WHERE coach_id = (SELECT v FROM reh_ids WHERE k = 'C');

SELECT seq, arm, verdict, detail FROM reh ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh;

ROLLBACK;

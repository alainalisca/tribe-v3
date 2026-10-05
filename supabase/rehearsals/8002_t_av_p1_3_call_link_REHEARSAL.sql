-- 8002_t_av_p1_3_call_link_REHEARSAL.sql. Dry run of 8002 on top of 8001. Applies nothing.
--
--   scripts/av-rehearse.sh 8002_t_av_p1_3_call_link 8001_t_av_p1_2_coach_contact 8002_t_av_p1_3_call_link
--
-- One transaction, ended by ROLLBACK; the runner strips each migration's own
-- BEGIN and COMMIT, and T0 proves the bodies did not commit. Every row must
-- read PASS.
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
  VALUES (u[1], 'Boxing', current_date + 1, '07:00', 60, 'Rehearsal 8002', 10) RETURNING id INTO s;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (u[2], 'Boxing', current_date + 1, '08:00', 60, 'Rehearsal 8002 b', 10) RETURNING id INTO s2;
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
  setl text := 'SELECT coalesce(public.av_set_call_link(%L)->>''error'', ''ok'')';
  setw text := 'SELECT coalesce(public.av_set_whatsapp_contact(%L, %L)->>''error'', ''ok'')';
  opts text := 'SELECT public.av_coach_contact_options(%L)->>%L';
  tap text := 'SELECT coalesce(public.av_coach_contact_tap(%L, %L, %L, %L)->>''error'', ''ok'')';
BEGIN
  SELECT (SELECT v FROM reh_ids WHERE k = 'C') c, (SELECT v FROM reh_ids WHERE k = 'C2') c2,
         (SELECT v FROM reh_ids WHERE k = 'S') s
    INTO id;

  PERFORM pg_temp.reh_case('S1 instructor saves an https call link', 'C', 'ok', format(setl, 'https://calendly.com/salomon/llamada'));
  PERFORM pg_temp.reh_case('C1 http is refused', 'C', 'invalid_url', format(setl, 'http://calendly.com/salomon'));
  PERFORM pg_temp.reh_case('C2 javascript: is refused', 'C', 'invalid_url', format(setl, 'javascript:alert(1)'));
  PERFORM pg_temp.reh_case('C3 a URL with a space is refused', 'C', 'invalid_url', format(setl, 'https://x.co/a b'));
  PERFORM pg_temp.reh_case('C4 longer than 500 characters is refused', 'C', 'invalid_url', format(setl, 'https://x.co/' || repeat('a', 500)));
  PERFORM pg_temp.reh_case('C5 a non-instructor cannot save a link', 'N', 'not_instructor', format(setl, 'https://calendly.com/n'));
  PERFORM pg_temp.reh_case('C6 anon cannot save a link', 'anon', 'error=42501', format(setl, 'https://calendly.com/n'));

  PERFORM pg_temp.reh_case('S2 a viewer gets the link', 'U', 'https://calendly.com/salomon/llamada', format(opts, id.c, 'call_link'));
  PERFORM pg_temp.reh_case('S3 the link alone shows no WhatsApp button', 'U', '<null>', format(opts, id.c, 'whatsapp'));
  PERFORM pg_temp.reh_case('S4 saving WhatsApp later keeps the link', 'C', 'ok', format(setw, true, '+573001112233'));
  PERFORM pg_temp.reh_case('S5 link still there after the WhatsApp save', 'U', 'https://calendly.com/salomon/llamada', format(opts, id.c, 'call_link'));
  PERFORM pg_temp.reh_case('S6 a call link tap on the storefront is logged', 'U', 'ok', format(tap, id.c, 'call_link', 'storefront', NULL));
  PERFORM pg_temp.reh_case('C7 a call link tap from a session is refused', 'U', 'invalid_source', format(tap, id.c, 'call_link', 'session', id.s));
  PERFORM pg_temp.reh_case('C8 a coach with no link cannot be tapped for one', 'U', 'not_found', format(tap, id.c2, 'call_link', 'storefront', NULL));
  PERFORM pg_temp.reh_case('S7 WhatsApp taps still work', 'U', 'ok', format(tap, id.c, 'whatsapp', 'session', id.s));
  PERFORM pg_temp.reh_case('C9 own call link tap is not a contact', 'C', 'own_profile', format(tap, id.c, 'call_link', 'storefront', NULL));
  PERFORM pg_temp.reh_case('S8 saving an empty link removes it', 'C', 'ok', format(setl, '  '));
  PERFORM pg_temp.reh_case('S9 removed link: no button', 'U', '<null>', format(opts, id.c, 'call_link'));
  PERFORM pg_temp.reh_case('S11 saving the link leaves WhatsApp switched on', 'U', '+573001112233', format(opts, id.c, 'whatsapp'));
  PERFORM pg_temp.reh_case('C10 removed link: tap refused', 'U', 'not_found', format(tap, id.c, 'call_link', 'storefront', NULL));
  PERFORM pg_temp.reh_case('C11 the coach still cannot write settings directly', 'C', 'error=42501',
    format('WITH x AS (UPDATE public.coach_contact_settings SET call_link_url = %L WHERE coach_id = %L RETURNING 1) SELECT count(*)::text FROM x', 'https://evil.example', id.c));
  PERFORM pg_temp.reh_case('C12 another instructor reads none of the log', 'C2', '0',
    format('SELECT count(*)::text FROM public.coach_contact_log WHERE coach_id = %L', id.c));
END $c$;

DO $k$
DECLARE v_err text;
BEGIN
  BEGIN
    INSERT INTO public.coach_contact_log (coach_id, channel, source) VALUES ((SELECT v FROM reh_ids WHERE k = 'C'), 'sms', 'storefront');
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh (arm, verdict, detail)
  VALUES ('K1 the log refuses an unknown channel even from a privileged writer', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
  BEGIN
    UPDATE public.coach_contact_settings SET call_link_url = 'javascript:alert(1)' WHERE coach_id = (SELECT v FROM reh_ids WHERE k = 'C');
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh (arm, verdict, detail)
  VALUES ('K2 the column refuses a non-https link even from a privileged writer', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
END $k$;

INSERT INTO reh (arm, verdict, detail)
SELECT 'S10 one call_link row and one whatsapp row were logged',
       CASE WHEN count(*) FILTER (WHERE channel = 'call_link' AND source = 'storefront') = 1
             AND count(*) FILTER (WHERE channel = 'whatsapp') = 1 THEN 'PASS' ELSE 'FAIL' END,
       string_agg(channel || '/' || source, ' ')
  FROM public.coach_contact_log WHERE coach_id = (SELECT v FROM reh_ids WHERE k = 'C');

SELECT seq, arm, verdict, detail FROM reh ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh;

ROLLBACK;

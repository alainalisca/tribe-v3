-- 8004_t_av_p1_5_first_timer_REHEARSAL.sql. Dry run of 8004 on top of 8000 to 8003. Applies nothing.
--
--   scripts/av-rehearse.sh 8004_t_av_p1_5_first_timer 8000_t_av2_canonical_attendance \
--     8001_t_av_p1_2_coach_contact 8002_t_av_p1_3_call_link 8003_t_av_p1_4_coach_card 8004_t_av_p1_5_first_timer
--
-- One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- Coach K (instructor, owns a partner) and coach K2. People:
--   NEW    never trained with anyone                         -> sees the block
--   REG    attended one of K's sessions                     -> does not
--   NOSHOW joined K's session, marked no_show               -> sees it (not a regular)
--   PASS   Pass show-up at K's partner                       -> does not
--   OTHER  attended K2's session, never K's                 -> sees it on K's session
--   NONI   a non-instructor, for the setter refusal

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

INSERT INTO reh_tx VALUES ('before', txid_current());
\i :body
INSERT INTO reh (arm, verdict, detail)
SELECT 'T0 the bodies did not commit', CASE WHEN (SELECT v FROM reh_tx) = txid_current() THEN 'PASS' ELSE 'FAIL' END,
       format('txid before=%s after=%s', (SELECT v FROM reh_tx), txid_current());

DO $f$
DECLARE
  u uuid[];
  k uuid; k2 uuid; nw uuid; reg uuid; ns uuid; ps uuid; oth uuid; noni uuid;
  partner uuid; s uuid; s_old uuid; s_k2 uuid;
BEGIN
  SELECT array_agg(id) INTO u FROM (SELECT id FROM public.users
    WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 8) x;
  IF coalesce(cardinality(u), 0) < 8 THEN RAISE EXCEPTION 'REHEARSAL ABORTED: need eight non-admin users.'; END IF;
  k := u[1]; k2 := u[2]; nw := u[3]; reg := u[4]; ns := u[5]; ps := u[6]; oth := u[7]; noni := u[8];
  UPDATE public.users SET is_instructor = (id IN (k, k2)) WHERE id = ANY (u);
  UPDATE public.users SET name = 'Salomón Restrepo' WHERE id = k;

  INSERT INTO public.featured_partners (business_name, slug, user_id) VALUES ('Rehearsal 8004 Gym', 'rehearsal-8004-gym', k)
  RETURNING id INTO partner;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (k, 'Boxing', current_date + 3, '07:00', 60, 'R8004', 20) RETURNING id INTO s;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (k, 'Boxing', current_date - 10, '07:00', 60, 'R8004 old', 20) RETURNING id INTO s_old;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (k2, 'Yoga', current_date - 10, '07:00', 60, 'R8004 k2', 20) RETURNING id INTO s_k2;

  INSERT INTO public.session_participants (session_id, user_id, status) VALUES
    (s_old, reg, 'confirmed'), (s_old, ns, 'confirmed'), (s_k2, oth, 'confirmed');
  INSERT INTO public.session_attendance (session_id, user_id, status, attended) VALUES
    (s_old, reg, 'attended', true), (s_old, ns, 'no_show', false), (s_k2, oth, 'attended', true);
  INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text, tribe_user_id, attended_at)
  VALUES ('rehearsal-8004-gym', partner, 'Pase Tester', '+573000000002', 'pass@example.test', 'RE-HRS9',
          'Acepto que me contacten sobre mi clase.', ps, now() - interval '5 days');

  INSERT INTO reh_ids VALUES ('K', k), ('K2', k2), ('NEW', nw), ('REG', reg), ('NOSHOW', ns), ('PASS', ps),
    ('OTHER', oth), ('NONI', noni), ('S', s), ('S_K2', s_k2);
END $f$;

DO $c$
DECLARE
  id record;
  setx text := 'SELECT coalesce(public.av_set_first_timer_text(%L)->>''error'', ''ok'')';
  shw text := 'SELECT public.av_first_timer_block(%L)->>''show''';
BEGIN
  SELECT (SELECT v FROM reh_ids WHERE k = 'S') s, (SELECT v FROM reh_ids WHERE k = 'S_K2') s_k2 INTO id;

  PERFORM pg_temp.reh_case('S1 coach saves a first-timer text', 'K', 'ok', format(setx, 'Llega 10 minutos antes y trae agua. Pregunta por Salomón en la entrada.'));
  PERFORM pg_temp.reh_case('C1 a non-instructor cannot save one', 'NONI', 'not_instructor', format(setx, 'hola'));
  PERFORM pg_temp.reh_case('C2 more than 600 characters is refused', 'K', 'too_long', format(setx, repeat('a', 601)));
  PERFORM pg_temp.reh_case('C3 anon cannot save one', 'anon', 'error=42501', format(setx, 'hola'));

  PERFORM pg_temp.reh_case('S2 someone new sees the block', 'NEW', 'true', format(shw, id.s));
  PERFORM pg_temp.reh_case('S3 with the coach''s first name and text', 'NEW',
    '{"show": true, "text": "Llega 10 minutos antes y trae agua. Pregunta por Salomón en la entrada.", "coach_first_name": "Salomón"}',
    format('SELECT public.av_first_timer_block(%L)::text', id.s));
  PERFORM pg_temp.reh_case('C4 a regular (attended once) does not', 'REG', 'false', format(shw, id.s));
  PERFORM pg_temp.reh_case('S4 a no-show is still a first-timer', 'NOSHOW', 'true', format(shw, id.s));
  PERFORM pg_temp.reh_case('C5 a Pass show-up at the coach''s partner counts as having been', 'PASS', 'false', format(shw, id.s));
  PERFORM pg_temp.reh_case('S5 training with another coach does not count', 'OTHER', 'true', format(shw, id.s));
  PERFORM pg_temp.reh_case('C6 the coach never sees it on their own session', 'K', 'false', format(shw, id.s));
  PERFORM pg_temp.reh_case('C7 a coach with no text shows nothing', 'NEW', 'false', format(shw, id.s_k2));
  PERFORM pg_temp.reh_case('C8 anon cannot read it', 'anon', 'error=42501', format(shw, id.s));
  PERFORM pg_temp.reh_case('C9 an unknown session shows nothing', 'NEW', 'false', format(shw, gen_random_uuid()));
  PERFORM pg_temp.reh_case('C10 the answer names nobody but the coach: exactly three keys', 'NEW', 'coach_first_name,show,text',
    format('SELECT string_agg(k, '','' ORDER BY k) FROM jsonb_object_keys(public.av_first_timer_block(%L)) k', id.s));
  PERFORM pg_temp.reh_case('S6 clearing the text', 'K', 'ok', format(setx, '   '));
  PERFORM pg_temp.reh_case('C11 cleared: nobody sees it', 'NEW', 'false', format(shw, id.s));
END $c$;

SELECT seq, arm, verdict, detail FROM reh ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh;

ROLLBACK;

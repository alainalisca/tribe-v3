-- 8003_t_av_p1_4_coach_card_REHEARSAL.sql. Dry run of 8003 on top of 8000 to 8002. Applies nothing.
--
--   scripts/av-rehearse.sh 8003_t_av_p1_4_coach_card 8000_t_av2_canonical_attendance \
--     8001_t_av_p1_2_coach_contact 8002_t_av_p1_3_call_link 8003_t_av_p1_4_coach_card
--
-- One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- THE MONTH IS MAY 2030, fixed, so the arms do not depend on today's date.
-- Coach K (instructor) owns a partner; coach K2 is another instructor. People:
--   Ana    taps K's WhatsApp May 10, joins May 11, attended May 12 and May 20
--            -> contact, first visit, came back (8 days)
--   Bruno  joined K's session March 1, taps May 13, attended Apr 20 and May 5
--            -> NOT a May contact (first touch March); April first visit, came back
--   Carla  starts a DM with K May 11; marked no_show May 12
--            -> contact; no visit
--   Dani   K starts a DM with Dani May 12
--            -> NOT a contact (the coach started it)
--   Eva    claims a Pass at K's partner May 14, attended_at May 15; attended June 20
--            -> contact, first visit; June 20 is day 36, so NOT came back
--   Feli   first join of K's session May 25; attended May 28 and June 27
--            -> contact, first visit, came back (day 30, the edge)
--   K      a log row and a join row for himself -> never counted
--   K2     Ana taps K2 May 10 -> K2's contact, not K's

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
  k uuid; k2 uuid; ana uuid; bruno uuid; carla uuid; dani uuid; eva uuid; feli uuid; nonc uuid;
  partner uuid;
  conv uuid;
  s_mar01 uuid; s_apr20 uuid; s_may05 uuid; s_may12 uuid; s_may20 uuid; s_may28 uuid; s_jun20 uuid; s_jun27 uuid;
BEGIN
  SELECT array_agg(id) INTO u FROM (SELECT id FROM public.users
    WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 9) x;
  IF coalesce(cardinality(u), 0) < 9 THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need nine non-admin users.';
  END IF;
  k := u[1]; k2 := u[2]; ana := u[3]; bruno := u[4]; carla := u[5]; dani := u[6]; eva := u[7]; feli := u[8]; nonc := u[9];
  UPDATE public.users SET is_instructor = (id IN (k, k2)) WHERE id = ANY (u);
  UPDATE public.users SET name = v.n FROM (VALUES (ana, 'Ana Torres'), (bruno, 'Bruno Díaz'), (carla, 'Carla Ruiz'),
    (dani, 'Dani Mesa'), (eva, 'Eva Gil'), (feli, 'Feli Ríos'), (k, 'Salomón K')) v(id, n) WHERE users.id = v.id;

  INSERT INTO public.featured_partners (business_name, slug, user_id) VALUES ('Rehearsal 8003 Gym', 'rehearsal-8003-gym', k)
  RETURNING id INTO partner;

  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-03-01', '07:00', 60, 'R8003', 20) RETURNING id INTO s_mar01;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-04-20', '07:00', 60, 'R8003', 20) RETURNING id INTO s_apr20;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-05-05', '07:00', 60, 'R8003', 20) RETURNING id INTO s_may05;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-05-12', '07:00', 60, 'R8003', 20) RETURNING id INTO s_may12;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-05-20', '07:00', 60, 'R8003', 20) RETURNING id INTO s_may20;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-05-28', '07:00', 60, 'R8003', 20) RETURNING id INTO s_may28;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-06-20', '07:00', 60, 'R8003', 20) RETURNING id INTO s_jun20;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants) VALUES
    (k, 'Boxing', '2030-06-27', '07:00', 60, 'R8003', 20) RETURNING id INTO s_jun27;

  -- Joins (joined_at is the touch time).
  INSERT INTO public.session_participants (session_id, user_id, status, joined_at) VALUES
    (s_mar01, bruno, 'confirmed', '2030-03-01 06:00-05'),
    (s_may12, ana,   'confirmed', '2030-05-11 09:00-05'),
    (s_may12, carla, 'confirmed', '2030-05-11 10:00-05'),
    (s_may28, feli,  'confirmed', '2030-05-25 09:00-05'),
    (s_may12, k,     'confirmed', '2030-05-01 09:00-05');

  -- Taps (written as the definer would; the tap function itself is 8001's rehearsal).
  INSERT INTO public.coach_contact_log (coach_id, contact_user_id, channel, source, created_at) VALUES
    (k,  ana,   'whatsapp', 'storefront', '2030-05-10 08:00-05'),
    (k,  bruno, 'whatsapp', 'storefront', '2030-05-13 08:00-05'),
    (k,  k,     'whatsapp', 'storefront', '2030-05-02 08:00-05'),
    (k2, ana,   'whatsapp', 'storefront', '2030-05-10 08:00-05');

  -- DMs. Triggers off for these inserts only: chat_messages carries a webhook
  -- to the production URL. It could not fire from a rolled-back transaction
  -- anyway; this keeps it from even being queued.
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.conversations (type, created_at) VALUES ('direct', '2030-05-11 11:00-05') RETURNING id INTO conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv, k), (conv, carla);
  INSERT INTO public.chat_messages (conversation_id, user_id, message, created_at) VALUES
    (conv, carla, 'Hola', '2030-05-11 11:00-05'), (conv, k, 'Hola Carla', '2030-05-11 12:00-05');
  INSERT INTO public.conversations (type, created_at) VALUES ('direct', '2030-05-12 11:00-05') RETURNING id INTO conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv, k), (conv, dani);
  INSERT INTO public.chat_messages (conversation_id, user_id, message, created_at) VALUES
    (conv, k, 'Hola Dani', '2030-05-12 11:00-05'), (conv, dani, 'Hola', '2030-05-12 12:00-05');
  SET LOCAL session_replication_role = origin;

  -- Pass claim at K's partner, attended.
  INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text, tribe_user_id,
                                 created_at, attended_at)
  VALUES ('rehearsal-8003-gym', partner, 'Eva Gil', '+573000000001', 'eva@example.test', 'RE-HRS8', 'Acepto que me contacten sobre mi clase.', eva,
          '2030-05-14 10:00-05', '2030-05-15 18:00-05');

  -- Confirmed visits (status attended), one no-show.
  INSERT INTO public.session_attendance (session_id, user_id, status, attended) VALUES
    (s_may12, ana,   'attended', true), (s_may20, ana,  'attended', true),
    (s_apr20, bruno, 'attended', true), (s_may05, bruno, 'attended', true),
    (s_may12, carla, 'no_show',  false),
    (s_jun20, eva,   'attended', true),
    (s_may28, feli,  'attended', true), (s_jun27, feli, 'attended', true);

  INSERT INTO reh_ids VALUES ('K', k), ('K2', k2), ('ANA', ana), ('NONC', nonc);
END $f$;

DO $c$
DECLARE
  q text := 'SELECT public.av_coach_tribe_brought(%L)::text';
  part text := 'SELECT (public.av_coach_tribe_brought(%L)->%L)::text';
BEGIN
  PERFORM pg_temp.reh_case('S1 May contacts: Ana, Carla, Eva, Feli (not Bruno, not Dani, not K)', 'K',
    '{"count": 4, "names": ["Ana", "Carla", "Eva", "Feli"]}', format(part, '2030-05-01', 'contacts'));
  PERFORM pg_temp.reh_case('S2 May first visits: Ana, Eva (Pass), Feli (not Bruno, not Carla)', 'K',
    '{"count": 3, "names": ["Ana", "Eva", "Feli"]}', format(part, '2030-05-01', 'first_visits'));
  PERFORM pg_temp.reh_case('S3 May came back: Ana (day 8), Feli (day 30); not Eva (day 36)', 'K',
    '{"count": 2, "names": ["Ana", "Feli"]}', format(part, '2030-05-01', 'came_back'));
  PERFORM pg_temp.reh_case('S4 any day of the month selects that month', 'K', '"2030-05"', format(part, '2030-05-17', 'month'));
  PERFORM pg_temp.reh_case('S5 April: Bruno''s first visit, and he came back May 5', 'K',
    '{"count": 1, "names": ["Bruno"]}', format(part, '2030-04-01', 'came_back'));
  PERFORM pg_temp.reh_case('S6 April contacts: none (Bruno''s first touch was March)', 'K',
    '{"count": 0, "names": []}', format(part, '2030-04-01', 'contacts'));
  PERFORM pg_temp.reh_case('S7 another coach sees only their own: Ana tapped K2', 'K2',
    '{"count": 1, "names": ["Ana"]}', format(part, '2030-05-01', 'contacts'));
  PERFORM pg_temp.reh_case('C1 another coach sees none of K''s first visits', 'K2',
    '{"count": 0, "names": []}', format(part, '2030-05-01', 'first_visits'));
  PERFORM pg_temp.reh_case('C2 a non-instructor gets nothing', 'NONC', 'not_instructor',
    format('SELECT public.av_coach_tribe_brought(%L)->>''error''', '2030-05-01'));
  PERFORM pg_temp.reh_case('C3 anon cannot run it', 'anon', 'error=42501', format(q, '2030-05-01'));
END $c$;

-- It writes nothing: run it as K and count every table it reads, before and after.
DO $w$
DECLARE before text; after text; v_res jsonb;
BEGIN
  SELECT concat_ws(',', (SELECT count(*) FROM public.coach_contact_log), (SELECT count(*) FROM public.session_attendance),
                   (SELECT count(*) FROM public.pass_leads), (SELECT count(*) FROM public.session_participants),
                   (SELECT count(*) FROM public.chat_messages), (SELECT max(updated_at) FROM public.users)) INTO before;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM reh_ids WHERE k = 'K'), 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT v FROM reh_ids WHERE k = 'K')::text, true);
  SET LOCAL ROLE authenticated;
  v_res := public.av_coach_tribe_brought('2030-05-01');
  RESET ROLE;
  SELECT concat_ws(',', (SELECT count(*) FROM public.coach_contact_log), (SELECT count(*) FROM public.session_attendance),
                   (SELECT count(*) FROM public.pass_leads), (SELECT count(*) FROM public.session_participants),
                   (SELECT count(*) FROM public.chat_messages), (SELECT max(updated_at) FROM public.users)) INTO after;
  INSERT INTO reh (arm, verdict, detail)
  VALUES ('S8 read only: every table it reads is unchanged by a call', CASE WHEN before = after AND v_res->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END,
          format('before %s / after %s', before, after));
END $w$;

SELECT seq, arm, verdict, detail FROM reh ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh;

ROLLBACK;

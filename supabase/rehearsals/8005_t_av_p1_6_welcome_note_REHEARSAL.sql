-- 8005_t_av_p1_6_welcome_note_REHEARSAL.sql. Dry run of 8005 on top of 8000 to 8004. Applies nothing.
--
--   scripts/av-rehearse.sh 8005_t_av_p1_6_welcome_note 8000_t_av2_canonical_attendance \
--     8001_t_av_p1_2_coach_contact 8002_t_av_p1_3_call_link 8003_t_av_p1_4_coach_card \
--     8004_t_av_p1_5_first_timer 8005_t_av_p1_6_welcome_note
--
-- Needs 8209 (av_notification_log, av_push_allowed), which the local stack
-- already has. One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- Coach K (instructor, owns a partner, writes a note) and K2 (no note). People:
--   N1      first confirmed join with K                      -> welcomed, push
--   N2      pending request on K's session                    -> not joined yet
--   REG     attended K's earlier session (no join row left)   -> already known
--   PRE     joined another of K's sessions before             -> already known
--   CAP1    already had a T-AV push in the last day           -> in-app only
--   CAP3    already had three T-AV pushes this week           -> in-app only
--   N3      first join, on K2's session (no note)             -> nothing
--   PASSU   claims a Pass at K's partner, signed in           -> welcomed (service role)
--   PASSKN  claims a Pass, but joined K's session before      -> already known

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;

-- Actor 'service' runs as service_role with no user; 'anon' as anon; any
-- other name as that fixture user, authenticated.
CREATE FUNCTION pg_temp.reh_case(p_arm text, p_actor text, p_expect text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_uid uuid; v_out text; v_got text;
BEGIN
  IF p_actor NOT IN ('anon', 'service') THEN SELECT v INTO v_uid FROM reh_ids WHERE k = p_actor; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', CASE p_actor WHEN 'anon' THEN 'anon' WHEN 'service' THEN 'service_role' ELSE 'authenticated' END)::text, true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_uid::text, ''), true);
    EXECUTE CASE p_actor WHEN 'anon' THEN 'SET LOCAL ROLE anon' WHEN 'service' THEN 'SET LOCAL ROLE service_role'
                         ELSE 'SET LOCAL ROLE authenticated' END;
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
  u uuid[]; a uuid;
  k uuid; k2 uuid; n1 uuid; n2 uuid; reg uuid; pre uuid; cap1 uuid; cap3 uuid; n3 uuid;
  partner uuid; s1 uuid; s_old uuid; s_other uuid; s_k2 uuid; lead_u uuid; lead_kn uuid;
BEGIN
  SELECT id INTO a FROM public.users WHERE is_admin AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT array_agg(id) INTO u FROM (SELECT id FROM public.users
    WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 9) x;
  IF a IS NULL OR coalesce(cardinality(u), 0) < 9 THEN RAISE EXCEPTION 'REHEARSAL ABORTED: need an admin and nine non-admin users.'; END IF;
  k := u[1]; k2 := u[2]; n1 := u[3]; n2 := u[4]; reg := u[5]; pre := u[6]; cap1 := u[7]; cap3 := u[8]; n3 := u[9];
  UPDATE public.users SET is_instructor = (id IN (k, k2)) WHERE id = ANY (u);
  UPDATE public.users SET name = 'Salomón Restrepo' WHERE id = k;

  INSERT INTO public.featured_partners (business_name, slug, user_id) VALUES ('Rehearsal 8005 Gym', 'rehearsal-8005-gym', k)
  RETURNING id INTO partner;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (k, 'Boxing', current_date + 2, '07:00', 60, 'R8005', 30) RETURNING id INTO s1;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (k, 'Boxing', current_date - 20, '07:00', 60, 'R8005 old', 30) RETURNING id INTO s_old;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (k, 'Boxing', current_date - 5, '07:00', 60, 'R8005 other', 30) RETURNING id INTO s_other;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (k2, 'Yoga', current_date + 2, '08:00', 60, 'R8005 k2', 30) RETURNING id INTO s_k2;

  INSERT INTO public.session_participants (session_id, user_id, status) VALUES
    (s1, n1, 'confirmed'), (s1, n2, 'pending'), (s1, reg, 'confirmed'), (s1, pre, 'confirmed'),
    (s1, cap1, 'confirmed'), (s1, cap3, 'confirmed'), (s1, k, 'confirmed'), (s_k2, n3, 'confirmed'),
    (s_other, pre, 'confirmed'), (s_other, u[2], 'confirmed');
  -- REG is known ONLY through attendance: their join row on s_old is gone, as
  -- after leaving a session. (The first mutation run had REG joined too, so
  -- the attendance check was never needed and its removal went unseen.)
  INSERT INTO public.session_attendance (session_id, user_id, status, attended) VALUES (s_old, reg, 'attended', true);

  -- Earlier T-AV pushes for the cap people, recorded as welcomes from other coaches.
  INSERT INTO public.av_notification_log (event, recipient_id, push, coach_id, created_at) VALUES
    ('welcome', cap1, true, k2, now() - interval '2 hours'),
    ('welcome', cap3, true, k2, now() - interval '3 days'),
    ('welcome', cap3, true, a,  now() - interval '4 days'),
    ('welcome', cap3, true, n3, now() - interval '5 days');

  -- Pass leads at K's partner. PASSU is n2's account? No: two fresh claimants.
  INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text)
  VALUES ('rehearsal-8005-gym', partner, 'Pase Uno', '+573000000003', 'p1@example.test', 'RE-HRSA',
          'Acepto que me contacten sobre mi clase.') RETURNING id INTO lead_u;
  INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text)
  VALUES ('rehearsal-8005-gym', partner, 'Pase Dos', '+573000000004', 'p2@example.test', 'RE-HRSB',
          'Acepto que me contacten sobre mi clase.') RETURNING id INTO lead_kn;

  INSERT INTO reh_ids VALUES ('K', k), ('K2', k2), ('N1', n1), ('N2', n2), ('REG', reg), ('PRE', pre),
    ('CAP1', cap1), ('CAP3', cap3), ('N3', n3), ('S1', s1), ('S_K2', s_k2),
    -- PASSU is the admin account (no relation to K); PASSKN is PRE (joined K before).
    ('PASSU', a), ('PASSKN', pre), ('LEAD_U', lead_u), ('LEAD_KN', lead_kn);
END $f$;

DO $c$
DECLARE
  id record;
  setn text := 'SELECT coalesce(public.av_set_welcome_note(%L)->>''error'', ''ok'')';
  j text := 'SELECT public.av_claim_welcome_for_join(%L)::text';
  jn text := 'SELECT jsonb_array_length(public.av_claim_welcome_for_join(%L)->''notifications'')::text';
  jp text := 'SELECT public.av_claim_welcome_for_join(%L)->''notifications''->0->>''push''';
  pn text := 'SELECT jsonb_array_length(public.av_claim_welcome_for_pass(%L, %L)->''notifications'')::text';
BEGIN
  SELECT (SELECT v FROM reh_ids WHERE k = 'S1') s1, (SELECT v FROM reh_ids WHERE k = 'S_K2') s_k2,
         (SELECT v FROM reh_ids WHERE k = 'LEAD_U') lead_u, (SELECT v FROM reh_ids WHERE k = 'LEAD_KN') lead_kn,
         (SELECT v FROM reh_ids WHERE k = 'PASSU') passu, (SELECT v FROM reh_ids WHERE k = 'PASSKN') passkn
    INTO id;

  PERFORM pg_temp.reh_case('S1 the coach writes the note', 'K', 'ok', format(setn, '¡Bienvenido! Nos vemos en clase.'));
  PERFORM pg_temp.reh_case('C1 a non-instructor cannot', 'N1', 'not_instructor', format(setn, 'hola'));
  PERFORM pg_temp.reh_case('C2 more than 500 characters is refused', 'K', 'too_long', format(setn, repeat('a', 501)));

  PERFORM pg_temp.reh_case('S2 a first confirmed join is welcomed, with a push', 'N1',
    '{"success": true, "notifications": [{"note": "¡Bienvenido! Nos vemos en clase.", "push": true, "event": "welcome", "coach_id": "'
      || (SELECT v FROM reh_ids WHERE k = 'K') || '", "language": ' || coalesce(to_jsonb((SELECT u.preferred_language FROM public.users u WHERE u.id = (SELECT v FROM reh_ids WHERE k = 'N1')))::text, 'null')
      || ', "recipient_id": "' || (SELECT v FROM reh_ids WHERE k = 'N1') || '", "coach_first_name": "Salomón"}]}',
    format(j, id.s1));
  PERFORM pg_temp.reh_case('C3 never twice: asking again sends nothing', 'N1', '0', format(jn, id.s1));
  PERFORM pg_temp.reh_case('C4 a pending request is not a join yet', 'N2', 'not_joined',
    format('SELECT public.av_claim_welcome_for_join(%L)->>''error''', id.s1));
  PERFORM pg_temp.reh_case('C5 someone who already trained with the coach', 'REG', '0', format(jn, id.s1));
  PERFORM pg_temp.reh_case('C6 someone who joined another of the coach''s sessions before', 'PRE', '0', format(jn, id.s1));
  -- One call, read for its push flag. (A first draft asked twice, and the
  -- second call's "no notification" passed as "no push": vacuous.) S7 then
  -- proves the in-app row was still written.
  PERFORM pg_temp.reh_case('S3 over the daily cap: welcomed, but push is off', 'CAP1', 'false', format(jp, id.s1));
  PERFORM pg_temp.reh_case('S5 over the weekly cap: welcomed, no push', 'CAP3', 'false', format(jp, id.s1));
  PERFORM pg_temp.reh_case('C7 the coach is never welcomed to their own session', 'K', '0', format(jn, id.s1));
  PERFORM pg_temp.reh_case('C8 a coach with no note sends nothing', 'N3', '0', format(jn, id.s_k2));
  PERFORM pg_temp.reh_case('C9 anon cannot claim', 'anon', 'error=42501', format(j, id.s1));
  PERFORM pg_temp.reh_case('C10 a signed-in user cannot call the Pass entry point', 'N1', 'error=42501', format(pn, id.lead_u, id.passu));
  PERFORM pg_temp.reh_case('C11 nor the internal recorder', 'N1', 'error=42501',
    format('SELECT public.av_welcome_record(%L, %L, NULL)::text', (SELECT v FROM reh_ids WHERE k = 'K'), (SELECT v FROM reh_ids WHERE k = 'N1')));
  PERFORM pg_temp.reh_case('S6 the Pass route welcomes a signed-in claimant (service role)', 'service', '1', format(pn, id.lead_u, id.passu));
  PERFORM pg_temp.reh_case('C12 not a claimant who already joined the coach before', 'service', '0', format(pn, id.lead_kn, id.passkn));
  PERFORM pg_temp.reh_case('C13 signed-in users cannot read the ledger', 'N1', 'error=42501', 'SELECT count(*)::text FROM public.av_notification_log');
END $c$;

INSERT INTO reh (arm, verdict, detail)
SELECT 'S7 the ledger: one welcome row each for N1, CAP1, CAP3, PASSU; push only for N1 and PASSU',
       CASE WHEN count(*) = 4
             AND count(*) FILTER (WHERE push) = 2
             AND bool_and(push = (recipient_id IN ((SELECT v FROM reh_ids WHERE k = 'N1'), (SELECT v FROM reh_ids WHERE k = 'PASSU'))))
            THEN 'PASS' ELSE 'FAIL' END,
       count(*) || ' rows, ' || count(*) FILTER (WHERE push) || ' with push'
  FROM public.av_notification_log WHERE event = 'welcome' AND coach_id = (SELECT v FROM reh_ids WHERE k = 'K');

DO $k$
DECLARE v_err text;
BEGIN
  BEGIN
    INSERT INTO public.av_notification_log (event, lead_id, recipient_id, push)
    VALUES ('claimed', (SELECT v FROM reh_ids WHERE k = 'LEAD_U'), (SELECT v FROM reh_ids WHERE k = 'N1'), false);
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh (arm, verdict, detail)
  VALUES ('K1 an athletes event still needs its program athlete', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
  BEGIN
    INSERT INTO public.av_notification_log (event, recipient_id, push) VALUES ('welcome', (SELECT v FROM reh_ids WHERE k = 'N3'), false);
    v_err := 'no error';
  EXCEPTION WHEN check_violation THEN v_err := 'check_violation';
  END;
  INSERT INTO reh (arm, verdict, detail)
  VALUES ('K2 a welcome row needs its coach', CASE WHEN v_err = 'check_violation' THEN 'PASS' ELSE 'FAIL' END, v_err);
END $k$;

SELECT seq, arm, verdict, detail FROM reh ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh;

ROLLBACK;

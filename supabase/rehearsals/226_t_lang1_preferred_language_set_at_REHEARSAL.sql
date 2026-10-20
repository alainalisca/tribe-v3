-- 226_t_lang1_preferred_language_set_at_REHEARSAL.sql. Dry run of 226. Applies nothing.
--
-- Run it with scripts/av-rehearse.sh, never by hand:
--
--   scripts/av-rehearse.sh 226_t_lang1_preferred_language_set_at
--
-- The local stack's session_participants_roster view and both 210
-- athletes-notification functions matched production by md5 on 2026-10-20,
-- and its users.preferred_language is the same VARCHAR(2) DEFAULT 'en'.
--
-- PART M IS 226'S BODY, SPLICED VERBATIM (supabase/rehearsalBodyVerbatim.test.ts):
-- everything between the migration's own BEGIN and its "Record this migration
-- as applied" marker, guards and comments included, never retyped. Re-splice
-- after editing the migration. T0 checks the transaction id is the same after
-- the body as before it, so a COMMIT that slipped in is a FAIL row.
--
-- One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- FIXTURE (inside the transaction): stand-ins for the two production accounts
-- 226 names by id (15bae2c6 'en', eaff348f 'es'), plus an athlete who chose
-- Spanish ('es'), an untouched 'en' account, and an 'en' account on
-- aplusfitnessllc.com. All on the local stack only.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_226 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_226_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_226_before (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
CREATE TEMP TABLE reh_226_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;

CREATE FUNCTION pg_temp.reh(p_arm text, p_ok boolean, p_detail text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO reh_226 (arm, verdict, detail) VALUES (p_arm, CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, p_detail);
$f$;

-- Runs p_sql as an authenticated user and returns its single text value or the error.
CREATE FUNCTION pg_temp.reh_as(p_actor text, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  v_uid uuid := (SELECT v FROM reh_226_ids WHERE k = p_actor);
  v_out text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE p_sql INTO v_out;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN others THEN
    v_out := 'error=' || SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN coalesce(v_out, '<null>');
END $f$;

-- Builds a state inside a subtransaction, calls one of 226's own checks,
-- records what it said, and rolls the state back.
CREATE FUNCTION pg_temp.reh_guard(p_arm text, p_check text, p_build text, p_expect text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_got text;
BEGIN
  BEGIN
    EXECUTE p_build;
    EXECUTE format('SELECT pg_temp.%I()', p_check) INTO v_got;
    RAISE EXCEPTION 'reh_226 undo' USING ERRCODE = 'P0226';
  EXCEPTION
    WHEN SQLSTATE 'P0226' THEN NULL;
    WHEN others THEN v_got := 'error=' || SQLERRM;
  END;
  PERFORM pg_temp.reh(p_arm, v_got LIKE p_expect, format('expected %s, got %s', p_expect, coalesce(v_got, '<null>')));
END $f$;

SELECT pg_temp.reh('E0 ENV session_user and current_user', true, format('session_user=%s current_user=%s', session_user, current_user));

-- ── F. Fixture ─────────────────────────────────────────────────────────────
DO $f$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('UNCLE', '15bae2c6-cf33-4566-ab8a-df5d455cc578'::uuid, 'reh226-uncle@test.local', 'en'),
      ('DARIAN', 'eaff348f-5df3-4df5-bd80-69ec233aad0e'::uuid, 'reh226-darian@aplusfitnessllc.com', 'es'),
      ('ES', gen_random_uuid(), 'reh226-es@test.local', 'es'),
      ('EN', gen_random_uuid(), 'reh226-en@test.local', 'en'),
      ('APLUS', gen_random_uuid(), 'reh226-aplus@aplusfitnessllc.com', 'en')) AS x(k, id, email, lang)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
      INSERT INTO auth.users (id, email, aud, role) VALUES (r.id, r.email, 'authenticated', 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = r.id) THEN
      INSERT INTO public.users (id, email, name) VALUES (r.id, r.email, 'Rehearsal 226 ' || r.k);
    END IF;
    UPDATE public.users SET preferred_language = r.lang WHERE id = r.id;
    INSERT INTO reh_226_ids VALUES (r.k, r.id);
  END LOOP;
END $f$;

-- ── B. Before 226 ──────────────────────────────────────────────────────────
SELECT pg_temp.reh('B1 before 226: preferred_language_set_at does not exist',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_language_set_at'),
  'column absent');
SELECT pg_temp.reh('B2 before 226: preferred_language defaults to en',
  (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_language') = '''en''::character varying',
  'default en');

INSERT INTO reh_226_before
SELECT 'UNCLE', to_jsonb(u) - 'location' - 'latitude' - 'longitude' - 'location_lat' - 'location_lng'
  FROM public.users u WHERE id = (SELECT v FROM reh_226_ids WHERE k = 'UNCLE');

INSERT INTO reh_226_tx VALUES ('before', txid_current());

-- ══════════════════════════════════════════════════════════════════════════
-- PART M. 226's body, verbatim.
-- ══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.m226_preflight() RETURNS text LANGUAGE plpgsql AS $pre$
DECLARE
  v_col record;
  v_set record;
  v_view text;
  v_claim text;
  v_lead text;
BEGIN
  SELECT data_type, character_maximum_length, column_default, is_nullable INTO v_col
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_language';
  IF v_col.data_type IS NULL THEN
    RAISE EXCEPTION '226 ABORTED: users.preferred_language does not exist.';
  END IF;
  IF v_col.data_type <> 'character varying' OR v_col.character_maximum_length <> 2 OR v_col.is_nullable <> 'YES' THEN
    RAISE EXCEPTION '226 ABORTED: users.preferred_language is not the nullable VARCHAR(2) measured on 2026-10-20.';
  END IF;
  IF v_col.column_default IS NOT NULL AND v_col.column_default <> '''en''::character varying' THEN
    RAISE EXCEPTION '226 ABORTED: users.preferred_language defaults to %, not ''en'' or nothing.', v_col.column_default;
  END IF;

  SELECT data_type INTO v_set
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_language_set_at';
  IF v_set.data_type IS NOT NULL AND v_set.data_type <> 'timestamp with time zone' THEN
    RAISE EXCEPTION '226 ABORTED: users.preferred_language_set_at exists as %, not timestamptz.', v_set.data_type;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = '15bae2c6-cf33-4566-ab8a-df5d455cc578') THEN
    RAISE EXCEPTION '226 ABORTED: account 15bae2c6 (Claude Marc-Charles) not found.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e') THEN
    RAISE EXCEPTION '226 ABORTED: account eaff348f (Darian) not found.';
  END IF;

  -- The roster view and the two 210 functions: captured on 2026-10-20, or
  -- this file's own result (a re-run). Anything else is read, not replaced.
  v_view := md5(pg_get_viewdef(to_regclass('public.session_participants_roster'), true));
  v_claim := (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.av_athletes_claim_notification(text,text)'));
  v_lead := (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.av_athletes_claim_lead_notification(uuid)'));
  IF v_view IS NULL OR v_view NOT IN ('ac1199ceff152df9d40f9855960a6c31', '5408a78a85bcaa75f77116d2569fb04b') THEN
    RAISE EXCEPTION '226 ABORTED: session_participants_roster is not the definition captured on 2026-10-20 (md5 %); read it before replacing it.', coalesce(v_view, 'missing');
  END IF;
  IF v_claim IS NULL OR v_claim NOT IN ('c47ba93c2dea72ddbbd60d5f04cb9a5e', '5dfbb3a3a221d8417241c7af9088d52b') THEN
    RAISE EXCEPTION '226 ABORTED: av_athletes_claim_notification is not the body captured on 2026-10-20 (md5 %).', coalesce(v_claim, 'missing');
  END IF;
  IF v_lead IS NULL OR v_lead NOT IN ('ff0750e231ec6cf4c07dd9fb018f1be4', 'c44aa9dbdf16320e7c8eca50b409c8d4') THEN
    RAISE EXCEPTION '226 ABORTED: av_athletes_claim_lead_notification is not the body captured on 2026-10-20 (md5 %).', coalesce(v_lead, 'missing');
  END IF;

  RETURN CASE WHEN v_set.data_type IS NULL THEN 'first run' ELSE 're-run' END;
END $pre$;

DO $$
BEGIN
  RAISE NOTICE '226 pre-flight: %', pg_temp.m226_preflight();
END $$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferred_language_set_at timestamptz;

COMMENT ON COLUMN public.users.preferred_language_set_at IS
  'T-LANG1: when the person chose preferred_language in the app (setLanguage). NULL means never chose: senders read Spanish (lib/i18n/recipientLanguage.ts).';

GRANT SELECT (preferred_language_set_at) ON public.users TO authenticated;

CREATE OR REPLACE VIEW public.session_participants_roster WITH (security_invoker = false) AS
 SELECT sp.id,
    sp.session_id,
    sp.user_id,
    sp.status,
    sp.is_guest,
    sp.guest_name,
    sp.joined_at,
    u.id AS user_profile_id,
    u.name AS user_name,
    u.avatar_url AS user_avatar_url,
    u.preferred_language AS user_preferred_language,
    u.preferred_language_set_at AS user_preferred_language_set_at
   FROM session_participants sp
     LEFT JOIN users u ON u.id = sp.user_id
  WHERE is_app_admin() OR (EXISTS ( SELECT 1
           FROM sessions s
          WHERE s.id = sp.session_id AND s.creator_id = auth.uid())) OR (EXISTS ( SELECT 1
           FROM session_participants me
          WHERE me.session_id = sp.session_id AND me.user_id = auth.uid() AND me.status = 'confirmed'::text));

CREATE OR REPLACE FUNCTION public.av_athletes_claim_notification(p_pass_code text, p_event text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead     record;
  v_credited boolean;
  v_pa       record;
  v_push     boolean;
  v_id       uuid;
  v_out      jsonb := '[]'::jsonb;
  v_owner    record;
  v_ready    boolean;
BEGIN
  IF p_event IS NULL OR p_event NOT IN ('arrived', 'joined') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_event');
  END IF;

  SELECT pl.id, pl.partner_id, pl.attended_at, pl.outcome, pl.referred_by_athlete_id,
         split_part(btrim(pl.name), ' ', 1) AS guest_first_name, fp.business_name, fp.user_id AS owner_id
    INTO v_lead
    FROM public.pass_leads pl
    JOIN public.featured_partners fp ON fp.id = pl.partner_id
   WHERE pl.pass_code = upper(btrim(p_pass_code));
  IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- The event must have happened. The caller does not get to say it did.
  IF (p_event = 'arrived' AND v_lead.attended_at IS NULL)
     OR (p_event = 'joined' AND v_lead.outcome IS DISTINCT FROM 'joined') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_happened');
  END IF;

  IF v_lead.referred_by_athlete_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'notifications', v_out);
  END IF;
  SELECT l.credited INTO v_credited FROM public.av_athletes_ledger(v_lead.partner_id) l WHERE l.lead_id = v_lead.id;
  IF v_credited IS NOT TRUE THEN
    RETURN jsonb_build_object('success', true, 'notifications', v_out);
  END IF;

  SELECT pa.id, pa.user_id, split_part(btrim(u.name), ' ', 1) AS first_name, u.preferred_language,
         u.preferred_language_set_at
    INTO v_pa
    FROM public.program_athletes pa JOIN public.users u ON u.id = pa.user_id
   WHERE pa.id = v_lead.referred_by_athlete_id;

  -- One recipient at a time, so two confirms in the same second cannot both
  -- read "no push today" and both push.
  PERFORM pg_advisory_xact_lock(hashtext('av_push:' || v_pa.user_id::text));
  v_push := public.av_push_allowed(v_pa.user_id, p_event);
  INSERT INTO public.av_notification_log (event, lead_id, program_athlete_id, recipient_id, push)
  VALUES (p_event, v_lead.id, v_pa.id, v_pa.user_id, v_push)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'event', p_event, 'recipient_id', v_pa.user_id, 'language', v_pa.preferred_language, 'language_set_at', v_pa.preferred_language_set_at,
      'push', v_push, 'guest_first_name', v_lead.guest_first_name, 'partner_name', v_lead.business_name,
      'partner_id', v_lead.partner_id, 'lead_id', v_lead.id));
  END IF;

  -- An arrival is what moves a captain to ready. Tell the owner, once.
  IF p_event = 'arrived' THEN
    SELECT t.ready_to_promote INTO v_ready
      FROM public.av_athletes_ledger_totals(v_lead.partner_id) t WHERE t.program_athlete_id = v_pa.id;
    IF v_ready IS TRUE THEN
      SELECT u.id, u.preferred_language, u.preferred_language_set_at INTO v_owner FROM public.users u WHERE u.id = v_lead.owner_id;
      v_id := NULL;
      INSERT INTO public.av_notification_log (event, lead_id, program_athlete_id, recipient_id, push)
      VALUES ('ready', NULL, v_pa.id, v_owner.id, true)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_out := v_out || jsonb_build_array(jsonb_build_object(
          'event', 'ready', 'recipient_id', v_owner.id, 'language', v_owner.preferred_language, 'language_set_at', v_owner.preferred_language_set_at,
          'push', true, 'athlete_first_name', v_pa.first_name, 'partner_name', v_lead.business_name,
          'partner_id', v_lead.partner_id));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'notifications', v_out);
END;
$function$;

CREATE OR REPLACE FUNCTION public.av_athletes_claim_lead_notification(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead     record;
  v_credited boolean;
  v_pa       record;
  v_id       uuid;
BEGIN
  SELECT pl.id, pl.partner_id, pl.referred_by_athlete_id, split_part(btrim(pl.name), ' ', 1) AS guest_first_name,
         fp.business_name
    INTO v_lead
    FROM public.pass_leads pl JOIN public.featured_partners fp ON fp.id = pl.partner_id
   WHERE pl.id = p_lead_id;
  IF NOT FOUND OR v_lead.referred_by_athlete_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;
  SELECT l.credited INTO v_credited FROM public.av_athletes_ledger(v_lead.partner_id) l WHERE l.lead_id = v_lead.id;
  IF v_credited IS NOT TRUE THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;

  SELECT pa.id, pa.user_id, u.preferred_language, u.preferred_language_set_at INTO v_pa
    FROM public.program_athletes pa JOIN public.users u ON u.id = pa.user_id
   WHERE pa.id = v_lead.referred_by_athlete_id;
  -- In-app only: the day's one push is kept for a show-up.
  INSERT INTO public.av_notification_log (event, lead_id, program_athlete_id, recipient_id, push)
  VALUES ('claimed', v_lead.id, v_pa.id, v_pa.user_id, false)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true, 'notifications', jsonb_build_array(jsonb_build_object(
    'event', 'claimed', 'recipient_id', v_pa.user_id, 'language', v_pa.preferred_language, 'language_set_at', v_pa.preferred_language_set_at, 'push', false,
    'guest_first_name', v_lead.guest_first_name, 'partner_name', v_lead.business_name,
    'partner_id', v_lead.partner_id, 'lead_id', v_lead.id)));
END;
$function$;

-- The rows to stamp, and their before-image (location columns left out).
CREATE TEMP TABLE m226_target ON COMMIT DROP AS
SELECT u.id,
       to_jsonb(u) - 'preferred_language_set_at' - 'location' - 'latitude' - 'longitude'
                   - 'location_lat' - 'location_lng' AS before_image
  FROM public.users u
 WHERE u.preferred_language_set_at IS NULL
   AND (u.preferred_language = 'es'
          OR u.id IN ('15bae2c6-cf33-4566-ab8a-df5d455cc578', 'eaff348f-5df3-4df5-bd80-69ec233aad0e')
          OR lower(split_part(u.email, '@', 2)) = 'aplusfitnessllc.com');

UPDATE public.users u
   SET preferred_language_set_at = now()
  FROM m226_target t
 WHERE u.id = t.id;

ALTER TABLE public.users ALTER COLUMN preferred_language DROP DEFAULT;

CREATE FUNCTION pg_temp.m226_postcheck() RETURNS text LANGUAGE plpgsql AS $post$
DECLARE
  v_changed integer;
  v_unstamped integer;
  v_stray integer;
  v_target integer;
BEGIN
  SELECT count(*) INTO v_target FROM m226_target;

  SELECT count(*) INTO v_changed
    FROM m226_target t JOIN public.users u ON u.id = t.id
   WHERE (to_jsonb(u) - 'preferred_language_set_at' - 'location' - 'latitude' - 'longitude'
                      - 'location_lat' - 'location_lng') IS DISTINCT FROM t.before_image;
  IF v_changed > 0 THEN
    RAISE EXCEPTION '226 ABORTED: % stamped row(s) changed in a column other than preferred_language_set_at.', v_changed;
  END IF;

  SELECT count(*) INTO v_unstamped
    FROM public.users u
   WHERE u.preferred_language_set_at IS NULL
     AND (u.preferred_language = 'es'
          OR u.id IN ('15bae2c6-cf33-4566-ab8a-df5d455cc578', 'eaff348f-5df3-4df5-bd80-69ec233aad0e')
          OR lower(split_part(u.email, '@', 2)) = 'aplusfitnessllc.com');
  IF v_unstamped > 0 THEN
    RAISE EXCEPTION '226 ABORTED: % target row(s) have no preferred_language_set_at.', v_unstamped;
  END IF;

  -- now() is this transaction's start: a stamp it wrote that is not a target.
  SELECT count(*) INTO v_stray
    FROM public.users u
   WHERE u.preferred_language_set_at = now()
     AND u.id NOT IN (SELECT id FROM m226_target);
  IF v_stray > 0 THEN
    RAISE EXCEPTION '226 ABORTED: % row(s) outside the target set were stamped.', v_stray;
  END IF;

  IF (SELECT preferred_language FROM public.users WHERE id = '15bae2c6-cf33-4566-ab8a-df5d455cc578') IS DISTINCT FROM 'en' THEN
    RAISE EXCEPTION '226 ABORTED: Claude Marc-Charles''s preferred_language is not ''en''.';
  END IF;

  IF (SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_language') IS NOT NULL THEN
    RAISE EXCEPTION '226 ABORTED: users.preferred_language still has a default.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.users', 'preferred_language_set_at', 'SELECT') THEN
    RAISE EXCEPTION '226 ABORTED: authenticated cannot read preferred_language_set_at; the app cannot see its own choice.';
  END IF;
  IF has_column_privilege('anon', 'public.users', 'preferred_language_set_at', 'SELECT') THEN
    RAISE EXCEPTION '226 ABORTED: anon can read preferred_language_set_at.';
  END IF;

  IF md5(pg_get_viewdef(to_regclass('public.session_participants_roster'), true)) <> '5408a78a85bcaa75f77116d2569fb04b' THEN
    RAISE EXCEPTION '226 ABORTED: session_participants_roster is not the expected result.';
  END IF;
  IF (SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'session_participants_roster'
       ORDER BY ordinal_position DESC LIMIT 1) IS DISTINCT FROM 'user_preferred_language_set_at' THEN
    RAISE EXCEPTION '226 ABORTED: session_participants_roster does not end with user_preferred_language_set_at.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.session_participants_roster', 'SELECT') THEN
    RAISE EXCEPTION '226 ABORTED: authenticated lost SELECT on session_participants_roster.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.av_athletes_claim_notification(text,text)')) IS DISTINCT FROM '5dfbb3a3a221d8417241c7af9088d52b'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.av_athletes_claim_lead_notification(uuid)')) IS DISTINCT FROM 'c44aa9dbdf16320e7c8eca50b409c8d4' THEN
    RAISE EXCEPTION '226 ABORTED: an athletes-notification function is not the expected result.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE oid IN (to_regprocedure('public.av_athletes_claim_notification(text,text)'),
                            to_regprocedure('public.av_athletes_claim_lead_notification(uuid)'))
                AND (NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=public'])) THEN
    RAISE EXCEPTION '226 ABORTED: an athletes-notification function lost SECURITY DEFINER or its search_path.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.av_athletes_claim_notification(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_athletes_claim_lead_notification(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.av_athletes_claim_notification(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '226 ABORTED: the athletes-notification function grants changed.';
  END IF;

  RETURN format('stamped %s row(s) (%s stored ''es''); default dropped; no preferred_language rewritten',
                v_target, (SELECT count(*) FROM public.users WHERE preferred_language = 'es'));
END $post$;

DO $$
BEGIN
  RAISE NOTICE '226: %', pg_temp.m226_postcheck();
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- After 226
-- ══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.reh('T0 the body did not commit (same transaction before and after)',
  (SELECT v FROM reh_226_tx WHERE k = 'before') = txid_current(),
  format('txid before=%s after=%s', (SELECT v FROM reh_226_tx WHERE k = 'before'), txid_current()));

SELECT pg_temp.reh('A1 preferred_language_set_at is a nullable timestamptz',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
            AND column_name = 'preferred_language_set_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES'),
  'column shape');
SELECT pg_temp.reh('A2 preferred_language has no default',
  (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_language') IS NULL,
  'default dropped');

CREATE FUNCTION pg_temp.state(p_k text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('lang=%s stamped=%s', coalesce(preferred_language, 'null'),
                CASE WHEN preferred_language_set_at IS NOT NULL THEN 'true' ELSE 'false' END)
    FROM public.users WHERE id = (SELECT v FROM reh_226_ids WHERE k = p_k);
$f$;
SELECT pg_temp.reh('A3 an athlete who chose Spanish is stamped and keeps es', pg_temp.state('ES') = 'lang=es stamped=true', pg_temp.state('ES'));
SELECT pg_temp.reh('A4 Claude Marc-Charles is stamped and keeps en', pg_temp.state('UNCLE') = 'lang=en stamped=true', pg_temp.state('UNCLE'));
SELECT pg_temp.reh('A5 Claude Marc-Charles''s row changed in nothing but the stamp',
  (SELECT to_jsonb(u) - 'location' - 'latitude' - 'longitude' - 'location_lat' - 'location_lng' - 'preferred_language_set_at'
     FROM public.users u WHERE id = (SELECT v FROM reh_226_ids WHERE k = 'UNCLE'))
  = (SELECT v FROM reh_226_before WHERE k = 'UNCLE'),
  'row equal to its before-image');
SELECT pg_temp.reh('A6 Darian is stamped and keeps es', pg_temp.state('DARIAN') = 'lang=es stamped=true', pg_temp.state('DARIAN'));
SELECT pg_temp.reh('A7 an aplusfitnessllc.com account is stamped and keeps en', pg_temp.state('APLUS') = 'lang=en stamped=true', pg_temp.state('APLUS'));
SELECT pg_temp.reh('A8 an untouched en account is not stamped and keeps en', pg_temp.state('EN') = 'lang=en stamped=false', pg_temp.state('EN'));

DO $f$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, aud, role) VALUES (v_id, 'reh226-new@test.local', 'authenticated', 'authenticated');
  INSERT INTO public.users (id, email, name) VALUES (v_id, 'reh226-new@test.local', 'Rehearsal 226 NEW');
  INSERT INTO reh_226_ids VALUES ('NEW', v_id);
END $f$;
SELECT pg_temp.reh('A9 a new account starts with no language and no stamp', pg_temp.state('NEW') = 'lang=null stamped=false', pg_temp.state('NEW'));

SELECT pg_temp.reh('A10 authenticated reads preferred_language_set_at, anon does not',
  has_column_privilege('authenticated', 'public.users', 'preferred_language_set_at', 'SELECT')
  AND NOT has_column_privilege('anon', 'public.users', 'preferred_language_set_at', 'SELECT'),
  'grants');
SELECT pg_temp.reh('A11 a person can choose a language on their own row (setLanguage)',
  pg_temp.reh_as('EN', 'UPDATE public.users SET preferred_language = ''es'', preferred_language_set_at = now() WHERE id = auth.uid() RETURNING preferred_language || ''/'' || (preferred_language_set_at IS NOT NULL)') = 'es/true',
  'own-row update as authenticated');
-- Undo A11's write: 226's post-check counts any stamp written in this
-- transaction outside its target set, and A11 is not part of 226.
UPDATE public.users SET preferred_language = 'en', preferred_language_set_at = NULL
 WHERE id = (SELECT v FROM reh_226_ids WHERE k = 'EN');
SELECT pg_temp.reh('A12 the roster view ends with user_preferred_language_set_at',
  (SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'session_participants_roster'
    ORDER BY ordinal_position DESC LIMIT 1) = 'user_preferred_language_set_at',
  'last column');
SELECT pg_temp.reh('A13 both athletes-notification functions now carry language_set_at',
  (SELECT count(*) FROM pg_proc WHERE oid IN (to_regprocedure('public.av_athletes_claim_notification(text,text)'),
                                             to_regprocedure('public.av_athletes_claim_lead_notification(uuid)'))
     AND prosrc LIKE '%''language_set_at''%') = 2,
  'language_set_at key present');

-- ── G. 226's own checks, against states built to fail ──────────────────────
SELECT pg_temp.reh_guard('G1 a re-run passes the pre-flight', 'm226_preflight', 'SELECT 1', 're-run');
SELECT pg_temp.reh_guard('G2 a changed roster view aborts', 'm226_preflight',
  'CREATE OR REPLACE VIEW public.session_participants_roster WITH (security_invoker = false) AS SELECT * FROM public.session_participants_roster WHERE true',
  'error=226 ABORTED: session_participants_roster is not the definition captured%');
SELECT pg_temp.reh_guard('G3 a changed athletes-notification function aborts', 'm226_preflight',
  'COMMENT ON FUNCTION public.av_athletes_claim_lead_notification(uuid) IS NULL; ' ||
  'CREATE OR REPLACE FUNCTION public.av_athletes_claim_lead_notification(p_lead_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $x$ BEGIN RETURN ''{}''::jsonb; END $x$',
  'error=226 ABORTED: av_athletes_claim_lead_notification is not the body captured%');
SELECT pg_temp.reh_guard('G4 a different preferred_language default aborts', 'm226_preflight',
  'ALTER TABLE public.users ALTER COLUMN preferred_language SET DEFAULT ''es''',
  'error=226 ABORTED: users.preferred_language defaults to%');
SELECT pg_temp.reh_guard('G5 a missing Claude Marc-Charles aborts', 'm226_preflight',
  'DELETE FROM public.users WHERE id = ''15bae2c6-cf33-4566-ab8a-df5d455cc578''',
  'error=226 ABORTED: account 15bae2c6%');
SELECT pg_temp.reh_guard('G6 the post-check passes as applied', 'm226_postcheck', 'SELECT 1', 'stamped % row(s)%');
SELECT pg_temp.reh_guard('G7 a stamped row changed in another column aborts', 'm226_postcheck',
  'UPDATE public.users SET name = name || '' x'' WHERE id = ''15bae2c6-cf33-4566-ab8a-df5d455cc578''',
  'error=226 ABORTED: 1 stamped row(s) changed in a column other than preferred_language_set_at.');
SELECT pg_temp.reh_guard('G8 a stamp outside the target set aborts', 'm226_postcheck',
  format('UPDATE public.users SET preferred_language_set_at = now() WHERE id = %L', (SELECT v FROM reh_226_ids WHERE k = 'NEW')),
  'error=226 ABORTED: 1 row(s) outside the target set were stamped.');
SELECT pg_temp.reh_guard('G9 a target row without a stamp aborts', 'm226_postcheck',
  format('UPDATE public.users SET preferred_language_set_at = NULL WHERE id = %L', (SELECT v FROM reh_226_ids WHERE k = 'ES')),
  'error=226 ABORTED: 1 target row(s) have no preferred_language_set_at.');
SELECT pg_temp.reh_guard('G10 a rewritten preference on Claude Marc-Charles aborts', 'm226_postcheck',
  'UPDATE public.users SET preferred_language = ''es'' WHERE id = ''15bae2c6-cf33-4566-ab8a-df5d455cc578''',
  'error=226 ABORTED: % stamped row(s) changed in a column other than preferred_language_set_at.');
SELECT pg_temp.reh_guard('G11 a default put back aborts', 'm226_postcheck',
  'ALTER TABLE public.users ALTER COLUMN preferred_language SET DEFAULT ''en''',
  'error=226 ABORTED: users.preferred_language still has a default.');
SELECT pg_temp.reh_guard('G12 anon able to read the stamp aborts', 'm226_postcheck',
  'GRANT SELECT (preferred_language_set_at) ON public.users TO anon',
  'error=226 ABORTED: anon can read preferred_language_set_at.');

-- ── Result ─────────────────────────────────────────────────────────────────
CREATE TEMP TABLE reh_226_manifest (seq int PRIMARY KEY, arm text NOT NULL) ON COMMIT DROP;
INSERT INTO reh_226_manifest (seq, arm) VALUES
  (1, 'E0 ENV session_user and current_user'),
  (2, 'B1 before 226: preferred_language_set_at does not exist'),
  (3, 'B2 before 226: preferred_language defaults to en'),
  (4, 'T0 the body did not commit (same transaction before and after)'),
  (5, 'A1 preferred_language_set_at is a nullable timestamptz'),
  (6, 'A2 preferred_language has no default'),
  (7, 'A3 an athlete who chose Spanish is stamped and keeps es'),
  (8, 'A4 Claude Marc-Charles is stamped and keeps en'),
  (9, 'A5 Claude Marc-Charles''s row changed in nothing but the stamp'),
  (10, 'A6 Darian is stamped and keeps es'),
  (11, 'A7 an aplusfitnessllc.com account is stamped and keeps en'),
  (12, 'A8 an untouched en account is not stamped and keeps en'),
  (13, 'A9 a new account starts with no language and no stamp'),
  (14, 'A10 authenticated reads preferred_language_set_at, anon does not'),
  (15, 'A11 a person can choose a language on their own row (setLanguage)'),
  (16, 'A12 the roster view ends with user_preferred_language_set_at'),
  (17, 'A13 both athletes-notification functions now carry language_set_at'),
  (18, 'G1 a re-run passes the pre-flight'),
  (19, 'G2 a changed roster view aborts'),
  (20, 'G3 a changed athletes-notification function aborts'),
  (21, 'G4 a different preferred_language default aborts'),
  (22, 'G5 a missing Claude Marc-Charles aborts'),
  (23, 'G6 the post-check passes as applied'),
  (24, 'G7 a stamped row changed in another column aborts'),
  (25, 'G8 a stamp outside the target set aborts'),
  (26, 'G9 a target row without a stamp aborts'),
  (27, 'G10 a rewritten preference on Claude Marc-Charles aborts'),
  (28, 'G11 a default put back aborts'),
  (29, 'G12 anon able to read the stamp aborts');

SELECT seq, arm, verdict, detail FROM reh_226 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_226;
SELECT CASE WHEN (SELECT array_agg(arm ORDER BY seq) FROM reh_226)
                 = (SELECT array_agg(arm ORDER BY seq) FROM reh_226_manifest)
            THEN 'manifest matches: every arm ran, in order' ELSE 'MANIFEST MISMATCH' END AS manifest;

-- The one result set for the transaction. Every row must read PASS. 29 of 29.

ROLLBACK;

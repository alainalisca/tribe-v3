-- 226_t_lang1_preferred_language_set_at.sql
--
-- T-LANG1: tell "chose a language" apart from "never chose".
-- NOT APPLIED when written (2026-10-20). Safe to apply BEFORE the code that
-- reads it merges (see ORDER).
--
-- THE DEFECT (docs/TICKET-preferred-language-default.md). users.preferred_language
-- is VARCHAR(2) DEFAULT 'en', nullable, no CHECK. Its only writer is setLanguage
-- (lib/LanguageContext.tsx), and only when someone switches language, so a
-- stored 'es' is always a choice while a stored 'en' is either the column
-- default or a choice, and nothing records which. Production, read-only,
-- 2026-10-20: 119 rows, 110 'en', 9 'es', 0 NULL.
--
-- WHAT THIS CHANGES
--   1. users.preferred_language_set_at timestamptz, NULL. The code writes it
--      only in setLanguage, together with preferred_language.
--   2. SELECT on that column for authenticated (users carries column-level
--      SELECT grants; without this the app cannot read its own row's value).
--      Not anon. Writes need nothing: authenticated already holds table-level
--      UPDATE on users, limited to the own row by RLS.
--   3. set_at = now() on the rows that are known choices or Al's own accounts,
--      and ONLY that column on them:
--        * every row whose preferred_language is 'es' (9 on 2026-10-20: five
--          athletes, Darian, three deleted test accounts on aplusfitnessllc.com)
--        * 15bae2c6-cf33-4566-ab8a-df5d455cc578, Claude Marc-Charles, Al's
--          uncle: stored 'en', keeps English. Only the timestamp is written.
--        * eaff348f-5df3-4df5-bd80-69ec233aad0e, Darian, Al's admin account
--          (stored 'es', so it keeps Spanish)
--        * every account on aplusfitnessllc.com (25 on 2026-10-20, 24 of them
--          soft-deleted test accounts)
--      No row's preferred_language is rewritten, and no row outside that set
--      is touched.
--   4. preferred_language DROP DEFAULT: a new account starts NULL, "never
--      chose", instead of a false 'en'.
--   5. session_participants_roster (152) gains user_preferred_language_set_at
--      as its LAST column: the requests page and the pending-requests panel
--      read a requester's language through it. Same rows, same WHERE, same
--      security_invoker = false, same grants.
--   6. av_athletes_claim_notification and av_athletes_claim_lead_notification
--      (210) also read preferred_language_set_at and add a 'language_set_at'
--      key beside 'language' in each notification they return. 'language' is
--      unchanged, so the code on main reads exactly what it read before; the
--      new code applies the rule (lib/atletas/athleteNotifications.ts).
--      Nothing else in either body changes; grants, SECURITY DEFINER and
--      search_path are restated by the definitions and checked after.
--
-- WHAT IT DOES NOT CHANGE: any stored preferred_language, any other column,
-- any policy. The 101 unstamped 'en' rows keep 'en'; the code that merges with
-- this reads them as "not chosen" (Spanish) through lib/i18n/recipientLanguage.ts.
--
-- ORDER. Apply-before-merge is safe: code on main never names the new column;
-- the grant and the stamps are invisible to it; DROP DEFAULT only affects rows
-- created afterwards, which main's readers already handle as NULL (toLang(null)
-- and `|| 'en'` read English, LanguageContext falls back to the browser). The
-- code that SELECTs preferred_language_set_at must not deploy before this runs.
--
-- GUARDS. Pre-flight: preferred_language is the shape measured above; the two
-- named accounts exist; on a re-run the new column must already be timestamptz;
-- the roster view and both functions are byte-for-byte what production had on
-- 2026-10-20 (md5 of the view definition and of each prosrc) or already this
-- file's own result, nothing else.
-- After: every stamped row equals its before-image in every column except
-- preferred_language_set_at (location columns are left out of the comparison,
-- never read for anything else); nothing outside the target set got a stamp in
-- this transaction; every target row has one; Claude Marc-Charles's
-- preferred_language did not move; the default is gone; the grant is there;
-- the view and both functions are exactly the expected results, with their
-- SECURITY DEFINER, search_path and grants intact.
-- Both checks are temporary functions (pg_temp.m226_preflight,
-- pg_temp.m226_postcheck), so the rehearsal can call them again against
-- states built to fail and prove each abort fires.

BEGIN;

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

-- ── Record this migration as applied
INSERT INTO public.migrations_applied (migration, note)
VALUES ('226_t_lang1_preferred_language_set_at',
        'T-LANG1: users.preferred_language_set_at (SELECT for authenticated), stamped on es rows + Al''s accounts, default dropped, roster view and 210 notifications carry it')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

-- 232_t_plan1_account_scrub_coach_plans_REHEARSAL.sql
--
-- Rehearsal for supabase/migrations/232_t_plan1_account_scrub_coach_plans.sql.
-- Everything runs inside ONE transaction that ends in ROLLBACK: nothing here
-- persists. Needs 231 on the database (232's pre-flight refuses without it);
-- on a stack without 231, supabase/recon/t-plan1-232-rehearsal.LOCAL.sh splices
-- 231's body in right after BEGIN, inside the same transaction.
--
-- Part A  232's body, verbatim (rehearsalBodyVerbatim.test.ts checks it).
-- Part S  the scrub on throwaway accounts made here (reh-232-*): a paying Pro
--         coach, an Embajador comp and a basico athlete are deleted; a
--         Crecimiento coach who is not deleted is the bystander.
-- Part T  the new body is 228's plus the eight lines and nothing else.
-- Every row must read PASS. 9 of 9.

BEGIN;

-- ═══ PART A: the migration body, verbatim ═══════════════════════════════════
-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_md5 text;
BEGIN
  IF (SELECT count(*) FROM pg_attribute
       WHERE attrelid = 'public.users'::regclass AND attnum > 0 AND NOT attisdropped
         AND attname IN ('coach_plan', 'coach_plan_status', 'coach_plan_source',
                         'coach_plan_stripe_customer_id', 'coach_plan_stripe_subscription_id',
                         'coach_plan_current_period_end', 'coach_plan_granted_by',
                         'coach_plan_granted_at')) <> 8 THEN
    RAISE EXCEPTION '232 ABORTED: the eight users.coach_plan* columns are not all there; apply 231 first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.users'::regclass
                  AND tgname = 'users_coach_plan_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '232 ABORTED: users_coach_plan_guard is missing; apply 231 first.';
  END IF;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure('public.account_scrub(uuid)');
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION '232 ABORTED: account_scrub(uuid) does not exist; apply 228 first.';
  END IF;
  IF v_md5 NOT IN ('e627bfb752710462c42fcd3730eb00eb', '9de0736a23065ac4b5b44a4d516e0bbd') THEN
    RAISE EXCEPTION '232 ABORTED: account_scrub is not 228''s body (md5 %); a later change would be reverted.', v_md5;
  END IF;
END $$;

-- ── 1. account_scrub: 228's body plus the coach plan ────────────────────────
CREATE OR REPLACE FUNCTION public.account_scrub(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Bogota')::date;
  -- Their own folder in session-photos, as it appears inside a public URL.
  v_folder text := '/session-photos/' || p_user::text || '/';
BEGIN
  IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'account_scrub: no users row for %', p_user USING ERRCODE = 'no_data_found';
  END IF;
  -- The route refuses these first; this is the same refusal for any other caller.
  IF EXISTS (SELECT 1 FROM public.gyms WHERE owner_user_id = p_user) THEN
    RAISE EXCEPTION 'account_scrub: owns_gym' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.featured_partners WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'account_scrub: owns_partner' USING ERRCODE = 'check_violation';
  END IF;

  -- The profile first, so anything a later step sends says "Usuario eliminado".
  UPDATE public.users SET
    -- Who they are and how to reach them.
    email = 'deleted-' || p_user::text || '@deleted.invalid',
    name = 'Usuario eliminado',
    username = NULL,
    handle = NULL,
    bio = NULL,
    instructor_bio = NULL,
    instagram_username = NULL,
    facebook_url = NULL,
    website_url = NULL,
    -- Where they are.
    location = NULL,
    location_lat = NULL,
    location_lng = NULL,
    timezone = DEFAULT,
    -- Their images and video (the files go through account_deletion_files).
    avatar_url = NULL,
    banner_url = NULL,
    photos = '{}',
    cover_image_url = NULL,
    card_photo_url = NULL,
    card_photo_box = NULL,
    card_photo_rejects = '{}',
    storefront_banner_url = NULL,
    storefront_video_url = NULL,
    storefront_tagline = NULL,
    -- Their coaching profile.
    specialties = '{}',
    certifications = '{}',
    years_experience = NULL,
    verified_credentials = '{}',
    sports = NULL,
    preferred_sports = '{}',
    -- Looking for a trainer.
    seeking_trainer = false,
    seeking_trainer_sports = '{}',
    seeking_trainer_budget = NULL,
    seeking_trainer_schedule = NULL,
    seeking_trainer_note = NULL,
    -- Their devices.
    push_subscription = NULL,
    fcm_token = NULL,
    fcm_platform = NULL,
    fcm_updated_at = NULL,
    -- Their payment accounts.
    wompi_merchant_id = NULL,
    stripe_account_id = NULL,
    tribe_os_stripe_customer_id = NULL,
    tribe_os_stripe_subscription_id = NULL,
    subscription_gateway_id = NULL,
    -- Their coach plan (231, T-PLAN1). deleteAccount's cancel_plan step has
    -- already ended the Stripe subscription; this forgets it. basico with
    -- every other coach_plan_* column NULL satisfies users_coach_plan_consistent,
    -- and users_coach_plan_guard allows it: the service role has no auth.uid().
    coach_plan = 'basico',
    coach_plan_status = NULL,
    coach_plan_source = NULL,
    coach_plan_stripe_customer_id = NULL,
    coach_plan_stripe_subscription_id = NULL,
    coach_plan_current_period_end = NULL,
    coach_plan_granted_by = NULL,
    coach_plan_granted_at = NULL,
    -- How they found Tribe (guard_signup_attribution allows exactly this: all NULL).
    signup_src = NULL,
    signup_code = NULL,
    signup_ref = NULL,
    signup_utm_source = NULL,
    signup_utm_medium = NULL,
    signup_utm_campaign = NULL,
    signup_utm_content = NULL,
    signup_landing_path = NULL,
    signup_first_touch = NULL,
    signup_attributed_at = NULL,
    referral_code = NULL,
    referred_by = NULL,
    -- Their language and activity.
    preferred_language = NULL,
    preferred_language_set_at = NULL,
    last_login_at = NULL,
    last_seen_release = NULL,
    -- The account.
    deleted_at = coalesce(deleted_at, now()),
    is_active = false,
    is_admin = false
  WHERE id = p_user;

  -- Private data and their own settings.
  DELETE FROM public.user_private WHERE user_id = p_user;
  DELETE FROM public.push_subscriptions WHERE user_id = p_user;
  DELETE FROM public.notification_preferences WHERE user_id = p_user;
  DELETE FROM public.user_training_preferences WHERE user_id = p_user;

  -- Who they follow and are connected to, both ways.
  DELETE FROM public.user_follows WHERE follower_id = p_user OR following_id = p_user;
  DELETE FROM public.connections WHERE requester_id = p_user OR recipient_id = p_user;

  -- Interest, subscriptions and reach-outs between them and a coach, either side.
  DELETE FROM public.training_interest WHERE athlete_id = p_user OR instructor_id = p_user;
  DELETE FROM public.session_subscriptions WHERE user_id = p_user OR instructor_id = p_user;
  DELETE FROM public.lead_reaches WHERE athlete_id = p_user OR instructor_id = p_user;

  -- Their gym clients stay with the gym, unassigned; a client with no gym is
  -- seen by nobody else, so it goes with them.
  UPDATE public.clients SET instructor_user_id = NULL WHERE instructor_user_id = p_user AND gym_id IS NOT NULL;
  DELETE FROM public.clients WHERE instructor_user_id = p_user AND gym_id IS NULL;

  -- Invite links: still live or never claimed go; used ones stay as history.
  DELETE FROM public.invite_tokens WHERE created_by = p_user AND (expires_at IS NULL OR expires_at >= now());
  DELETE FROM public.media_invites WHERE created_by = p_user AND claimed_by IS NULL;

  -- What they posted and uploaded (comments, likes, reports and tags on it cascade).
  DELETE FROM public.community_posts WHERE author_id = p_user;
  DELETE FROM public.instructor_posts WHERE author_id = p_user;
  DELETE FROM public.storefront_media WHERE user_id = p_user;
  DELETE FROM public.session_stories WHERE user_id = p_user;
  DELETE FROM public.session_recap_photos WHERE user_id = p_user;
  DELETE FROM public.session_media WHERE uploader_id = p_user;
  -- Their tags on Moments other people took.
  DELETE FROM public.session_media_tags WHERE user_id = p_user;
  UPDATE public.community_bulletin SET image_url = NULL
   WHERE author_id = p_user AND image_url IS NOT NULL;
  UPDATE public.sessions
     SET photos = ARRAY(SELECT u FROM unnest(photos) AS u WHERE strpos(u, v_folder) = 0)
   WHERE EXISTS (SELECT 1 FROM unnest(photos) AS u WHERE strpos(u, v_folder) > 0);
  UPDATE public.sessions
     SET recap_photos = ARRAY(SELECT u FROM unnest(recap_photos) AS u WHERE strpos(u, v_folder) = 0)
   WHERE EXISTS (SELECT 1 FROM unnest(recap_photos) AS u WHERE strpos(u, v_folder) > 0);

  -- What is still to come is cancelled; what already happened stays.
  UPDATE public.sessions SET status = 'cancelled'
   WHERE creator_id = p_user AND status IN ('active', 'upcoming') AND date >= v_today;
  UPDATE public.session_participants AS sp SET status = 'cancelled'
    FROM public.sessions AS s
   WHERE sp.session_id = s.id
     AND sp.user_id = p_user
     AND sp.status IN ('confirmed', 'pending')
     AND s.date >= v_today;
END
$fn$;

REVOKE ALL ON FUNCTION public.account_scrub(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_scrub(uuid) TO service_role;

-- ── 2. Assert the end state ─────────────────────────────────────────────────
DO $$
DECLARE
  v_fn regprocedure := to_regprocedure('public.account_scrub(uuid)');
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM '9de0736a23065ac4b5b44a4d516e0bbd' THEN
    RAISE EXCEPTION '232 ABORTED: account_scrub is not this file''s body after the replace.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn)
     OR NOT coalesce((SELECT 'search_path=""' = ANY (proconfig) FROM pg_proc WHERE oid = v_fn), false) THEN
    RAISE EXCEPTION '232 ABORTED: account_scrub is not SECURITY DEFINER with an empty search_path.';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '232 ABORTED: account_scrub is not service_role only.';
  END IF;
  RAISE NOTICE '232: account_scrub also sets coach_plan to basico and clears every coach_plan_* column.';
END $$;

-- ═══ PART S: the scrub ══════════════════════════════════════════════════════
CREATE TEMP TABLE reh232 (n int, arm text, state text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  k_pro   uuid := 'a2320000-0000-4000-8000-000000000001';
  k_amb   uuid := 'a2320000-0000-4000-8000-000000000002';
  k_ath   uuid := 'a2320000-0000-4000-8000-000000000003';
  k_other uuid := 'a2320000-0000-4000-8000-000000000004';
  k_admin uuid := 'a2320000-0000-4000-8000-000000000005';
  k_end   timestamptz := date_trunc('second', now()) + interval '20 days';
  r record;
  v_ok boolean;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (k_pro,   'reh-232-pro@example.com',   '{}'::jsonb),
    (k_amb,   'reh-232-amb@example.com',   '{}'::jsonb),
    (k_ath,   'reh-232-ath@example.com',   '{}'::jsonb),
    (k_other, 'reh-232-other@example.com', '{}'::jsonb),
    (k_admin, 'reh-232-admin@example.com', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  -- A stack with the auth trigger already made these; one without it gets them here.
  INSERT INTO public.users (id, name, email) VALUES
    (k_pro,   'Reh Pro',   'reh-232-pro@example.com'),
    (k_amb,   'Reh Amb',   'reh-232-amb@example.com'),
    (k_ath,   'Reh Ath',   'reh-232-ath@example.com'),
    (k_other, 'Reh Other', 'reh-232-other@example.com'),
    (k_admin, 'Reh Admin', 'reh-232-admin@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- The webhook's and the comp route's writes (no JWT here: auth.uid() is NULL).
  UPDATE public.users SET coach_plan = 'pro', coach_plan_status = 'active', coach_plan_source = 'stripe',
         coach_plan_stripe_customer_id = 'cus_reh232pro', coach_plan_stripe_subscription_id = 'sub_reh232pro',
         coach_plan_current_period_end = k_end
   WHERE id = k_pro;
  UPDATE public.users SET coach_plan = 'embajador', coach_plan_status = 'active', coach_plan_source = 'comp',
         coach_plan_granted_by = k_admin, coach_plan_granted_at = now()
   WHERE id = k_amb;
  UPDATE public.users SET coach_plan = 'crecimiento', coach_plan_status = 'active', coach_plan_source = 'stripe',
         coach_plan_stripe_customer_id = 'cus_reh232other', coach_plan_stripe_subscription_id = 'sub_reh232other',
         coach_plan_current_period_end = k_end
   WHERE id = k_other;

  PERFORM public.account_scrub(k_pro);
  PERFORM public.account_scrub(k_amb);
  PERFORM public.account_scrub(k_ath);

  -- S1-S3: each deleted account reads basico with every other column NULL.
  FOR r IN SELECT * FROM (VALUES
      (1, 'S1 a paying Pro coach is deleted: basico, all seven coach_plan_* NULL', k_pro),
      (2, 'S2 an Embajador comp is deleted: basico, all seven NULL', k_amb),
      (3, 'S3 a basico athlete is deleted: still basico, all seven NULL', k_ath)) AS t(n, arm, id)
  LOOP
    SELECT u.coach_plan = 'basico'
       AND u.coach_plan_status IS NULL AND u.coach_plan_source IS NULL
       AND u.coach_plan_stripe_customer_id IS NULL AND u.coach_plan_stripe_subscription_id IS NULL
       AND u.coach_plan_current_period_end IS NULL AND u.coach_plan_granted_by IS NULL
       AND u.coach_plan_granted_at IS NULL
      INTO v_ok FROM public.users u WHERE u.id = r.id;
    INSERT INTO reh232
    SELECT r.n, r.arm,
           concat_ws(' / ', coach_plan, coalesce(coach_plan_status, 'null'), coalesce(coach_plan_source, 'null'),
                     coalesce(coach_plan_stripe_customer_id, 'null'), coalesce(coach_plan_stripe_subscription_id, 'null'),
                     coalesce(coach_plan_current_period_end::text, 'null'), coalesce(coach_plan_granted_by::text, 'null'),
                     coalesce(coach_plan_granted_at::text, 'null')),
           coalesce(v_ok, false)
      FROM public.users WHERE id = r.id;
  END LOOP;

  -- S4: the rest of the scrub still happens (228's behaviour unchanged).
  INSERT INTO reh232
  SELECT t.n, t.arm,
         format('name=%s email_deleted=%s deleted_at=%s', name,
                email = 'deleted-' || k_pro::text || '@deleted.invalid', deleted_at IS NOT NULL),
         name = 'Usuario eliminado' AND email = 'deleted-' || k_pro::text || '@deleted.invalid' AND deleted_at IS NOT NULL
    FROM (VALUES
      (4, 'S4 the rest of the scrub still runs: name, email, deleted_at')) AS t(n, arm)
    CROSS JOIN public.users WHERE id = k_pro;

  -- S5: someone else's plan is untouched.
  INSERT INTO reh232
  SELECT t.n, t.arm,
         concat_ws(' / ', coach_plan, coach_plan_source, coach_plan_stripe_subscription_id),
         coach_plan = 'crecimiento' AND coach_plan_stripe_subscription_id = 'sub_reh232other'
           AND coach_plan_stripe_customer_id = 'cus_reh232other' AND coach_plan_current_period_end = k_end
    FROM (VALUES
      (5, 'S5 a coach who is not deleted keeps their plan')) AS t(n, arm)
    CROSS JOIN public.users WHERE id = k_other;

  -- S6: safe to run again (deleteAccount reruns a deletion that stopped).
  BEGIN
    PERFORM public.account_scrub(k_pro);
    INSERT INTO reh232
    SELECT t.n, t.arm,
           concat_ws(' / ', coach_plan, coalesce(coach_plan_stripe_subscription_id, 'null')),
           coach_plan = 'basico' AND coach_plan_stripe_subscription_id IS NULL
      FROM (VALUES
        (6, 'S6 a second scrub of the same account succeeds, plan still cleared')) AS t(n, arm)
      CROSS JOIN public.users WHERE id = k_pro;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh232 VALUES (6, 'S6 a second scrub of the same account succeeds, plan still cleared', SQLSTATE || ' ' || SQLERRM, false);
  END;
END $$;

-- ═══ PART T: the body is 228's plus the eight lines, nothing else ═══════════
DO $$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.account_scrub(uuid)'::regprocedure);
  v_from int;
  v_to int;
  v_stripped text;
  v_sets int;
BEGIN
  v_from := strpos(v_src, '    -- Their coach plan (231, T-PLAN1).');
  v_to := strpos(v_src, '    coach_plan_granted_at = NULL,' || chr(10));
  v_stripped := CASE WHEN v_from > 0 AND v_to > v_from
                     THEN left(v_src, v_from - 1) || substr(v_src, v_to + length('    coach_plan_granted_at = NULL,' || chr(10)))
                END;
  SELECT count(*) INTO v_sets
    FROM regexp_matches(v_src, '\n    coach_plan(_[a-z_]+)? = ', 'g');
  INSERT INTO reh232 VALUES
    (7, 'T1 with the coach-plan lines taken out, the body is 228''s exactly (md5)',
        coalesce(md5(v_stripped), '(lines not found)'), md5(v_stripped) IS NOT DISTINCT FROM 'e627bfb752710462c42fcd3730eb00eb'),
    (8, 'T2 the body sets all eight coach_plan columns', v_sets || ' of 8', v_sets = 8),
    (9, 'T3 232 is not recorded (the record row is outside this rehearsal)',
        (SELECT count(*) FROM public.migrations_applied WHERE migration LIKE '232%')::text,
        NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration LIKE '232%'));
END $$;

-- The one result set for the transaction. Every row must read PASS. 9 of 9.
SELECT n AS "#", CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, arm, state
  FROM reh232 ORDER BY n;

ROLLBACK;

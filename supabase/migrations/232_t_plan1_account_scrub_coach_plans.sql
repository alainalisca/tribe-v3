-- 232_t_plan1_account_scrub_coach_plans.sql
--
-- T-PLAN1: deleting an account forgets its coach plan.
-- NOT APPLIED when written (2026-10-23). Needs 231 first (the columns).
--
-- WHAT IT CHANGES. account_scrub (228) gains eight lines in its users UPDATE,
-- beside the other payment accounts:
--   coach_plan = 'basico', and coach_plan_status, coach_plan_source,
--   coach_plan_stripe_customer_id, coach_plan_stripe_subscription_id,
--   coach_plan_current_period_end, coach_plan_granted_by and
--   coach_plan_granted_at set to NULL.
-- Nothing else in the body changes: the function is 228's text with those
-- lines inserted, generated from the 228 file rather than retyped. Same
-- signature, SECURITY DEFINER, search_path '', service_role only (restated
-- below and checked after).
--
-- WHY NOT THE ROUTE. The scrub is the one transaction that clears a profile;
-- clearing the plan anywhere else could leave a deleted account showing "Pro"
-- if the run stopped between the two.
--
-- THE STRIPE SIDE IS NOT HERE. lib/account/deleteAccount cancels the coach-plan
-- subscription in Stripe (step cancel_plan: now, no proration, no further
-- invoice) BEFORE it touches anything, and stops the deletion if Stripe
-- refuses. By the time this runs there is nothing left to bill. A late
-- customer.subscription.deleted webhook finds no row (the webhook only ever
-- writes the row holding that subscription id, which is now NULL).
--
-- THE GUARDS ON users. users_coach_plan_guard (231) refuses coach_plan* writes
-- only while auth.uid() is set; deleteAccount calls this with the service role,
-- where auth.uid() is NULL. users_coach_plan_consistent (231) accepts basico
-- with every other coach_plan_* column NULL.
--
-- 230'S SCRUB MIRROR. 230 asks that a change to account_scrub update the list
-- in account_file_references in the same migration. That list is per table
-- (which rows are theirs), and the users row is already theirs whole
-- ('x.id = $1'). This adds columns to that row and no table, so the mirror is
-- unchanged and correct.
--
-- PRE-FLIGHT. 231 applied (eight coach_plan* columns and the guard), and
-- account_scrub is exactly 228's body (md5 of prosrc e627bfb752710462c42fcd3730eb00eb, the same in
-- the 228 file and on both local stacks, 2026-10-23) or already this file's
-- (9de0736a23065ac4b5b44a4d516e0bbd). Anything else is a later change this file would revert.
--
-- ROLLBACK: CREATE OR REPLACE account_scrub with 228's body (its md5 above).
--
-- RE-RUNNABLE. CREATE OR REPLACE, grants restated, ON CONFLICT DO NOTHING for
-- the record. One paste is one transaction (CLAUDE.md, the 188 correction).

BEGIN;

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

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('232_t_plan1_account_scrub_coach_plans',
        'T-PLAN1: account_scrub (228) also resets coach_plan to basico and nulls the seven coach_plan_* columns; deleteAccount cancels the Stripe subscription first')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

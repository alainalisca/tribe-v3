-- 228_t_del1_account_deletion.sql
--
-- T-DEL1: deleting an account removes everything personal and keeps the
-- anonymous history. NOT APPLIED when written (2026-10-23). Apply FIRST, then
-- merge the code: the code calls both functions below.
--
-- WHAT WAS WRONG. Read on production on 2026-10-23 with read-only SELECTs:
--   * softDeleteUser's anonymising update named users.phone, a column that
--     does not exist, so PostgREST rejected the whole update, and the error was
--     never checked. Its connections update set status 'cancelled', which the
--     connections status CHECK does not allow. 36 accounts have deleted_at set
--     (admin_delete_user sets only that); none was anonymised.
--   * users.id references auth.users ON DELETE CASCADE, and 70 tables cascade
--     from users (sessions, messages, reviews ...). Deleting the login, the
--     route's last step, would delete the profile and that history with it; a
--     row in any of the nine NO ACTION references to users (sessions.verified_by,
--     session_attendance.marked_by ...) makes the delete fail instead.
--
-- WHAT THIS DOES
--   1. Drops users_id_fkey, and only it, so an anonymised users row outlives
--      its login. Nothing else that references auth.users changes: deleting a
--      login still removes its auth.* rows, push subscriptions and the other
--      tables that reference auth.users directly.
--   2. public.account_deletion_files(uuid) lists the person's uploads as
--      (bucket, path), for the route to delete through the Storage API (rows of
--      storage.objects cannot be deleted directly):
--        - every object they own (storage.objects.owner / owner_id), except a
--          community's cover and banner, which belong to the community;
--        - their coach-card crop, cut by the server with no owner:
--          profile-images/card-photos/<id>-<hash>.jpg (lib/og/coachCard.ts);
--        - recap photos, uploaded by the server into
--          session-recap-photos/<session>/<id>/ with no owner;
--        - Moments they uploaded: moments/<session>/<media>.jpg and its two
--          variants (lib/moments/paths.ts), through session_media.uploader_id.
--   3. public.account_scrub(uuid), one transaction:
--        - users: every personal column cleared (the list is in the function,
--          with the reason for each group); name "Usuario eliminado", email
--          deleted-<id>@deleted.invalid, deleted_at, is_active false, is_admin
--          false. Kept: ids, counters, money totals, plans, settings, and the
--          consent records (terms and safety waiver, accepted and when).
--        - deleted: user_private (bank account, ID number, emergency contact,
--          date of birth), push_subscriptions, notification_preferences,
--          user_training_preferences, user_follows both ways, connections both
--          ways, their community posts and instructor posts (comments, likes and
--          reports on them cascade), storefront gallery, stories, recap photo
--          rows, Moments they uploaded and every tag of them on anyone's photo.
--        - cleared: their links in sessions.photos and recap_photos, and the
--          image on their bulletin posts.
--        - cancelled: sessions they host from today (Bogotá) on, and their
--          confirmed or pending spots in sessions from today on. Past sessions,
--          spots, attendance, messages and reviews stay, under the anonymous row.
--      The profile is cleared before anything is cancelled, so a notification a
--      cancellation sends carries "Usuario eliminado", never the name.
--   Both functions are SECURITY DEFINER with an empty search_path, and only
--   service_role may execute them. The users guards let them through: each
--   one passes when auth.uid() is NULL, which it is for the service role, and
--   guard_signup_attribution allows exactly this erasure (every column NULL).
--
-- NOT CHANGED: admin_delete_user. The admin route stops calling it in the same
-- PR (it now runs the in-app path); dropping it is a separate migration, so the
-- deployed admin route keeps working between this apply and that merge.
--
-- ROLLBACK: DROP both functions. Re-adding users_id_fkey fails once any account
-- has been deleted (its users row has no login any more), by design; add it
-- back NOT VALID if it is ever needed.
--
-- GUARDS. pg_temp.m228_fk() names the state of users_id_fkey or aborts:
--   'captured'  exactly FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
--   'absent'    gone (a re-run)
--   ABORT       anything else; read it before dropping it.
-- After: the constraint is gone, users still has its primary key, both
-- functions exist as SECURITY DEFINER with search_path '', and only
-- service_role can execute them.

BEGIN;

CREATE FUNCTION pg_temp.m228_fk() RETURNS text LANGUAGE plpgsql AS $shape$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.users') AND c.conname = 'users_id_fkey';
  IF v_def IS NULL THEN
    RETURN 'absent';
  END IF;
  IF v_def <> 'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE' THEN
    RAISE EXCEPTION '228 ABORTED: users_id_fkey is "%", not the cascade captured on 2026-10-23; read it before dropping it.', v_def;
  END IF;
  RETURN 'captured';
END $shape$;

DO $$
BEGIN
  RAISE NOTICE '228 pre-flight: users_id_fkey %', pg_temp.m228_fk();
END $$;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- ── 2. The person's uploads, for the route to delete through the Storage API
CREATE OR REPLACE FUNCTION public.account_deletion_files(p_user uuid)
RETURNS TABLE (bucket text, path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  -- Everything they uploaded. A community's cover and banner belong to the
  -- community, not to whoever uploaded them, and stay.
  SELECT o.bucket_id::text, o.name
    FROM storage.objects o
   WHERE (o.owner = p_user OR o.owner_id = p_user::text)
     AND o.bucket_id <> 'community-banners'
     AND NOT (o.bucket_id = 'profile-images' AND o.name LIKE 'community-covers/%')
  UNION
  -- Their coach-card crop, cut by the server: no owner, named by their id.
  SELECT o.bucket_id::text, o.name
    FROM storage.objects o
   WHERE o.bucket_id = 'profile-images'
     AND o.name LIKE 'card-photos/' || p_user::text || '-%'
  UNION
  -- Recap photos, uploaded by the server into <session>/<user>/: no owner.
  SELECT o.bucket_id::text, o.name
    FROM storage.objects o
   WHERE o.bucket_id = 'session-recap-photos'
     AND split_part(o.name, '/', 2) = p_user::text
  UNION
  -- Moments they uploaded: the original and its viewer and grid variants.
  SELECT o.bucket_id::text, o.name
    FROM storage.objects o
    JOIN public.session_media m ON m.uploader_id = p_user
   WHERE o.bucket_id = 'moments'
     AND o.name IN (m.storage_path, m.storage_path || '.1200.webp', m.storage_path || '.400.webp');
$fn$;

-- ── 3. Everything personal in the database, in one transaction
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

REVOKE ALL ON FUNCTION public.account_deletion_files(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_scrub(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_files(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_scrub(uuid) TO service_role;

DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  IF pg_temp.m228_fk() <> 'absent' THEN
    RAISE EXCEPTION '228 ABORTED: users_id_fkey is still there after the drop.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.users') AND conname = 'users_pkey' AND contype = 'p') THEN
    RAISE EXCEPTION '228 ABORTED: users has lost its primary key; 228 drops one foreign key and nothing else.';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[to_regprocedure('public.account_deletion_files(uuid)'),
                              to_regprocedure('public.account_scrub(uuid)')] LOOP
    IF v_fn IS NULL THEN
      RAISE EXCEPTION '228 ABORTED: a deletion function is missing after create.';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn)
       OR NOT coalesce((SELECT 'search_path=""' = ANY (proconfig) FROM pg_proc WHERE oid = v_fn), false) THEN
      RAISE EXCEPTION '228 ABORTED: % is not SECURITY DEFINER with an empty search_path.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '228 ABORTED: % must be executable by service_role only.', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE '228: users_id_fkey dropped; account_deletion_files and account_scrub are service_role only.';
END $$;

-- ── Record this migration as applied
INSERT INTO public.migrations_applied (migration, note)
VALUES ('228_t_del1_account_deletion',
        'T-DEL1: users row outlives its login; account_deletion_files + account_scrub (service_role) for the one deletion path')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

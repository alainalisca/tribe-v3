-- 228_t_del1_account_deletion_REHEARSAL.sql. Dry run of 228. Applies nothing.
--
-- Run it with scripts/av-rehearse.sh, never by hand:
--
--   scripts/av-rehearse.sh 228_t_del1_account_deletion
--
-- PART M IS 228'S BODY, SPLICED VERBATIM (supabase/rehearsalBodyVerbatim.test.ts):
-- everything between the migration's own BEGIN and its "Record this migration
-- as applied" marker, guards and comments included, never retyped. Re-splice
-- after editing the migration. T0 checks the transaction id is the same after
-- the body as before it, so a COMMIT that slipped in is a FAIL row.
--
-- One transaction, ended by ROLLBACK. Every row must read PASS.
--
-- FIXTURE (inside the transaction): X, a new account with a login, every
-- personal column filled, a row in every side table, files in every bucket
-- the listing covers, past and upcoming sessions both ways, a chat message, a
-- review, Moments and tags; O, an existing non-admin account that must come
-- through untouched. Storage rows are inserted directly; the Storage API
-- delete itself is proved by lib/account/deleteAccount.local.test.ts.
--
-- ARMS
--   B   before 228: deleting X's login cascades away X's users row (the
--       history-loss this fixes).
--   A   after 228: the constraint is gone; both functions are SECURITY DEFINER,
--       search_path '', service_role only; the listing returns exactly X's
--       uploads; the scrub, run as service_role, clears every personal column,
--       empties every side table, cancels only what is still to come, keeps the
--       history and the consent records, leaves O untouched; and deleting X's
--       login now leaves the anonymous users row.
--   G   the constraint check, against shapes built to fail.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_228 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_228_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_228_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;
CREATE TEMP TABLE reh_228_before (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE FUNCTION pg_temp.id(p_k text) RETURNS uuid LANGUAGE sql AS $f$
  SELECT v FROM reh_228_ids WHERE k = p_k;
$f$;

CREATE FUNCTION pg_temp.arm(p_arm text, p_ok boolean, p_detail text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO reh_228 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, coalesce(p_detail, '<null>'));
$f$;

-- Builds a shape inside a subtransaction, calls the migration's own check,
-- records what it said, and rolls the shape back.
CREATE FUNCTION pg_temp.reh_shape(p_arm text, p_expect text, p_build text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_got text;
BEGIN
  BEGIN
    EXECUTE p_build;
    v_got := pg_temp.m228_fk();
    RAISE EXCEPTION 'reh_228 undo' USING ERRCODE = 'P0228';
  EXCEPTION
    WHEN SQLSTATE 'P0228' THEN NULL;
    WHEN others THEN v_got := 'error=' || SQLERRM;
  END;
  PERFORM pg_temp.arm(p_arm, v_got LIKE p_expect, format('expected %s, got %s', p_expect, coalesce(v_got, '<null>')));
END $f$;

SELECT pg_temp.arm('E0 ENV session_user and current_user', true, format('session_user=%s current_user=%s', session_user, current_user));

-- ── F. Fixture ─────────────────────────────────────────────────────────────
DO $f$
DECLARE
  x uuid := gen_random_uuid();
  o uuid;
  c uuid;
  s_past uuid; s_future uuid; s_o_past uuid; s_o_future uuid;
  m_x uuid; m_o uuid;
  folder text;
BEGIN
  SELECT id INTO o FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL AND NOT coalesce(is_test_account, false) = true
   ORDER BY created_at LIMIT 1;
  IF o IS NULL THEN
    SELECT id INTO o FROM public.users WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  END IF;
  IF o IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need one existing non-admin user for O.';
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES (x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reh228-' || x || '@test.local', '',
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
  -- A trigger may already have made the users row for the login; fill it either way.
  INSERT INTO public.users (id, email) VALUES (x, 'reh228-' || x || '@test.local') ON CONFLICT (id) DO NOTHING;

  UPDATE public.users SET
    name = 'Rehearsal Ximena', username = 'reh228x', handle = 'reh228x', bio = 'bio', instructor_bio = 'coach bio',
    instagram_username = 'reh228x', facebook_url = 'https://facebook.com/x', website_url = 'https://x.test',
    location = 'Laureles', location_lat = 6.2, location_lng = -75.6, timezone = 'America/New_York',
    avatar_url = 'https://x/avatars/' || x || '/a.jpg', banner_url = 'https://x/b.jpg', photos = ARRAY['https://x/p.jpg'],
    cover_image_url = 'https://x/c.jpg', card_photo_url = 'https://x/card.jpg',
    card_photo_box = '{"x0":0,"y0":0,"x1":1,"y1":1}', card_photo_rejects = ARRAY['https://x/r.jpg'],
    storefront_banner_url = 'https://x/sb.jpg', storefront_video_url = 'https://x/v.mp4', storefront_tagline = 'tagline',
    specialties = ARRAY['boxing'], certifications = ARRAY['cert'], years_experience = 5,
    verified_credentials = '{"a":1}', sports = ARRAY['Boxing'], preferred_sports = ARRAY['Boxing'],
    seeking_trainer = true, seeking_trainer_sports = ARRAY['Boxing'], seeking_trainer_budget = 'any',
    seeking_trainer_schedule = 'mornings', seeking_trainer_note = 'note',
    push_subscription = '{"endpoint":"e"}', fcm_token = 'tok', fcm_platform = 'ios', fcm_updated_at = now(),
    wompi_merchant_id = 'w', stripe_account_id = 'acct', tribe_os_stripe_customer_id = 'cus', tribe_os_stripe_subscription_id = 'sub',
    subscription_gateway_id = 'gw',
    signup_src = 'qr', signup_code = 'C1', signup_ref = 'r', signup_utm_source = 's', signup_utm_medium = 'm',
    signup_utm_campaign = 'c', signup_utm_content = 'x', signup_landing_path = '/i/x', signup_first_touch = '{"a":1}',
    signup_attributed_at = now(), referral_code = 'REH228X', referred_by = o,
    preferred_language = 'es', preferred_language_set_at = now(), last_login_at = now(), last_seen_release = 'r1',
    terms_accepted = true, terms_accepted_at = now() - interval '30 days',
    safety_waiver_accepted = true, safety_waiver_accepted_at = now() - interval '30 days',
    total_reviews = 7, is_instructor = true
  WHERE id = x;

  INSERT INTO public.user_private (user_id, payout_account_number, payout_document_number, emergency_contact_name,
                                   emergency_contact_phone, date_of_birth)
  VALUES (x, '000123', 'CC123', 'Mamá', '3000000000', '1990-01-01')
  ON CONFLICT (user_id) DO UPDATE SET payout_account_number = EXCLUDED.payout_account_number;
  INSERT INTO public.push_subscriptions (user_id, subscription) VALUES (x, '{"endpoint":"e"}');
  INSERT INTO public.notification_preferences (user_id) VALUES (x) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_training_preferences (user_id, preferred_sports) VALUES (x, ARRAY['Boxing']);
  INSERT INTO public.user_follows (follower_id, following_id) VALUES (x, o), (o, x);
  INSERT INTO public.connections (requester_id, recipient_id, status) VALUES (x, o, 'accepted');

  INSERT INTO public.communities (name, creator_id) VALUES ('Rehearsal 228 community', o) RETURNING id INTO c;
  INSERT INTO public.community_posts (community_id, author_id, content, media_url)
  VALUES (c, x, 'X post', 'https://x/media/community-posts/' || x || '/m.jpg'),
         (c, o, 'O post', NULL);
  INSERT INTO public.instructor_posts (author_id, content) VALUES (x, 'X coach post');
  INSERT INTO public.storefront_media (user_id, media_url, media_type) VALUES (x, 'https://x/g.jpg', 'image');
  INSERT INTO public.community_bulletin (author_id, title, image_url) VALUES (x, 'X flyer', 'https://x/flyer.jpg');

  folder := '/session-photos/' || x || '/';
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status, photos, recap_photos)
  VALUES (x, 'Boxing', current_date - 10, '07:00', 60, 'Rehearsal 228 past', 10, 'active',
          ARRAY['https://cdn' || folder || 'past.jpg', 'https://cdn/session-photos/other/keep.jpg'],
          ARRAY['https://cdn' || folder || 'recap.jpg'])
  RETURNING id INTO s_past;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (x, 'Boxing', current_date + 10, '07:00', 60, 'Rehearsal 228 future', 10, 'active') RETURNING id INTO s_future;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (o, 'Boxing', current_date - 9, '07:00', 60, 'Rehearsal 228 O past', 10, 'active') RETURNING id INTO s_o_past;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (o, 'Boxing', current_date + 9, '07:00', 60, 'Rehearsal 228 O future', 10, 'active') RETURNING id INTO s_o_future;
  INSERT INTO public.session_participants (session_id, user_id, status)
  VALUES (s_o_past, x, 'confirmed'), (s_o_future, x, 'confirmed'), (s_past, o, 'confirmed');

  INSERT INTO public.chat_messages (session_id, user_id, message) VALUES (s_o_past, x, 'X said this');
  INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating, comment) VALUES (s_o_past, x, o, 5, 'Gran clase');
  INSERT INTO public.session_stories (session_id, user_id, media_url, media_type) VALUES (s_o_past, x, 'https://x/story.mp4', 'video');
  INSERT INTO public.session_recap_photos (session_id, user_id, photo_url) VALUES (s_o_past, x, 'https://x/recap.jpg');

  INSERT INTO public.session_media (session_id, uploader_id, storage_path)
  VALUES (s_o_past, x, s_o_past || '/' || gen_random_uuid() || '.jpg') RETURNING id INTO m_x;
  INSERT INTO public.session_media (session_id, uploader_id, storage_path)
  VALUES (s_o_past, o, s_o_past || '/' || gen_random_uuid() || '.jpg') RETURNING id INTO m_o;
  INSERT INTO public.session_media_tags (media_id, user_id, tagged_by) VALUES (m_x, o, x), (m_o, x, o);

  -- Buckets the listing reads, made here if the local stack lacks them.
  INSERT INTO storage.buckets (id, name, public)
  SELECT b, b, true FROM unnest(ARRAY['profile-images','media','session-photos','session-recap-photos','session-stories',
                                      'moments','community-banners','community-bulletin-flyers']) b
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES
    ('profile-images', 'avatars/' || x || '/a.jpg', x, x::text),
    ('profile-images', 'banners/b.jpg', x, x::text),
    ('profile-images', 'photos/p.jpg', x, x::text),
    ('media', 'storefront-banners/' || x || '/sb.jpg', x, x::text),
    ('media', 'community-posts/' || x || '/m.jpg', x, x::text),
    ('session-photos', x || '/past.jpg', x, x::text),
    ('session-stories', s_o_past || '/' || x || '/story.mp4', x, x::text),
    ('community-bulletin-flyers', x || '/flyer.jpg', x, x::text),
    ('profile-images', 'card-photos/' || x || '-0123456789abcdef.jpg', NULL, NULL),
    ('session-recap-photos', s_o_past || '/' || x || '/recap.jpg', NULL, NULL),
    ('moments', (SELECT storage_path FROM public.session_media WHERE id = m_x), NULL, NULL),
    ('moments', (SELECT storage_path FROM public.session_media WHERE id = m_x) || '.1200.webp', NULL, NULL),
    ('moments', (SELECT storage_path FROM public.session_media WHERE id = m_x) || '.400.webp', NULL, NULL),
    -- Not X's: a community's cover and banner X uploaded, O's files, O's Moment.
    ('profile-images', 'community-covers/' || c || '/cover.jpg', x, x::text),
    ('community-banners', c || '/banner.jpg', x, x::text),
    ('profile-images', 'avatars/' || o || '/rehearsal-o.jpg', o, o::text),
    ('moments', (SELECT storage_path FROM public.session_media WHERE id = m_o), NULL, NULL);

  INSERT INTO reh_228_ids VALUES ('X', x), ('O', o), ('C', c), ('S_past', s_past), ('S_future', s_future),
    ('S_o_past', s_o_past), ('S_o_future', s_o_future), ('M_x', m_x), ('M_o', m_o);
  INSERT INTO reh_228_before VALUES
    ('o_row', (SELECT md5(row(name, email, avatar_url, bio)::text) FROM public.users WHERE id = o)),
    ('terms', (SELECT terms_accepted_at::text FROM public.users WHERE id = x));
END $f$;

-- ── B. Before 228 ──────────────────────────────────────────────────────────
-- Either outcome is the bug: the cascade takes the profile and its history, or
-- a NO ACTION reference to users (X's bulletin post, community_bulletin.author_id)
-- refuses the delete, which is how the route came to answer "Failed to remove login".
DO $b$
DECLARE
  v_gone boolean;
  v_err text;
BEGIN
  BEGIN
    DELETE FROM auth.users WHERE id = pg_temp.id('X');
    v_gone := NOT EXISTS (SELECT 1 FROM public.users WHERE id = pg_temp.id('X'));
    RAISE EXCEPTION 'undo' USING ERRCODE = 'P0228';
  EXCEPTION
    WHEN SQLSTATE 'P0228' THEN NULL;
    WHEN foreign_key_violation THEN v_err := SQLERRM;
  END;
  PERFORM pg_temp.arm('B1 before 228: deleting the login takes the profile, or is refused',
                      v_gone IS TRUE OR v_err IS NOT NULL,
                      coalesce('refused: ' || v_err, format('users row gone with the login: %s', v_gone)));
END $b$;

INSERT INTO reh_228_tx VALUES ('before', txid_current());

-- ══════════════════════════════════════════════════════════════════════════
-- PART M. 228's body, verbatim.
-- ══════════════════════════════════════════════════════════════════════════
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

-- ══════════════════════════════════════════════════════════════════════════
-- A. After 228
-- ══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.arm('T0 the body did not commit (same transaction before and after)',
                   (SELECT v FROM reh_228_tx WHERE k = 'before') = txid_current(),
                   format('txid before=%s after=%s', (SELECT v FROM reh_228_tx WHERE k = 'before'), txid_current()));

SELECT pg_temp.arm('A1 users_id_fkey is gone, the primary key is not',
                   NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND conname = 'users_id_fkey')
                   AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND contype = 'p'),
                   'pg_constraint');

SELECT pg_temp.arm('A2 both functions: SECURITY DEFINER, search_path empty, service_role only',
                   count(*) = 2 AND bool_and(prosecdef AND 'search_path=""' = ANY (proconfig)
                                             AND NOT has_function_privilege('anon', oid, 'EXECUTE')
                                             AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
                                             AND has_function_privilege('service_role', oid, 'EXECUTE')),
                   string_agg(proname || ' ' || coalesce(array_to_string(proconfig, ','), '-'), '; '))
  FROM pg_proc WHERE oid IN ('public.account_deletion_files(uuid)'::regprocedure, 'public.account_scrub(uuid)'::regprocedure);

DO $l$
DECLARE
  x uuid := pg_temp.id('X');
  v_got text[];
  v_want text[];
BEGIN
  SELECT array_agg(bucket || ':' || path ORDER BY bucket, path) INTO v_got FROM public.account_deletion_files(x);
  SELECT array_agg(b || ':' || n ORDER BY b, n) INTO v_want FROM (VALUES
    ('profile-images', 'avatars/' || x || '/a.jpg'),
    ('profile-images', 'banners/b.jpg'),
    ('profile-images', 'photos/p.jpg'),
    ('media', 'storefront-banners/' || x || '/sb.jpg'),
    ('media', 'community-posts/' || x || '/m.jpg'),
    ('session-photos', x || '/past.jpg'),
    ('session-stories', pg_temp.id('S_o_past') || '/' || x || '/story.mp4'),
    ('community-bulletin-flyers', x || '/flyer.jpg'),
    ('profile-images', 'card-photos/' || x || '-0123456789abcdef.jpg'),
    ('session-recap-photos', pg_temp.id('S_o_past') || '/' || x || '/recap.jpg'),
    ('moments', (SELECT storage_path FROM public.session_media WHERE id = pg_temp.id('M_x'))),
    ('moments', (SELECT storage_path FROM public.session_media WHERE id = pg_temp.id('M_x')) || '.1200.webp'),
    ('moments', (SELECT storage_path FROM public.session_media WHERE id = pg_temp.id('M_x')) || '.400.webp')) w(b, n);
  PERFORM pg_temp.arm('A3 the listing is exactly X''s 13 uploads: no community cover or banner, nothing of O''s',
                      v_got = v_want, format('%s listed', coalesce(cardinality(v_got), 0)));
END $l$;

-- The scrub, as the route runs it: service_role, no signed-in user.
DO $s$
DECLARE
  v_err text;
  -- Read before the role switch: service_role cannot read this session's temp tables.
  v_x uuid := pg_temp.id('X');
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.account_scrub(v_x);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN others THEN
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.arm('A4 account_scrub runs as service_role', v_err IS NULL, coalesce(v_err, 'ok'));
END $s$;

DO $c$
DECLARE
  x uuid := pg_temp.id('X');
  r public.users;
  v_left text[] := '{}';
BEGIN
  SELECT * INTO r FROM public.users WHERE id = x;
  IF r.email <> 'deleted-' || x || '@deleted.invalid' THEN v_left := array_append(v_left, 'email'); END IF;
  IF r.name <> 'Usuario eliminado' THEN v_left := array_append(v_left, 'name'); END IF;
  IF r.username IS NOT NULL THEN v_left := array_append(v_left, 'username'); END IF;
  IF r.handle IS NOT NULL THEN v_left := array_append(v_left, 'handle'); END IF;
  IF r.bio IS NOT NULL THEN v_left := array_append(v_left, 'bio'); END IF;
  IF r.instructor_bio IS NOT NULL THEN v_left := array_append(v_left, 'instructor_bio'); END IF;
  IF r.instagram_username IS NOT NULL THEN v_left := array_append(v_left, 'instagram_username'); END IF;
  IF r.facebook_url IS NOT NULL THEN v_left := array_append(v_left, 'facebook_url'); END IF;
  IF r.website_url IS NOT NULL THEN v_left := array_append(v_left, 'website_url'); END IF;
  IF r.location IS NOT NULL THEN v_left := array_append(v_left, 'location'); END IF;
  IF r.location_lat IS NOT NULL THEN v_left := array_append(v_left, 'location_lat'); END IF;
  IF r.location_lng IS NOT NULL THEN v_left := array_append(v_left, 'location_lng'); END IF;
  IF r.timezone <> 'America/Bogota' THEN v_left := array_append(v_left, 'timezone'); END IF;
  IF r.avatar_url IS NOT NULL THEN v_left := array_append(v_left, 'avatar_url'); END IF;
  IF r.banner_url IS NOT NULL THEN v_left := array_append(v_left, 'banner_url'); END IF;
  IF r.photos <> '{}' THEN v_left := array_append(v_left, 'photos'); END IF;
  IF r.cover_image_url IS NOT NULL THEN v_left := array_append(v_left, 'cover_image_url'); END IF;
  IF r.card_photo_url IS NOT NULL THEN v_left := array_append(v_left, 'card_photo_url'); END IF;
  IF r.card_photo_box IS NOT NULL THEN v_left := array_append(v_left, 'card_photo_box'); END IF;
  IF r.card_photo_rejects <> '{}' THEN v_left := array_append(v_left, 'card_photo_rejects'); END IF;
  IF r.storefront_banner_url IS NOT NULL THEN v_left := array_append(v_left, 'storefront_banner_url'); END IF;
  IF r.storefront_video_url IS NOT NULL THEN v_left := array_append(v_left, 'storefront_video_url'); END IF;
  IF r.storefront_tagline IS NOT NULL THEN v_left := array_append(v_left, 'storefront_tagline'); END IF;
  IF r.specialties <> '{}' THEN v_left := array_append(v_left, 'specialties'); END IF;
  IF r.certifications <> '{}' THEN v_left := array_append(v_left, 'certifications'); END IF;
  IF r.years_experience IS NOT NULL THEN v_left := array_append(v_left, 'years_experience'); END IF;
  IF r.verified_credentials <> '{}' THEN v_left := array_append(v_left, 'verified_credentials'); END IF;
  IF r.sports IS NOT NULL THEN v_left := array_append(v_left, 'sports'); END IF;
  IF r.preferred_sports <> '{}' THEN v_left := array_append(v_left, 'preferred_sports'); END IF;
  IF r.seeking_trainer THEN v_left := array_append(v_left, 'seeking_trainer'); END IF;
  IF r.seeking_trainer_sports <> '{}' THEN v_left := array_append(v_left, 'seeking_trainer_sports'); END IF;
  IF r.seeking_trainer_budget IS NOT NULL THEN v_left := array_append(v_left, 'seeking_trainer_budget'); END IF;
  IF r.seeking_trainer_schedule IS NOT NULL THEN v_left := array_append(v_left, 'seeking_trainer_schedule'); END IF;
  IF r.seeking_trainer_note IS NOT NULL THEN v_left := array_append(v_left, 'seeking_trainer_note'); END IF;
  IF r.push_subscription IS NOT NULL THEN v_left := array_append(v_left, 'push_subscription'); END IF;
  IF r.fcm_token IS NOT NULL THEN v_left := array_append(v_left, 'fcm_token'); END IF;
  IF r.fcm_platform IS NOT NULL THEN v_left := array_append(v_left, 'fcm_platform'); END IF;
  IF r.fcm_updated_at IS NOT NULL THEN v_left := array_append(v_left, 'fcm_updated_at'); END IF;
  IF r.wompi_merchant_id IS NOT NULL THEN v_left := array_append(v_left, 'wompi_merchant_id'); END IF;
  IF r.stripe_account_id IS NOT NULL THEN v_left := array_append(v_left, 'stripe_account_id'); END IF;
  IF r.tribe_os_stripe_customer_id IS NOT NULL THEN v_left := array_append(v_left, 'tribe_os_stripe_customer_id'); END IF;
  IF r.tribe_os_stripe_subscription_id IS NOT NULL THEN v_left := array_append(v_left, 'tribe_os_stripe_subscription_id'); END IF;
  IF r.subscription_gateway_id IS NOT NULL THEN v_left := array_append(v_left, 'subscription_gateway_id'); END IF;
  IF r.signup_src IS NOT NULL THEN v_left := array_append(v_left, 'signup_src'); END IF;
  IF r.signup_code IS NOT NULL THEN v_left := array_append(v_left, 'signup_code'); END IF;
  IF r.signup_ref IS NOT NULL THEN v_left := array_append(v_left, 'signup_ref'); END IF;
  IF r.signup_utm_source IS NOT NULL THEN v_left := array_append(v_left, 'signup_utm_source'); END IF;
  IF r.signup_utm_medium IS NOT NULL THEN v_left := array_append(v_left, 'signup_utm_medium'); END IF;
  IF r.signup_utm_campaign IS NOT NULL THEN v_left := array_append(v_left, 'signup_utm_campaign'); END IF;
  IF r.signup_utm_content IS NOT NULL THEN v_left := array_append(v_left, 'signup_utm_content'); END IF;
  IF r.signup_landing_path IS NOT NULL THEN v_left := array_append(v_left, 'signup_landing_path'); END IF;
  IF r.signup_first_touch IS NOT NULL THEN v_left := array_append(v_left, 'signup_first_touch'); END IF;
  IF r.signup_attributed_at IS NOT NULL THEN v_left := array_append(v_left, 'signup_attributed_at'); END IF;
  IF r.referral_code IS NOT NULL THEN v_left := array_append(v_left, 'referral_code'); END IF;
  IF r.referred_by IS NOT NULL THEN v_left := array_append(v_left, 'referred_by'); END IF;
  IF r.preferred_language IS NOT NULL THEN v_left := array_append(v_left, 'preferred_language'); END IF;
  IF r.preferred_language_set_at IS NOT NULL THEN v_left := array_append(v_left, 'preferred_language_set_at'); END IF;
  IF r.last_login_at IS NOT NULL THEN v_left := array_append(v_left, 'last_login_at'); END IF;
  IF r.last_seen_release IS NOT NULL THEN v_left := array_append(v_left, 'last_seen_release'); END IF;
  IF r.deleted_at IS NULL THEN v_left := array_append(v_left, 'deleted_at (not set)'); END IF;
  IF r.is_active THEN v_left := array_append(v_left, 'is_active'); END IF;
  IF r.is_admin THEN v_left := array_append(v_left, 'is_admin'); END IF;
  PERFORM pg_temp.arm('A5 every personal users column is cleared (68 checked)', cardinality(v_left) = 0,
                      CASE WHEN cardinality(v_left) = 0 THEN 'none left' ELSE 'left: ' || array_to_string(v_left, ', ') END);
  PERFORM pg_temp.arm('A6 kept: the consent records, the counters, the instructor flag',
                      r.terms_accepted AND r.terms_accepted_at::text = (SELECT v FROM reh_228_before WHERE k = 'terms')
                      AND r.safety_waiver_accepted AND r.total_reviews = 7 AND r.is_instructor,
                      format('terms_accepted_at=%s total_reviews=%s', r.terms_accepted_at, r.total_reviews));
END $c$;

SELECT pg_temp.arm('A7 ' || t || ' has no row of X''s', n = 0, n || ' row(s)')
  FROM (VALUES
    ('user_private', (SELECT count(*) FROM public.user_private WHERE user_id = pg_temp.id('X'))),
    ('push_subscriptions', (SELECT count(*) FROM public.push_subscriptions WHERE user_id = pg_temp.id('X'))),
    ('notification_preferences', (SELECT count(*) FROM public.notification_preferences WHERE user_id = pg_temp.id('X'))),
    ('user_training_preferences', (SELECT count(*) FROM public.user_training_preferences WHERE user_id = pg_temp.id('X'))),
    ('user_follows', (SELECT count(*) FROM public.user_follows WHERE pg_temp.id('X') IN (follower_id, following_id))),
    ('connections', (SELECT count(*) FROM public.connections WHERE pg_temp.id('X') IN (requester_id, recipient_id))),
    ('community_posts', (SELECT count(*) FROM public.community_posts WHERE author_id = pg_temp.id('X'))),
    ('instructor_posts', (SELECT count(*) FROM public.instructor_posts WHERE author_id = pg_temp.id('X'))),
    ('storefront_media', (SELECT count(*) FROM public.storefront_media WHERE user_id = pg_temp.id('X'))),
    ('session_stories', (SELECT count(*) FROM public.session_stories WHERE user_id = pg_temp.id('X'))),
    ('session_recap_photos', (SELECT count(*) FROM public.session_recap_photos WHERE user_id = pg_temp.id('X'))),
    ('session_media', (SELECT count(*) FROM public.session_media WHERE uploader_id = pg_temp.id('X'))),
    ('session_media_tags (X tagged)', (SELECT count(*) FROM public.session_media_tags WHERE user_id = pg_temp.id('X'))),
    ('session_media_tags (on X''s media)', (SELECT count(*) FROM public.session_media_tags WHERE media_id = pg_temp.id('M_x')))
  ) v(t, n);

SELECT pg_temp.arm('A8 the bulletin flyer keeps its post and loses its image',
                   (SELECT count(*) = 1 AND bool_and(image_url IS NULL) FROM public.community_bulletin WHERE author_id = pg_temp.id('X')),
                   'community_bulletin');

SELECT pg_temp.arm('A9 sessions lose only the links into X''s folder',
                   photos = ARRAY['https://cdn/session-photos/other/keep.jpg'] AND recap_photos = '{}',
                   format('photos=%s recap=%s', photos, recap_photos))
  FROM public.sessions WHERE id = pg_temp.id('S_past');

SELECT pg_temp.arm('A10 what is still to come is cancelled: X''s future session and X''s future spot',
                   (SELECT status FROM public.sessions WHERE id = pg_temp.id('S_future')) = 'cancelled'
                   AND (SELECT status FROM public.session_participants
                         WHERE session_id = pg_temp.id('S_o_future') AND user_id = pg_temp.id('X')) = 'cancelled',
                   'sessions, session_participants');

SELECT pg_temp.arm('A11 what happened stays: X''s past session, X''s past spot, O''s spot on X''s session',
                   (SELECT status FROM public.sessions WHERE id = pg_temp.id('S_past')) = 'active'
                   AND (SELECT status FROM public.session_participants
                         WHERE session_id = pg_temp.id('S_o_past') AND user_id = pg_temp.id('X')) = 'confirmed'
                   AND (SELECT status FROM public.session_participants
                         WHERE session_id = pg_temp.id('S_past') AND user_id = pg_temp.id('O')) = 'confirmed',
                   'sessions, session_participants');

SELECT pg_temp.arm('A12 X''s chat message and review stay, under the anonymous row',
                   EXISTS (SELECT 1 FROM public.chat_messages WHERE user_id = pg_temp.id('X') AND message = 'X said this')
                   AND EXISTS (SELECT 1 FROM public.reviews WHERE reviewer_id = pg_temp.id('X') AND rating = 5 AND comment = 'Gran clase'),
                   'chat_messages, reviews');

SELECT pg_temp.arm('A13 O is untouched: O''s row, O''s community post, O''s Moment',
                   (SELECT md5(row(name, email, avatar_url, bio)::text) FROM public.users WHERE id = pg_temp.id('O'))
                     = (SELECT v FROM reh_228_before WHERE k = 'o_row')
                   AND EXISTS (SELECT 1 FROM public.community_posts WHERE author_id = pg_temp.id('O') AND content = 'O post')
                   AND EXISTS (SELECT 1 FROM public.session_media WHERE id = pg_temp.id('M_o')),
                   'users, community_posts, session_media');

DO $d$
DECLARE
  v_kept boolean;
  v_err text;
BEGIN
  BEGIN
    DELETE FROM auth.users WHERE id = pg_temp.id('X');
    v_kept := EXISTS (SELECT 1 FROM public.users WHERE id = pg_temp.id('X') AND name = 'Usuario eliminado');
  EXCEPTION WHEN others THEN
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM pg_temp.arm('A14 after 228: deleting the login leaves the anonymous users row and its history',
                      v_kept IS TRUE AND EXISTS (SELECT 1 FROM public.reviews WHERE reviewer_id = pg_temp.id('X')),
                      coalesce(v_err, format('users row kept: %s', v_kept)));
END $d$;

SELECT pg_temp.arm('A15 anon and authenticated cannot run either function',
                   NOT has_function_privilege('anon', 'public.account_scrub(uuid)', 'EXECUTE')
                   AND NOT has_function_privilege('authenticated', 'public.account_scrub(uuid)', 'EXECUTE')
                   AND NOT has_function_privilege('anon', 'public.account_deletion_files(uuid)', 'EXECUTE')
                   AND NOT has_function_privilege('authenticated', 'public.account_deletion_files(uuid)', 'EXECUTE'),
                   'has_function_privilege');

-- ── G. The constraint check, against shapes built to fail ───────────────────
SELECT pg_temp.reh_shape('G1 after the drop, a re-run reads absent', 'absent', 'SELECT 1');
-- A14 deleted X's login, so X's row is put back under a login first: the
-- constraint is added exactly as captured, validated, as production has it.
SELECT pg_temp.reh_shape('G2 the captured cascade reads captured', 'captured',
  'INSERT INTO auth.users (id, instance_id, aud, role, email) SELECT u.id, ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', u.email FROM public.users u WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id); ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE');
SELECT pg_temp.reh_shape('G3 a reference that is not the captured cascade aborts', 'error=228 ABORTED%',
  'ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) NOT VALID');

-- ── Result ─────────────────────────────────────────────────────────────────
CREATE TEMP TABLE reh_228_manifest (seq int, arm text) ON COMMIT DROP;
INSERT INTO reh_228_manifest VALUES
  (1, 'E0 ENV session_user and current_user'),
  (2, 'B1 before 228: deleting the login takes the profile, or is refused'),
  (3, 'T0 the body did not commit (same transaction before and after)'),
  (4, 'A1 users_id_fkey is gone, the primary key is not'),
  (5, 'A2 both functions: SECURITY DEFINER, search_path empty, service_role only'),
  (6, 'A3 the listing is exactly X''s 13 uploads: no community cover or banner, nothing of O''s'),
  (7, 'A4 account_scrub runs as service_role'),
  (8, 'A5 every personal users column is cleared (68 checked)'),
  (9, 'A6 kept: the consent records, the counters, the instructor flag'),
  (10, 'A7 user_private has no row of X''s'),
  (11, 'A7 push_subscriptions has no row of X''s'),
  (12, 'A7 notification_preferences has no row of X''s'),
  (13, 'A7 user_training_preferences has no row of X''s'),
  (14, 'A7 user_follows has no row of X''s'),
  (15, 'A7 connections has no row of X''s'),
  (16, 'A7 community_posts has no row of X''s'),
  (17, 'A7 instructor_posts has no row of X''s'),
  (18, 'A7 storefront_media has no row of X''s'),
  (19, 'A7 session_stories has no row of X''s'),
  (20, 'A7 session_recap_photos has no row of X''s'),
  (21, 'A7 session_media has no row of X''s'),
  (22, 'A7 session_media_tags (X tagged) has no row of X''s'),
  (23, 'A7 session_media_tags (on X''s media) has no row of X''s'),
  (24, 'A8 the bulletin flyer keeps its post and loses its image'),
  (25, 'A9 sessions lose only the links into X''s folder'),
  (26, 'A10 what is still to come is cancelled: X''s future session and X''s future spot'),
  (27, 'A11 what happened stays: X''s past session, X''s past spot, O''s spot on X''s session'),
  (28, 'A12 X''s chat message and review stay, under the anonymous row'),
  (29, 'A13 O is untouched: O''s row, O''s community post, O''s Moment'),
  (30, 'A14 after 228: deleting the login leaves the anonymous users row and its history'),
  (31, 'A15 anon and authenticated cannot run either function'),
  (32, 'G1 after the drop, a re-run reads absent'),
  (33, 'G2 the captured cascade reads captured'),
  (34, 'G3 a reference that is not the captured cascade aborts');

SELECT seq, arm, verdict, detail FROM reh_228 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_228;
SELECT CASE WHEN (SELECT array_agg(arm ORDER BY seq) FROM reh_228)
                 = (SELECT array_agg(arm ORDER BY seq) FROM reh_228_manifest)
            THEN 'manifest matches: every arm ran, in order' ELSE 'MANIFEST MISMATCH' END AS manifest;

-- The one result set for the transaction. Every row must read PASS. 34 of 34.

ROLLBACK;

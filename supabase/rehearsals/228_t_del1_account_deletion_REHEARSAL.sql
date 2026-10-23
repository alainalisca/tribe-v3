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
-- review, Moments and tags, gym clients, tips, a subscription payment, invites;
-- O, an existing non-admin account that must come through untouched and owns
-- a gym; Y, a new account that owns a partner listing. Storage rows are inserted directly; the Storage API
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
--       Other people's data (A16-A20): X's gym client is unassigned and X's
--       gym-less client deleted; live invites go, used ones stay; the scrub
--       refuses a gym owner (O) and a partner-listing owner (Y); the money
--       references are on public.users, so X's tips and subscription payment
--       outlive X's login.
--   G   the constraint check and the money-reference check, against shapes
--       built to fail.

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
  y uuid := gen_random_uuid();
  o uuid;
  g uuid;
  cl_gym uuid; cl_own uuid;
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

  -- Other people's data X controls: a gym client (O's gym) and a gym-less one,
  -- money both ways, interest, a subscription, a reach-out, invites.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES (y, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reh228y-' || y || '@test.local', '',
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
  INSERT INTO public.users (id, email) VALUES (y, 'reh228y-' || y || '@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.featured_partners (user_id, business_name, slug) VALUES (y, 'Rehearsal 228 partner', 'reh228-' || left(y::text, 8));
  INSERT INTO public.gyms (name, slug, owner_user_id) VALUES ('Rehearsal 228 gym', 'reh228-' || left(o::text, 8), o) RETURNING id INTO g;
  INSERT INTO public.clients (instructor_user_id, name, gym_id) VALUES (x, 'Gym client', g) RETURNING id INTO cl_gym;
  INSERT INTO public.clients (instructor_user_id, name) VALUES (x, 'Own client') RETURNING id INTO cl_own;
  INSERT INTO public.tips (tipper_id, instructor_id, amount_cents, currency, gateway) VALUES (x, o, 1000, 'COP', 'wompi'), (o, x, 2000, 'COP', 'wompi');
  INSERT INTO public.subscription_payments (user_id, tier, amount_cents, currency, gateway, status, period_start, period_end)
  VALUES (x, 'plus', 5000, 'COP', 'wompi', 'approved', current_date - 30, current_date);
  INSERT INTO public.training_interest (athlete_id, instructor_id) VALUES (x, o), (o, x);
  INSERT INTO public.session_subscriptions (user_id, session_id, instructor_id, status) VALUES (x, s_o_future, o, 'active');
  INSERT INTO public.lead_reaches (instructor_id, athlete_id) VALUES (o, x);
  INSERT INTO public.invite_tokens (session_id, token, created_by, expires_at)
  VALUES (s_future, 'reh228-live-' || x, x, now() + interval '7 days'), (s_past, 'reh228-used-' || x, x, now() - interval '7 days');
  INSERT INTO public.media_invites (session_id, display_name, token, created_by, expires_at, claimed_by, claimed_at)
  VALUES (s_past, 'Nadie', md5('reh228-open-' || x), x, now() + interval '7 days', NULL, NULL),
         (s_past, 'O', md5('reh228-claimed-' || x), x, now() + interval '7 days', o, now());

  INSERT INTO reh_228_ids VALUES ('X', x), ('O', o), ('Y', y), ('G', g), ('CL_gym', cl_gym), ('CL_own', cl_own),
    ('C', c), ('S_past', s_past), ('S_future', s_future),
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

-- ── 1b. Money records follow the users row, not the login
-- 'captured': all three exactly as read on 2026-10-23 (auth.users, CASCADE);
-- 'repointed': all three on public.users already (a re-run). Anything else, or
-- a row whose person has no users row, aborts.
CREATE FUNCTION pg_temp.m228_money() RETURNS text LANGUAGE plpgsql AS $shape$
DECLARE
  v_defs text[];
  v_orphans bigint;
BEGIN
  SELECT array_agg(conname || ' ' || pg_get_constraintdef(oid) ORDER BY conname) INTO v_defs
    FROM pg_constraint
   WHERE conname IN ('tips_tipper_id_fkey', 'tips_instructor_id_fkey', 'subscription_payments_user_id_fkey');
  IF v_defs = ARRAY[
       'subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
       'tips_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES auth.users(id) ON DELETE CASCADE',
       'tips_tipper_id_fkey FOREIGN KEY (tipper_id) REFERENCES auth.users(id) ON DELETE CASCADE'] THEN
    SELECT (SELECT count(*) FROM public.tips t
             WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.tipper_id)
                OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.instructor_id))
         + (SELECT count(*) FROM public.subscription_payments p
             WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p.user_id))
      INTO v_orphans;
    IF v_orphans > 0 THEN
      RAISE EXCEPTION '228 ABORTED: % tips or subscription_payments row(s) name a person with no users row; read them first.', v_orphans;
    END IF;
    RETURN 'captured';
  END IF;
  IF v_defs = ARRAY[
       'subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
       'tips_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE',
       'tips_tipper_id_fkey FOREIGN KEY (tipper_id) REFERENCES users(id) ON DELETE CASCADE'] THEN
    RETURN 'repointed';
  END IF;
  RAISE EXCEPTION '228 ABORTED: the tips / subscription_payments references are not the ones captured on 2026-10-23: %', v_defs;
END $shape$;

DO $$
BEGIN
  RAISE NOTICE '228 pre-flight: money references %', pg_temp.m228_money();
END $$;

ALTER TABLE public.tips
  DROP CONSTRAINT tips_tipper_id_fkey,
  ADD CONSTRAINT tips_tipper_id_fkey FOREIGN KEY (tipper_id) REFERENCES public.users(id) ON DELETE CASCADE,
  DROP CONSTRAINT tips_instructor_id_fkey,
  ADD CONSTRAINT tips_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_payments
  DROP CONSTRAINT subscription_payments_user_id_fkey,
  ADD CONSTRAINT subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ── 1c. A deleted coach's gym clients stay with the gym, unassigned
DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'instructor_user_id') IS NULL THEN
    RAISE EXCEPTION '228 ABORTED: clients.instructor_user_id is missing.';
  END IF;
END $$;
ALTER TABLE public.clients ALTER COLUMN instructor_user_id DROP NOT NULL;

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
  IF pg_temp.m228_money() <> 'repointed' THEN
    RAISE EXCEPTION '228 ABORTED: tips and subscription_payments do not reference public.users after the change.';
  END IF;
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'instructor_user_id') <> 'YES' THEN
    RAISE EXCEPTION '228 ABORTED: clients.instructor_user_id is still NOT NULL.';
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
    ('session_media_tags (on X''s media)', (SELECT count(*) FROM public.session_media_tags WHERE media_id = pg_temp.id('M_x'))),
    ('training_interest', (SELECT count(*) FROM public.training_interest WHERE pg_temp.id('X') IN (athlete_id, instructor_id))),
    ('session_subscriptions', (SELECT count(*) FROM public.session_subscriptions WHERE pg_temp.id('X') IN (user_id, instructor_id))),
    ('lead_reaches', (SELECT count(*) FROM public.lead_reaches WHERE pg_temp.id('X') IN (athlete_id, instructor_id)))
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

SELECT pg_temp.arm('A16 X''s gym client stays with the gym, unassigned; X''s gym-less client is gone',
                   (SELECT instructor_user_id IS NULL AND gym_id = pg_temp.id('G') FROM public.clients WHERE id = pg_temp.id('CL_gym'))
                   AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = pg_temp.id('CL_own')),
                   'clients');

SELECT pg_temp.arm('A17 live invite links and unclaimed media invites are gone; used ones stay',
                   NOT EXISTS (SELECT 1 FROM public.invite_tokens WHERE token = 'reh228-live-' || pg_temp.id('X'))
                   AND EXISTS (SELECT 1 FROM public.invite_tokens WHERE token = 'reh228-used-' || pg_temp.id('X'))
                   AND NOT EXISTS (SELECT 1 FROM public.media_invites WHERE token = md5('reh228-open-' || pg_temp.id('X')))
                   AND EXISTS (SELECT 1 FROM public.media_invites WHERE token = md5('reh228-claimed-' || pg_temp.id('X'))),
                   'invite_tokens, media_invites');

DO $r$
DECLARE
  v_o uuid := pg_temp.id('O');
  v_y uuid := pg_temp.id('Y');
  v_gym text;
  v_partner text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.account_scrub(v_o);
    v_gym := 'scrubbed';
  EXCEPTION WHEN others THEN v_gym := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.account_scrub(v_y);
    v_partner := 'scrubbed';
  EXCEPTION WHEN others THEN v_partner := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.arm('A18 the scrub refuses a gym owner and a partner-listing owner, and changes nothing of theirs',
                      v_gym = 'account_scrub: owns_gym' AND v_partner = 'account_scrub: owns_partner'
                      AND (SELECT name FROM public.users WHERE id = v_y) IS DISTINCT FROM 'Usuario eliminado',
                      format('gym owner: %s; partner owner: %s', v_gym, v_partner));
END $r$;

SELECT pg_temp.arm('A19 tips and subscription_payments reference public.users; clients.instructor_user_id takes NULL',
                   pg_temp.m228_money() = 'repointed'
                   AND (SELECT is_nullable FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'instructor_user_id') = 'YES',
                   'pg_constraint, information_schema');

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

SELECT pg_temp.arm('A20 after the login is deleted, X''s money records are still there',
                   (SELECT count(*) FROM public.tips WHERE pg_temp.id('X') IN (tipper_id, instructor_id)) = 2
                   AND (SELECT count(*) FROM public.subscription_payments WHERE user_id = pg_temp.id('X')) = 1,
                   'tips, subscription_payments');

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

-- The money check. Captured shape first: every users row gets its login back
-- (A14 deleted X's), and the three references go back to auth.users.
CREATE FUNCTION pg_temp.money_on_auth(p_tipper_rule text) RETURNS text LANGUAGE sql AS $f$
  SELECT 'INSERT INTO auth.users (id, instance_id, aud, role, email) SELECT u.id, ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', u.email FROM public.users u WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id); '
      || 'ALTER TABLE public.tips DROP CONSTRAINT tips_tipper_id_fkey, ADD CONSTRAINT tips_tipper_id_fkey FOREIGN KEY (tipper_id) REFERENCES auth.users(id) ' || p_tipper_rule || ', '
      || 'DROP CONSTRAINT tips_instructor_id_fkey, ADD CONSTRAINT tips_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES auth.users(id) ON DELETE CASCADE; '
      || 'ALTER TABLE public.subscription_payments DROP CONSTRAINT subscription_payments_user_id_fkey, ADD CONSTRAINT subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;';
$f$;

CREATE FUNCTION pg_temp.reh_money(p_arm text, p_expect text, p_build text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_got text;
BEGIN
  BEGIN
    EXECUTE p_build;
    v_got := pg_temp.m228_money();
    RAISE EXCEPTION 'reh_228 undo' USING ERRCODE = 'P0228';
  EXCEPTION
    WHEN SQLSTATE 'P0228' THEN NULL;
    WHEN others THEN v_got := 'error=' || SQLERRM;
  END;
  PERFORM pg_temp.arm(p_arm, v_got LIKE p_expect, format('expected %s, got %s', p_expect, coalesce(v_got, '<null>')));
END $f$;

SELECT pg_temp.reh_money('G4 after the change, a re-run reads repointed', 'repointed', 'SELECT 1');
SELECT pg_temp.reh_money('G5 the captured money references read captured', 'captured', pg_temp.money_on_auth('ON DELETE CASCADE'));
SELECT pg_temp.reh_money('G6 a money reference that is not the captured one aborts', 'error=228 ABORTED%', pg_temp.money_on_auth('ON DELETE NO ACTION'));
SELECT pg_temp.reh_money('G7 a tip whose person has no users row aborts', 'error=228 ABORTED: 1 tips%',
  pg_temp.money_on_auth('ON DELETE CASCADE')
  || ' INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES (''00000000-0000-4000-8000-000000000228'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''reh228z@test.local'');'
  || ' DELETE FROM public.users WHERE id = ''00000000-0000-4000-8000-000000000228'';'
  || ' INSERT INTO public.tips (tipper_id, instructor_id, amount_cents, currency, gateway) VALUES (''00000000-0000-4000-8000-000000000228'', (SELECT v FROM reh_228_ids WHERE k = ''O''), 100, ''COP'', ''wompi'');');

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
  (24, 'A7 training_interest has no row of X''s'),
  (25, 'A7 session_subscriptions has no row of X''s'),
  (26, 'A7 lead_reaches has no row of X''s'),
  (27, 'A8 the bulletin flyer keeps its post and loses its image'),
  (28, 'A9 sessions lose only the links into X''s folder'),
  (29, 'A10 what is still to come is cancelled: X''s future session and X''s future spot'),
  (30, 'A11 what happened stays: X''s past session, X''s past spot, O''s spot on X''s session'),
  (31, 'A12 X''s chat message and review stay, under the anonymous row'),
  (32, 'A13 O is untouched: O''s row, O''s community post, O''s Moment'),
  (33, 'A16 X''s gym client stays with the gym, unassigned; X''s gym-less client is gone'),
  (34, 'A17 live invite links and unclaimed media invites are gone; used ones stay'),
  (35, 'A18 the scrub refuses a gym owner and a partner-listing owner, and changes nothing of theirs'),
  (36, 'A19 tips and subscription_payments reference public.users; clients.instructor_user_id takes NULL'),
  (37, 'A14 after 228: deleting the login leaves the anonymous users row and its history'),
  (38, 'A20 after the login is deleted, X''s money records are still there'),
  (39, 'A15 anon and authenticated cannot run either function'),
  (40, 'G1 after the drop, a re-run reads absent'),
  (41, 'G2 the captured cascade reads captured'),
  (42, 'G3 a reference that is not the captured cascade aborts'),
  (43, 'G4 after the change, a re-run reads repointed'),
  (44, 'G5 the captured money references read captured'),
  (45, 'G6 a money reference that is not the captured one aborts'),
  (46, 'G7 a tip whose person has no users row aborts');

SELECT seq, arm, verdict, detail FROM reh_228 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_228;
SELECT CASE WHEN (SELECT array_agg(arm ORDER BY seq) FROM reh_228)
                 = (SELECT array_agg(arm ORDER BY seq) FROM reh_228_manifest)
            THEN 'manifest matches: every arm ran, in order' ELSE 'MANIFEST MISMATCH' END AS manifest;

-- The one result set for the transaction. Every row must read PASS. 46 of 46.

ROLLBACK;

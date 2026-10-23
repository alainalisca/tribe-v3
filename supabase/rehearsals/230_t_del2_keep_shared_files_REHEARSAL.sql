-- 230_t_del2_keep_shared_files_REHEARSAL.sql. Dry run of 230. Applies nothing.
--
-- Run it with scripts/av-rehearse.sh, never by hand:
--
--   scripts/av-rehearse.sh 230_t_del2_keep_shared_files
--
-- PART M IS 230'S BODY, SPLICED VERBATIM (supabase/rehearsalBodyVerbatim.test.ts):
-- everything between the migration's own BEGIN and its "Record this migration
-- as applied" marker, guards and comments included, never retyped. Re-splice
-- after editing the migration. T0 checks the transaction id is the same after
-- the body as before it, so a COMMIT that slipped in is a FAIL row.
--
-- One transaction, ended by ROLLBACK. Every row must read PASS. Needs 228.
--
-- FIXTURE (inside the transaction): X, a new account with eleven uploads; O,
-- an existing non-admin account; Y, a new account that owns a partner listing.
-- Storage rows are inserted directly.
--   Shared, so 230 keeps them (a remaining row references each):
--     S   X's upload used as Y's partner logo        featured_partners.logo_url
--     S2  X's upload used as O's profile cover       users.cover_image_url
--     H   a link X sent in a chat message            chat_messages.message (history the scrub keeps)
--   X's own, so 230 lists them (only rows the scrub deletes or clears use them):
--     A   X's avatar                                 X's users row
--     P   X's photo on O's session                   sessions.photos, X's folder (cleared)
--     Q   X's photo on X's own session               sessions.photos, X's folder (cleared)
--     M   X's community post image                   community_posts (deleted)
--     B   X's bulletin flyer                         community_bulletin.image_url (cleared)
--     R   X's recap photo                            session_recap_photos (deleted)
--     MO  X's Moment                                 session_media.storage_path (deleted)
--     U   an upload nothing references
--
-- ARMS
--   T0  the body did not commit.
--   K0  the three functions: SECURITY DEFINER, search_path empty, service_role only.
--   K1  account_deletion_files(X) is exactly the eight files of X's own.
--   K2  account_file_references(X) is exactly S, S2 and H, each with its table and column.
--   K3  the candidates are exactly K1 plus K2's files, with no overlap.
--   K4  THE MIRROR: after account_scrub(X) runs as service_role, the candidates
--       any row still references are exactly K2's files.
--   K5  a user with no uploads gets nothing from either function.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_230 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_230_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE reh_230_tx (k text PRIMARY KEY, v bigint) ON COMMIT DROP;
CREATE TEMP TABLE reh_230_files (k text PRIMARY KEY, bucket text, path text) ON COMMIT DROP;
CREATE TEMP TABLE reh_230_kept (f text PRIMARY KEY) ON COMMIT DROP;

CREATE FUNCTION pg_temp.id(p_k text) RETURNS uuid LANGUAGE sql AS $f$
  SELECT v FROM reh_230_ids WHERE k = p_k;
$f$;

CREATE FUNCTION pg_temp.arm(p_arm text, p_ok boolean, p_detail text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO reh_230 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, coalesce(p_detail, '<null>'));
$f$;

-- Every bucket:path among p_files that any row in public references, by the
-- same path-in-text match 230 uses, with no exclusions.
CREATE FUNCTION pg_temp.referenced(p_buckets text[], p_paths text[]) RETURNS text[] LANGUAGE plpgsql AS $f$
DECLARE
  v_col record;
  v_hit text[];
  v_out text[] := '{}';
BEGIN
  FOR v_col IN
    SELECT cl.relname::text AS t, a.attname::text AS c
      FROM pg_class cl
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE cl.relkind IN ('r', 'p')
       AND a.atttypid IN ('text'::regtype, 'varchar'::regtype, 'json'::regtype, 'jsonb'::regtype, '_text'::regtype, '_varchar'::regtype)
  LOOP
    EXECUTE format('SELECT array_agg(DISTINCT f.bucket || '':'' || f.path) FROM public.%I x
                      JOIN unnest($1::text[], $2::text[]) AS f(bucket, path) ON strpos(x.%I::text, f.path) > 0',
                   v_col.t, v_col.c)
      INTO v_hit USING p_buckets, p_paths;
    v_out := v_out || coalesce(v_hit, '{}');
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT unnest(v_out) ORDER BY 1);
END $f$;

SELECT pg_temp.arm('E0 ENV session_user and current_user', true, format('session_user=%s current_user=%s', session_user, current_user));

-- ── F. Fixture ─────────────────────────────────────────────────────────────
DO $f$
DECLARE
  x uuid := gen_random_uuid();
  y uuid := gen_random_uuid();
  o uuid;
  c uuid;
  s_x uuid; s_o uuid;
  m_x uuid;
  base text := 'https://cdn.test/storage/v1/object/public/';
BEGIN
  SELECT id INTO o FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL
   ORDER BY created_at LIMIT 1;
  IF o IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need one existing non-admin user for O.';
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES (x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reh230-' || x || '@test.local', '',
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
         (y, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reh230y-' || y || '@test.local', '',
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
  INSERT INTO public.users (id, email) VALUES (x, 'reh230-' || x || '@test.local'), (y, 'reh230y-' || y || '@test.local')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO reh_230_files VALUES
    ('S',  'profile-images', 'avatars/' || x || '-logo.jpg'),
    ('S2', 'profile-images', 'photos/' || x || '-shared.jpg'),
    ('H',  'media', 'chat/' || x || '/h.jpg'),
    ('A',  'profile-images', 'avatars/' || x || '-1.jpg'),
    ('P',  'session-photos', x || '/on-o.jpg'),
    ('Q',  'session-photos', x || '/own.jpg'),
    ('M',  'media', 'community-posts/' || x || '/m.jpg'),
    ('B',  'community-bulletin-flyers', x || '/flyer.jpg'),
    ('U',  'media', 'loose/' || x || '/u.jpg');

  INSERT INTO public.communities (name, creator_id) VALUES ('Rehearsal 230 community', o) RETURNING id INTO c;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status, photos)
  VALUES (x, 'Boxing', current_date - 10, '07:00', 60, 'Rehearsal 230 X past', 10, 'active',
          ARRAY[base || 'session-photos/' || x || '/own.jpg'])
  RETURNING id INTO s_x;
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status, photos)
  VALUES (o, 'Boxing', current_date - 9, '07:00', 60, 'Rehearsal 230 O past', 10, 'active',
          ARRAY[base || 'session-photos/' || x || '/on-o.jpg', base || 'session-photos/other/keep.jpg'])
  RETURNING id INTO s_o;
  INSERT INTO public.session_media (session_id, uploader_id, storage_path)
  VALUES (s_o, x, s_o || '/' || gen_random_uuid() || '.jpg') RETURNING id INTO m_x;
  INSERT INTO reh_230_files VALUES
    ('R',  'session-recap-photos', s_o || '/' || x || '/recap.jpg'),
    ('MO', 'moments', (SELECT storage_path FROM public.session_media WHERE id = m_x));

  -- Who references what.
  UPDATE public.users SET avatar_url = base || 'profile-images/avatars/' || x || '-1.jpg' WHERE id = x;
  UPDATE public.users SET cover_image_url = base || 'profile-images/photos/' || x || '-shared.jpg' WHERE id = o;
  INSERT INTO public.featured_partners (user_id, business_name, slug, logo_url)
  VALUES (y, 'Rehearsal 230 partner', 'reh230-' || left(y::text, 8), base || 'profile-images/avatars/' || x || '-logo.jpg');
  INSERT INTO public.chat_messages (session_id, user_id, message)
  VALUES (s_o, x, 'mira la foto ' || base || 'media/chat/' || x || '/h.jpg');
  INSERT INTO public.community_posts (community_id, author_id, content, media_url)
  VALUES (c, x, 'X post', base || 'media/community-posts/' || x || '/m.jpg');
  INSERT INTO public.community_bulletin (author_id, title, image_url)
  VALUES (x, 'X flyer', base || 'community-bulletin-flyers/' || x || '/flyer.jpg');
  INSERT INTO public.session_recap_photos (session_id, user_id, photo_url)
  VALUES (s_o, x, base || 'session-recap-photos/' || s_o || '/' || x || '/recap.jpg');

  INSERT INTO storage.buckets (id, name, public)
  SELECT b, b, true FROM unnest(ARRAY['profile-images','media','session-photos','session-recap-photos',
                                      'moments','community-bulletin-flyers']) b
  ON CONFLICT (id) DO NOTHING;
  -- Owned by X, except the server-made recap photo and Moment, as in production.
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
  SELECT bucket, path,
         CASE WHEN k IN ('R', 'MO') THEN NULL ELSE x END,
         CASE WHEN k IN ('R', 'MO') THEN NULL ELSE x::text END
    FROM reh_230_files;

  INSERT INTO reh_230_ids VALUES ('X', x), ('O', o), ('Y', y), ('S_x', s_x), ('S_o', s_o);
END $f$;

INSERT INTO reh_230_tx VALUES ('before', txid_current());

-- ══════════════════════════════════════════════════════════════════════════
-- PART M. 230's body, verbatim.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_missing text;
BEGIN
  IF to_regprocedure('public.account_deletion_files(uuid)') IS NULL
     OR to_regprocedure('public.account_scrub(uuid)') IS NULL THEN
    RAISE EXCEPTION '230 ABORTED: 228 is not applied (account_deletion_files or account_scrub is missing).';
  END IF;
  SELECT string_agg(e.t || '.' || e.c, ', ') INTO v_missing
    FROM (VALUES ('users', 'id'), ('user_private', 'user_id'), ('push_subscriptions', 'user_id'),
                 ('notification_preferences', 'user_id'), ('user_training_preferences', 'user_id'),
                 ('user_follows', 'follower_id'), ('user_follows', 'following_id'),
                 ('connections', 'requester_id'), ('connections', 'recipient_id'),
                 ('training_interest', 'athlete_id'), ('training_interest', 'instructor_id'),
                 ('session_subscriptions', 'user_id'), ('session_subscriptions', 'instructor_id'),
                 ('lead_reaches', 'athlete_id'), ('lead_reaches', 'instructor_id'),
                 ('community_posts', 'author_id'), ('instructor_posts', 'author_id'),
                 ('storefront_media', 'user_id'), ('session_stories', 'user_id'),
                 ('session_recap_photos', 'user_id'), ('session_media', 'uploader_id'),
                 ('session_media_tags', 'user_id'), ('community_bulletin', 'author_id'),
                 ('community_bulletin', 'image_url'), ('sessions', 'photos'), ('sessions', 'recap_photos')) AS e(t, c)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = e.t AND column_name = e.c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '230 ABORTED: the scrub mirror names columns that do not exist: %. Read account_scrub before applying.', v_missing;
  END IF;
  RAISE NOTICE '230 pre-flight: 228 applied, every column the scrub mirror names exists.';
END $$;

-- ── 1. 228's listing, unchanged, under its own name
CREATE OR REPLACE FUNCTION public.account_deletion_candidates(p_user uuid)
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

-- ── 2. Which of those files a remaining row still references
CREATE OR REPLACE FUNCTION public.account_file_references(p_user uuid)
RETURNS TABLE (bucket text, path text, ref_table text, ref_column text, ref_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_buckets text[];
  v_paths text[];
  v_col record;
  v_theirs text;
  v_id text;
BEGIN
  SELECT array_agg(c.bucket), array_agg(c.path) INTO v_buckets, v_paths
    FROM public.account_deletion_candidates(p_user) c;
  IF v_paths IS NULL THEN
    RETURN;
  END IF;

  FOR v_col IN
    SELECT cl.relname::text AS t, a.attname::text AS c,
           EXISTS (SELECT 1 FROM pg_catalog.pg_attribute i
                    WHERE i.attrelid = cl.oid AND i.attname = 'id' AND i.attnum > 0 AND NOT i.attisdropped) AS has_id
      FROM pg_catalog.pg_class cl
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_catalog.pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE cl.relkind IN ('r', 'p')
       AND a.atttypid IN ('pg_catalog.text'::pg_catalog.regtype, 'pg_catalog.varchar'::pg_catalog.regtype,
                          'pg_catalog.json'::pg_catalog.regtype, 'pg_catalog.jsonb'::pg_catalog.regtype,
                          'pg_catalog._text'::pg_catalog.regtype, 'pg_catalog._varchar'::pg_catalog.regtype)
     ORDER BY 1, 2
  LOOP
    -- Rows the scrub deletes or clears for this person (the mirror of 228's
    -- account_scrub; see the header). Their references do not count.
    v_theirs := CASE v_col.t
      WHEN 'users' THEN 'x.id = $1'
      WHEN 'user_private' THEN 'x.user_id = $1'
      WHEN 'push_subscriptions' THEN 'x.user_id = $1'
      WHEN 'notification_preferences' THEN 'x.user_id = $1'
      WHEN 'user_training_preferences' THEN 'x.user_id = $1'
      WHEN 'user_follows' THEN '(x.follower_id = $1 OR x.following_id = $1)'
      WHEN 'connections' THEN '(x.requester_id = $1 OR x.recipient_id = $1)'
      WHEN 'training_interest' THEN '(x.athlete_id = $1 OR x.instructor_id = $1)'
      WHEN 'session_subscriptions' THEN '(x.user_id = $1 OR x.instructor_id = $1)'
      WHEN 'lead_reaches' THEN '(x.athlete_id = $1 OR x.instructor_id = $1)'
      WHEN 'community_posts' THEN 'x.author_id = $1'
      WHEN 'instructor_posts' THEN 'x.author_id = $1'
      WHEN 'storefront_media' THEN 'x.user_id = $1'
      WHEN 'session_stories' THEN 'x.user_id = $1'
      WHEN 'session_recap_photos' THEN 'x.user_id = $1'
      WHEN 'session_media' THEN 'x.uploader_id = $1'
      WHEN 'session_media_tags' THEN 'x.user_id = $1'
      WHEN 'community_bulletin' THEN
        CASE WHEN v_col.c = 'image_url' THEN 'x.author_id = $1' ELSE 'false' END
      WHEN 'sessions' THEN
        CASE WHEN v_col.c IN ('photos', 'recap_photos')
             THEN '(f.bucket = ''session-photos'' AND f.path LIKE $1::text || ''/%'')'
             ELSE 'false' END
      ELSE 'false'
    END;
    v_id := CASE WHEN v_col.has_id THEN 'x.id::text' ELSE 'NULL::text' END;

    RETURN QUERY EXECUTE format(
      'SELECT f.bucket, f.path, %L::text, %L::text, %s
         FROM public.%I x
         JOIN unnest($2::text[], $3::text[]) AS f(bucket, path)
           ON strpos(x.%I::text, f.path) > 0
        WHERE NOT coalesce(%s, false)',
      v_col.t, v_col.c, v_id, v_col.t, v_col.c, v_theirs)
      USING p_user, v_buckets, v_paths;
  END LOOP;
END
$fn$;

-- ── 3. What the route deletes: their uploads that nobody else still uses
CREATE OR REPLACE FUNCTION public.account_deletion_files(p_user uuid)
RETURNS TABLE (bucket text, path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT c.bucket, c.path
    FROM public.account_deletion_candidates(p_user) c
  EXCEPT
  SELECT k.bucket, k.path
    FROM public.account_file_references(p_user) k;
$fn$;

REVOKE ALL ON FUNCTION public.account_deletion_candidates(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_file_references(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_files(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_candidates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_file_references(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_files(uuid) TO service_role;

DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[to_regprocedure('public.account_deletion_candidates(uuid)'),
                              to_regprocedure('public.account_file_references(uuid)'),
                              to_regprocedure('public.account_deletion_files(uuid)')] LOOP
    IF v_fn IS NULL THEN
      RAISE EXCEPTION '230 ABORTED: a deletion function is missing after create.';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn)
       OR NOT coalesce((SELECT 'search_path=""' = ANY (proconfig) FROM pg_proc WHERE oid = v_fn), false) THEN
      RAISE EXCEPTION '230 ABORTED: % is not SECURITY DEFINER with an empty search_path.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '230 ABORTED: % must be executable by service_role only.', v_fn;
    END IF;
  END LOOP;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.account_deletion_files(uuid)')),
            'account_file_references') = 0 THEN
    RAISE EXCEPTION '230 ABORTED: account_deletion_files does not leave out the files account_file_references reports.';
  END IF;
  RAISE NOTICE '230: account_deletion_files leaves out files a remaining row references; all three functions service_role only.';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- K. After 230
-- ══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.arm('T0 the body did not commit (same transaction before and after)',
                   (SELECT v FROM reh_230_tx WHERE k = 'before') = txid_current(),
                   format('txid before=%s after=%s', (SELECT v FROM reh_230_tx WHERE k = 'before'), txid_current()));

SELECT pg_temp.arm('K0 the three functions: SECURITY DEFINER, search_path empty, service_role only',
                   count(*) = 3 AND bool_and(prosecdef AND 'search_path=""' = ANY (proconfig)
                                             AND NOT has_function_privilege('anon', oid, 'EXECUTE')
                                             AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
                                             AND has_function_privilege('service_role', oid, 'EXECUTE')),
                   string_agg(proname || ' ' || coalesce(array_to_string(proconfig, ','), '-'), '; '))
  FROM pg_proc WHERE oid IN ('public.account_deletion_candidates(uuid)'::regprocedure,
                             'public.account_file_references(uuid)'::regprocedure,
                             'public.account_deletion_files(uuid)'::regprocedure);

-- The three functions as the route calls them: service_role, no signed-in user.
DO $k$
DECLARE
  -- Read before the role switch: service_role cannot read this session's temp tables.
  v_x uuid := pg_temp.id('X');
  v_y uuid := pg_temp.id('Y');
  v_want_del text[];
  v_want_kept text[];
  v_del text[];
  v_refs text[];
  v_cand text[];
  v_y_del bigint;
  v_y_refs bigint;
  v_err text;
BEGIN
  SELECT array_agg(bucket || ':' || path ORDER BY bucket || ':' || path) INTO v_want_del
    FROM reh_230_files WHERE k IN ('A', 'P', 'Q', 'M', 'B', 'R', 'MO', 'U');
  SELECT array_agg(r ORDER BY r) INTO v_want_kept FROM (VALUES
    ((SELECT bucket || ':' || path FROM reh_230_files WHERE k = 'S') || ' featured_partners.logo_url'),
    ((SELECT bucket || ':' || path FROM reh_230_files WHERE k = 'S2') || ' users.cover_image_url'),
    ((SELECT bucket || ':' || path FROM reh_230_files WHERE k = 'H') || ' chat_messages.message')) w(r);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    SELECT array_agg(bucket || ':' || path ORDER BY bucket || ':' || path) INTO v_del FROM public.account_deletion_files(v_x);
    SELECT array_agg(DISTINCT bucket || ':' || path || ' ' || ref_table || '.' || ref_column) INTO v_refs
      FROM public.account_file_references(v_x);
    SELECT array_agg(bucket || ':' || path ORDER BY bucket || ':' || path) INTO v_cand FROM public.account_deletion_candidates(v_x);
    SELECT count(*) INTO v_y_del FROM public.account_deletion_files(v_y);
    SELECT count(*) INTO v_y_refs FROM public.account_file_references(v_y);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN others THEN
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  v_refs := ARRAY(SELECT unnest(v_refs) ORDER BY 1);
  PERFORM pg_temp.arm('K1 account_deletion_files(X) is exactly the eight files of X''s own',
                      v_err IS NULL AND v_del = v_want_del,
                      coalesce(v_err, format('%s listed: %s', coalesce(cardinality(v_del), 0), array_to_string(v_del, ', '))));
  PERFORM pg_temp.arm('K2 account_file_references(X) is exactly S, S2 and H, each with its table and column',
                      v_err IS NULL AND v_refs = v_want_kept,
                      coalesce(v_err, array_to_string(v_refs, ', ')));
  PERFORM pg_temp.arm('K3 the candidates are K1 plus K2''s files, with no overlap',
                      v_err IS NULL
                      AND v_cand = ARRAY(SELECT unnest(v_del || ARRAY(SELECT split_part(r, ' ', 1) FROM unnest(v_refs) r)) ORDER BY 1)
                      AND cardinality(v_cand) = 11,
                      coalesce(v_err, format('%s candidates', coalesce(cardinality(v_cand), 0))));
  PERFORM pg_temp.arm('K5 a user with no uploads gets nothing from either function',
                      v_err IS NULL AND v_y_del = 0 AND v_y_refs = 0,
                      coalesce(v_err, format('Y: %s to delete, %s references', v_y_del, v_y_refs)));
  INSERT INTO reh_230_kept SELECT DISTINCT split_part(r, ' ', 1) FROM unnest(v_refs) r;
END $k$;

-- K4. The mirror: run the real scrub, then see what is still referenced.
DO $m$
DECLARE
  v_x uuid := pg_temp.id('X');
  v_err text;
  v_still text[];
  v_kept text[];
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
  v_still := pg_temp.referenced(ARRAY(SELECT bucket FROM reh_230_files ORDER BY k), ARRAY(SELECT path FROM reh_230_files ORDER BY k));
  SELECT array_agg(f ORDER BY f) INTO v_kept FROM reh_230_kept;
  PERFORM pg_temp.arm('K4 after account_scrub(X), the files any row still references are exactly the ones 230 kept',
                      v_err IS NULL AND v_still = v_kept,
                      coalesce(v_err, format('still referenced: %s; kept: %s', array_to_string(v_still, ', '), array_to_string(v_kept, ', '))));
END $m$;

-- ── Result ─────────────────────────────────────────────────────────────────
CREATE TEMP TABLE reh_230_manifest (seq int, arm text) ON COMMIT DROP;
INSERT INTO reh_230_manifest VALUES
  (1, 'E0 ENV session_user and current_user'),
  (2, 'T0 the body did not commit (same transaction before and after)'),
  (3, 'K0 the three functions: SECURITY DEFINER, search_path empty, service_role only'),
  (4, 'K1 account_deletion_files(X) is exactly the eight files of X''s own'),
  (5, 'K2 account_file_references(X) is exactly S, S2 and H, each with its table and column'),
  (6, 'K3 the candidates are K1 plus K2''s files, with no overlap'),
  (7, 'K5 a user with no uploads gets nothing from either function'),
  (8, 'K4 after account_scrub(X), the files any row still references are exactly the ones 230 kept');

SELECT seq, arm, verdict, detail FROM reh_230 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_230;
SELECT CASE WHEN (SELECT array_agg(arm ORDER BY seq) FROM reh_230)
                 = (SELECT array_agg(arm ORDER BY seq) FROM reh_230_manifest)
            THEN 'manifest matches: every arm ran, in order' ELSE 'MANIFEST MISMATCH' END AS manifest;

-- The one result set for the transaction. Every row must read PASS. 8 of 8.

ROLLBACK;

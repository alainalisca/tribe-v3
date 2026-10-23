-- 230_t_del2_keep_shared_files.sql
--
-- T-DEL2: an account deletion never deletes a file that a remaining row still
-- references; it leaves the file and reports it. NOT APPLIED when written
-- (2026-10-23). Apply FIRST, then merge the code: the code calls
-- account_file_references. 229 is reserved; this is 230.
--
-- WHAT WENT WRONG. Read on production on 2026-10-23 with read-only SELECTs,
-- after the 36 half-deleted accounts were deleted through deleteAccount:
--   * featured_partners 040cbc21 (CrossFit BullBox, slug bullbox, owned by Leo,
--     live) had logo_url = profile-images/avatars/7c4e29a2-...-1789171016880.jpeg.
--     The file was uploaded by 7c4e29a2, a test account named "BullBox", one of
--     the 36. account_deletion_files (228) lists every object the person owns,
--     so the logo was deleted with the account, and /g/bullbox and its WhatsApp
--     card showed "Object not found". Restored the same day from Al's original
--     (Media Archive/BullBox Media/BullBox Logo.jpeg) to
--     profile-images/partner-logos/bullbox-logo.jpeg, uploaded with the service
--     key, so no user owns it.
--   * A scan of every text, json and text[] column in public for a storage URL
--     whose object no longer exists found two rows: that logo, and
--     communities 3f94d45f's cover (a community-covers file of 7ad0c072, which
--     228 never lists; it was already missing before today's run).
--
-- WHAT THIS DOES
--   1. public.account_deletion_candidates(uuid): 228's listing, unchanged, under
--      its own name: what the person uploaded.
--   2. public.account_file_references(uuid): for each candidate, every row that
--      will still reference it after the deletion, as (bucket, path,
--      ref_table, ref_column, ref_id). It searches every text, varchar, json,
--      jsonb, text[] and varchar[] column of every table in public for the
--      file's path, so a column added later is covered without a change here.
--      A reference does NOT count when account_scrub (228) removes it anyway:
--        - the person's own users row (every personal column is cleared);
--        - a row the scrub deletes because it is theirs: user_private,
--          push_subscriptions, notification_preferences,
--          user_training_preferences, user_follows and connections (both
--          ways), training_interest, session_subscriptions and lead_reaches
--          (either side), community_posts, instructor_posts, storefront_media,
--          session_stories, session_recap_photos, session_media (uploader),
--          session_media_tags;
--        - community_bulletin.image_url on their own posts (cleared);
--        - sessions.photos and sessions.recap_photos links into their own
--          session-photos/<id>/ folder (cleared on every session).
--      Anything else is a remaining row: someone else's listing, profile,
--      session or post, or the person's own history that the scrub keeps
--      (a used invite, a gym client, a message). Matching is by the path
--      inside the column's text, so a false match keeps a file, never deletes
--      one.
--   3. public.account_deletion_files(uuid), redefined: the candidates minus
--      every file account_file_references returns. Same signature, so the
--      deployed route keeps working between this apply and the code merge: it
--      simply stops deleting shared files.
--   All three are SECURITY DEFINER with an empty search_path, executable by
--   service_role only.
--
-- A DELETION CANNOT HANG ON THE SCAN. account_file_references and
-- account_deletion_files carry SET statement_timeout = '20s'. PostgREST (the
-- route's rpc() calls) applies a function's statement_timeout before it runs
-- the call, so the request is cancelled at 20 s. A Postgres SET clause does not
-- cap a call already running when it comes from plain SQL, so the scan also
-- keeps its own budget: past 15 s it stops with query_canceled. Either way
-- list_files fails and nothing is deleted.
--
-- THE DYNAMIC SQL. Table and column names go into the query only through
-- format('%I'); they are also returned as labels through format('%L'). The
-- user id and the file paths are bound parameters ($1, $2, $3), never text in
-- the query. The two %s fragments are fixed code chosen from a CASE in this
-- function, never a value.
--
-- KEEP IN STEP WITH account_scrub. The exclusions above mirror what 228's
-- account_scrub deletes or clears. The pre-flight aborts if any table or
-- column they name is missing, and the rehearsal proves the mirror: after the
-- scrub, the rows still referencing the candidates are exactly the ones
-- account_file_references reported (arm K3). A later change to account_scrub
-- must change this list in the same migration.
--
-- ROLLBACK: CREATE OR REPLACE account_deletion_files with 228's body (it is
-- account_deletion_candidates' body), then DROP account_file_references and
-- account_deletion_candidates.
--
-- GUARDS. Pre-flight: 228's two functions exist, and every table and column
-- the exclusions name exists. After: the three functions exist as SECURITY
-- DEFINER with search_path '', executable by service_role only;
-- account_deletion_files reads from account_file_references; the two the
-- route calls carry statement_timeout=20s.

BEGIN;

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
SET statement_timeout = '20s'
AS $fn$
DECLARE
  v_started timestamptz := clock_timestamp();
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
    -- Its own budget, for a caller that is not PostgREST (see the header).
    IF clock_timestamp() - v_started > interval '15 seconds' THEN
      RAISE EXCEPTION 'account_file_references: scan stopped after 15 s at %.%', v_col.t, v_col.c
        USING ERRCODE = 'query_canceled';
    END IF;
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
SET statement_timeout = '20s'
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
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE oid IN (to_regprocedure('public.account_file_references(uuid)'),
                            to_regprocedure('public.account_deletion_files(uuid)'))
                AND NOT coalesce('statement_timeout=20s' = ANY (proconfig), false)) THEN
    RAISE EXCEPTION '230 ABORTED: account_file_references and account_deletion_files must carry statement_timeout=20s.';
  END IF;
  RAISE NOTICE '230: account_deletion_files leaves out files a remaining row references; all three functions service_role only.';
END $$;

-- ── Record this migration as applied
INSERT INTO public.migrations_applied (migration, note)
VALUES ('230_t_del2_keep_shared_files',
        'T-DEL2: account deletion keeps any file a remaining row still references (account_file_references) and reports it')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

-- 199_session_media_participants_only.sql
--
-- NORMAL PROCESS. NOT HAND-APPLIED.
--
-- Nothing in this file has been run in production. The branch
-- (hotfix/photo-privacy) merges to main first, and only then is this file
-- pasted, WHOLE, in one paste, into the production SQL editor, stating which
-- commit on main the pasted text corresponds to. If the branch cannot be
-- merged, this file is not pasted.
--
-- NUMBER: 199. Read 2026-10-04 immediately before writing, after `git fetch`:
-- origin/main ends at 198 (d236656d); no local or remote branch carries a 199
-- or higher (`git log --all -- 'supabase/migrations/199*'` is empty). Re-check
-- against origin/main immediately before merge.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT PRODUCTION HAS (read 2026-10-04: pg_policies, storage.buckets, and an
-- anonymous probe of the Storage and REST APIs with only the public anon key)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   storage.buckets
--     session-photos   public = true   168 files. Holds TWO kinds of picture:
--                                      session listing photos (app/create, the
--                                      cards everyone sees, signed in or not)
--                                      and recap photos (20 files named
--                                      *-recap-*, of which only 5 still have a
--                                      session_recap_photos row; the other 15
--                                      are photos whose row was deleted).
--     session-stories  public = true   22 files, for 17 story rows, 0 of them
--                                      unexpired. Story files outlive the
--                                      48-hour row.
--
--   storage.objects SELECT, role public (so anon too):
--     "Anyone can view session photos"         bucket_id = 'session-photos'
--     "Anyone can view session stories"        bucket_id = 'session-stories'
--     "Anyone can view session stories media"  bucket_id = 'session-stories'
--
--   public.session_recap_photos SELECT:
--     "Anyone can view recap photos"   TO authenticated USING (true)
--     "Admins can moderate recap photos" (ALL, is_app_admin())
--   public.session_stories SELECT:
--     "Anyone can view non-expired stories"  TO public USING (expires_at > now())
--
-- WHAT A STRANGER CAN DO TODAY, measured, not inferred: with the anon key that
-- ships in every web bundle, list both buckets (HTTP 200, 19 and 15 folders),
-- enumerate all 168 + 22 files, and download any of them (HTTP 200
-- image/jpeg). That includes recap photos their own uploader deleted and story
-- media from stories that expired months ago. Any signed-in user can read
-- every recap photo row, and anyone, signed in or not, can read every story row
-- for its 48 hours.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS CHANGES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The rule, for recap photos and stories, rows AND files: readable by the
-- session's host, its confirmed participants, the uploader, and app admins.
-- Nobody else, and never anonymously.
--
--   1. can_view_session_media(text) and can_moderate_session_media(text),
--      SECURITY DEFINER, taking the session id as TEXT so a folder name that is
--      not a UUID is refused instead of raising (192's construction). Definer
--      because session_participants is under its own RLS (T-ATH1), and a
--      policy that reads it under the caller's RLS answers a different question.
--   2. Row policies on session_recap_photos and session_stories replaced.
--   3. session-stories becomes PRIVATE. Its three anon-readable policies go;
--      one participant-scoped SELECT replaces them. The app now reads story
--      media through signed URLs (lib/storage/privateMedia.ts), and a signed
--      URL can only be minted by someone this SELECT policy admits.
--   4. A NEW private bucket, session-recap-photos, path
--      <session_id>/<uploader_id>/<file>. New recap uploads go there.
--   5. session-photos STAYS PUBLIC, deliberately. It holds the session listing
--      photos, which are public content by design: logged-out cards, share
--      pages and link previews read them by public URL, and a link preview
--      cannot carry a signature that expires. What goes is the anonymous
--      LISTING ("Anyone can view session photos"), which is what let a stranger
--      enumerate the bucket; a public bucket serves a file by URL without any
--      SELECT policy. An owner-only SELECT replaces it, because Storage needs
--      SELECT for remove().
--
-- The five live recap files and the 15 orphaned ones still sit in
-- session-photos after this migration. They can no longer be listed, but each
-- is still downloadable by anyone holding its exact URL. Moving them is
-- scripts/moveRecapPhotosToPrivateBucket.ts, run AFTER this migration
-- (dry run by default; deleting the 15 orphans is a separate flag and Al's
-- call). Until it runs, the app shows those 5 legacy URLs unchanged.
--
-- WHO GAINS AND WHO LOSES:
--   * anon: loses listing of both buckets and every story row. The fix.
--   * signed in, not host, not confirmed, not uploader: loses recap rows, story
--     rows and story files of that session. The fix. Visible consequence: the
--     Home feed's recap strip on an instructor's card, and the global stories
--     row, now show only photos from sessions the viewer was part of. With 5
--     recap rows and 0 live stories in production today, that is close to
--     nothing.
--   * pending participant: treated as not in the session. Same as above.
--   * host, confirmed participant, uploader, admin: unchanged reads.
--   * host: GAINS delete of other people's recap files in the new bucket,
--     matching the row policy "hosts can delete any" that already exists.
--   * session listing photos: unchanged. Public by URL, as today.
--
-- NOT CHANGED HERE, found in the same read and reported separately:
--   * "Users can report photos" (UPDATE on session_recap_photos, USING
--     auth.role() = 'authenticated', no WITH CHECK, table-level UPDATE grant):
--     a signed-in user can rewrite any column of any recap row they can SEE.
--     After this migration that narrows to host and participants of the
--     session, because UPDATE ... WHERE also applies the SELECT policies; it
--     is still an integrity hole and needs its own fix (a definer RPC that
--     writes only the report columns).
--   * Both INSERT row policies check only user_id = auth.uid(), and the
--     session-stories INSERT storage policies check only the bucket, so a
--     signed-in user can still add a story or recap row to a session they are
--     not in. Reading is closed by this migration; writing is a separate fix.

-- ── 0. Pre-flight ──────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_recap   text[];
  v_story   text[];
  v_storage text[];
BEGIN
  IF (SELECT count(*) FROM storage.buckets WHERE id IN ('session-photos', 'session-stories')) <> 2 THEN
    RAISE EXCEPTION '199 ABORTED: session-photos or session-stories bucket is missing.';
  END IF;
  IF to_regprocedure('public.is_app_admin()') IS NULL THEN
    RAISE EXCEPTION '199 ABORTED: public.is_app_admin() does not exist; the admin arm of every policy here depends on it.';
  END IF;

  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_recap
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'session_recap_photos' AND cmd IN ('SELECT', 'ALL');
  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_story
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'session_stories' AND cmd IN ('SELECT', 'ALL');
  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_storage
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('SELECT', 'ALL')
     AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'session-(photos|stories|recap-photos)';

  IF v_recap = ARRAY['Admins can moderate recap photos', 'Host and confirmed participants view recap photos']
     AND v_story = ARRAY['Host and confirmed participants view stories']
     AND v_storage = ARRAY['Owners read their session photos',
                           'Session members read recap photo files',
                           'Session members read session stories media'] THEN
    RAISE NOTICE '199: already applied; re-running is a no-op apart from CREATE OR REPLACE.';
  ELSIF v_recap IS DISTINCT FROM ARRAY['Admins can moderate recap photos', 'Anyone can view recap photos'] THEN
    RAISE EXCEPTION '199 ABORTED: SELECT policies on session_recap_photos are not the ones read on 2026-10-04. Live: %', v_recap;
  ELSIF v_story IS DISTINCT FROM ARRAY['Anyone can view non-expired stories'] THEN
    RAISE EXCEPTION '199 ABORTED: SELECT policies on session_stories are not the one read on 2026-10-04. Live: %', v_story;
  ELSIF v_storage IS DISTINCT FROM ARRAY['Anyone can view session photos',
                                         'Anyone can view session stories',
                                         'Anyone can view session stories media'] THEN
    RAISE EXCEPTION '199 ABORTED: storage SELECT policies on the session buckets are not the three read on 2026-10-04. Live: %', v_storage;
  END IF;

  -- The policy this replaces must still be the open one. If someone scoped it
  -- since 2026-10-04, dropping it would discard that work.
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'session_recap_photos'
                AND policyname = 'Anyone can view recap photos' AND qual IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION '199 ABORTED: "Anyone can view recap photos" is no longer USING (true).';
  END IF;
END $pre$;

-- ── 1. Who may see a session's media ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_session_media(p_session text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_session IS NULL
     OR p_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.sessions s
                  WHERE s.id = p_session::uuid AND s.creator_id = v_uid)
      OR EXISTS (SELECT 1 FROM public.session_participants sp
                  WHERE sp.session_id = p_session::uuid
                    AND sp.user_id = v_uid
                    AND sp.status = 'confirmed')
      OR coalesce(public.is_app_admin(), false);
END;
$fn$;

COMMENT ON FUNCTION public.can_view_session_media(text) IS
  '199. True when the caller is the host of session <p_session>, a CONFIRMED participant of it, or an app admin. Gates recap photo and story rows and files. Text argument so a non-UUID storage folder is refused, not raised.';

CREATE OR REPLACE FUNCTION public.can_moderate_session_media(p_session text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_session IS NULL
     OR p_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.sessions s
                  WHERE s.id = p_session::uuid AND s.creator_id = v_uid)
      OR coalesce(public.is_app_admin(), false);
END;
$fn$;

COMMENT ON FUNCTION public.can_moderate_session_media(text) IS
  '199. True when the caller is the host of session <p_session> or an app admin. Lets a host remove any recap photo file of their session, matching the row policy that already lets them delete the row.';

REVOKE ALL ON FUNCTION public.can_view_session_media(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_moderate_session_media(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_session_media(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_moderate_session_media(text) TO authenticated, service_role;

-- ── 2. Row policies ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view recap photos" ON public.session_recap_photos;
DROP POLICY IF EXISTS "Host and confirmed participants view recap photos" ON public.session_recap_photos;
CREATE POLICY "Host and confirmed participants view recap photos"
  ON public.session_recap_photos FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.can_view_session_media(session_id::text));

DROP POLICY IF EXISTS "Anyone can view non-expired stories" ON public.session_stories;
DROP POLICY IF EXISTS "Host and confirmed participants view stories" ON public.session_stories;
CREATE POLICY "Host and confirmed participants view stories"
  ON public.session_stories FOR SELECT
  TO authenticated
  USING (expires_at > now()
         AND (user_id = auth.uid() OR public.can_view_session_media(session_id::text)));

COMMENT ON COLUMN public.session_recap_photos.photo_url IS
  'The file''s Storage URL in public form. Since 199 new files live in the PRIVATE session-recap-photos bucket, where this URL identifies the file but does not serve it: readers mint a signed URL from it (lib/storage/privateMedia.ts). Rows written before 199 point into session-photos until scripts/moveRecapPhotosToPrivateBucket.ts moves them.';
COMMENT ON COLUMN public.session_stories.media_url IS
  'The file''s Storage URL in public form. Since 199 the session-stories bucket is PRIVATE: this URL identifies the file and readers mint a signed URL from it (lib/storage/privateMedia.ts).';

-- ── 3. Buckets ─────────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'session-stories';

-- Both recap uploaders compress to JPEG first (compressImage). 5 MB and three
-- image types, same as 192's banners.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('session-recap-photos', 'session-recap-photos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 4. Storage policies ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view session stories" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view session stories media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view session photos" ON storage.objects;

-- Story path: <session_id>/<uploader_id>/<file> (components/StoryUpload.tsx).
DROP POLICY IF EXISTS "Session members read session stories media" ON storage.objects;
CREATE POLICY "Session members read session stories media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'session-stories'
    AND ((storage.foldername(name))[2] = auth.uid()::text
         OR public.can_view_session_media((storage.foldername(name))[1]))
  );

-- Listing path: <owner_id>/<file> (app/create/PhotoUploadSection.tsx). Files
-- stay public by URL; only the owner may list or select them through the API.
DROP POLICY IF EXISTS "Owners read their session photos" ON storage.objects;
CREATE POLICY "Owners read their session photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'session-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Recap path: <session_id>/<uploader_id>/<file> (lib/storage/recapPhotoUpload.ts).
DROP POLICY IF EXISTS "Session members read recap photo files" ON storage.objects;
CREATE POLICY "Session members read recap photo files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'session-recap-photos'
    AND ((storage.foldername(name))[2] = auth.uid()::text
         OR public.can_view_session_media((storage.foldername(name))[1]))
  );

-- Upload only into your own folder of a session you are part of.
DROP POLICY IF EXISTS "Session members upload recap photo files" ON storage.objects;
CREATE POLICY "Session members upload recap photo files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'session-recap-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.can_view_session_media((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "Uploaders and hosts delete recap photo files" ON storage.objects;
CREATE POLICY "Uploaders and hosts delete recap photo files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'session-recap-photos'
    AND ((storage.foldername(name))[2] = auth.uid()::text
         OR public.can_moderate_session_media((storage.foldername(name))[1]))
  );

-- ── 5. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n int;
BEGIN
  -- Policies are OR'd: one open SELECT policy cancels every scoped one. Each
  -- SELECT or ALL policy on the two tables must go through the helper or be
  -- the admin policy.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('session_recap_photos', 'session_stories')
     AND cmd IN ('SELECT', 'ALL')
     AND position('can_view_session_media' IN coalesce(qual, '')) = 0
     AND coalesce(qual, '') <> 'is_app_admin()';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '199 ABORTED: % SELECT policy(ies) on recap photos or stories do not check can_view_session_media.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('session_recap_photos', 'session_stories')
     AND cmd IN ('SELECT', 'ALL') AND roles && ARRAY['public', 'anon']::name[];
  IF v_n <> 0 THEN
    RAISE EXCEPTION '199 ABORTED: % SELECT policy(ies) on recap photos or stories still apply to anon or public.', v_n;
  END IF;

  -- Same rule for the files, under any policy name.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('SELECT', 'ALL')
     AND coalesce(qual, '') ~ 'session-(stories|recap-photos)'
     AND position('can_view_session_media' IN coalesce(qual, '')) = 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '199 ABORTED: % storage SELECT policy(ies) on session-stories or session-recap-photos do not check can_view_session_media.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('SELECT', 'ALL')
     AND coalesce(qual, '') ~ 'session-photos'
     AND position('auth.uid()' IN coalesce(qual, '')) = 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '199 ABORTED: % storage SELECT policy(ies) on session-photos are not owner-scoped; the bucket can still be listed.', v_n;
  END IF;

  IF (SELECT public FROM storage.buckets WHERE id = 'session-stories')
     OR (SELECT public FROM storage.buckets WHERE id = 'session-recap-photos') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '199 ABORTED: session-stories or session-recap-photos is not private.';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'session-photos') IS DISTINCT FROM true THEN
    RAISE EXCEPTION '199 ABORTED: session-photos is no longer public; every session listing photo would stop loading.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.can_view_session_media(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.can_moderate_session_media(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '199 ABORTED: authenticated cannot execute the media helpers; every session member would be refused.';
  END IF;
  IF has_function_privilege('anon', 'public.can_view_session_media(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.can_moderate_session_media(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '199 ABORTED: anon can execute a media helper.';
  END IF;

  RAISE NOTICE '199: recap photos and stories readable by host, confirmed participants, uploader and admin only.';
END $$;

-- ── 6. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('199_session_media_participants_only', 'P1-0 photo privacy: recap photos and stories readable by host, confirmed participants, uploader, admin; session-stories private; new private session-recap-photos bucket; session-photos no longer listable')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  NOT (SELECT public FROM storage.buckets WHERE id = 'session-stories')            AS stories_bucket_private_ok,
  NOT (SELECT public FROM storage.buckets WHERE id = 'session-recap-photos')       AS recap_bucket_private_ok,
  (SELECT public FROM storage.buckets WHERE id = 'session-photos')                 AS listing_photos_still_public_ok,
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname IN ('Anyone can view session photos', 'Anyone can view session stories',
                                    'Anyone can view session stories media'))     AS anon_listing_gone_ok,
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public'
                 AND policyname IN ('Anyone can view recap photos', 'Anyone can view non-expired stories'))
                                                                                    AS open_row_policies_gone_ok,
  NOT has_function_privilege('anon', 'public.can_view_session_media(text)', 'EXECUTE') AS anon_cannot_run_helper_ok,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'session-photos' AND name ~ '-recap-')
                                                                                    AS recap_files_left_to_move,
  EXISTS (SELECT 1 FROM public.migrations_applied
           WHERE migration = '199_session_media_participants_only')                 AS recorded_ok;

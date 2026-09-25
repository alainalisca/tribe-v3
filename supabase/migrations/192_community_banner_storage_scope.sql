-- 192_community_banner_storage_scope.sql
--
-- T-COMM1. Any signed-in user can upload or overwrite a banner in ANY
-- community's folder of the community-banners bucket, because two policies
-- from 090 check only the bucket id. Storage policies are OR'd, so those two
-- cancel the owner-scoped ones from 038. This replaces all five write policies
-- with three that admit exactly who the communities UPDATE policy admits: the
-- creator, or a member whose role is 'admin', on a community that is not
-- deleted. It also gives the bucket a size limit and an image-only type list.
--
-- NUMBER: 192 was the next free number on origin/main at 2f30b10, and no
-- remote branch carries a 192. Re-check against origin/main immediately before
-- merge; a number belongs to whichever branch merges first.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT PRODUCTION HAS (read 2026-09-25, pg_policies and storage.buckets)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   Write policies on storage.objects that mention community-banners, five:
--     "Authenticated users can upload community banners"  INSERT  bucket only
--     "Authenticated users can update community banners"  UPDATE  bucket only
--     "Community owners can upload banners"                INSERT  creator only
--     "Community owners can update banners"                UPDATE  creator only
--     "Community owners can delete banners"                DELETE  creator only
--   Read: "Anyone can read community banners". Not touched here.
--   Bucket: public, no size limit, any content type.
--   Objects: 2, both referenced by a community row, 0 orphans, no folder that
--   is not a real community. The open policies have not been abused.
--
-- WHAT A STRANGER CAN DO TODAY: upload into any community's folder, and
-- overwrite any existing banner file in place (the open UPDATE policy), which
-- changes the picture on that community's page without touching its row.
-- With no type or size limit, the file does not even have to be an image.
--
-- WHY A HELPER FUNCTION AND NOT AN EXISTS IN THE POLICY. The 038 policies read
-- public.communities inside the policy, which runs under the CALLER's RLS. The
-- communities SELECT policy only shows a private community to its creator, so
-- an admin of a private community would be refused even after adding an admin
-- arm. can_manage_community_banner() is SECURITY DEFINER, so it sees the row
-- and applies the same rule as the communities UPDATE policy directly. It also
-- returns false for a folder name that is not a UUID, where 038's ::uuid cast
-- raised an error instead of refusing.
--
-- WHO GAINS AND WHO LOSES:
--   * anyone signed in, not creator or admin: loses upload and overwrite. The fix.
--   * admin member (not creator): GAINS upload, overwrite and delete. The edit
--     page already shows them the banner control since T-COMM2.
--   * moderator: still refused. Matches the UI since T-COMM2.
--   * anyone, on a soft-deleted community: refused. The row is frozen, so is its
--     banner.
--   * reads: unchanged. The bucket stays public.
--
-- The app change in the same PR writes every banner to one fixed path,
-- <community_id>/banner.jpg, with upsert, and removes older files in the folder
-- after a successful save. That is what stops the storage leak. This migration
-- does not depend on it and it does not depend on this migration; either can
-- land first.

-- ── 0. Pre-flight ──────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_names text[];
  v_open  text;
  v_n     int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'community-banners') THEN
    RAISE EXCEPTION '192 ABORTED: the community-banners bucket does not exist.';
  END IF;

  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_names
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-banners%';

  IF v_names = ARRAY[
       'Community managers can delete banners',
       'Community managers can update banners',
       'Community managers can upload banners'] THEN
    RAISE NOTICE '192: already applied; re-running is a no-op apart from CREATE OR REPLACE.';
  ELSIF v_names IS DISTINCT FROM ARRAY[
       'Authenticated users can update community banners',
       'Authenticated users can upload community banners',
       'Community owners can delete banners',
       'Community owners can update banners',
       'Community owners can upload banners'] THEN
    RAISE EXCEPTION
      '192 ABORTED: the write policies on community-banners are not the five read on 2026-09-25. Live: %', v_names;
  END IF;

  -- The two open policies must still be bucket-only. If someone scoped them
  -- since 2026-09-25, dropping them would discard that work.
  FOR v_open IN
    SELECT regexp_replace(coalesce(with_check, qual, ''), '\s+', '', 'g')
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('Authenticated users can upload community banners',
                          'Authenticated users can update community banners')
  LOOP
    IF v_open <> '(bucket_id=''community-banners''::text)' THEN
      RAISE EXCEPTION '192 ABORTED: an open banner policy is no longer bucket-only. Live: %', v_open;
    END IF;
  END LOOP;

  -- The new limits apply to new uploads only, but say so if an existing file
  -- would not pass them.
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'community-banners'
     AND (coalesce((metadata->>'size')::bigint, 0) > 5242880
          OR coalesce(metadata->>'mimetype', '') NOT IN ('image/jpeg', 'image/png', 'image/webp'));
  IF v_n > 0 THEN
    RAISE NOTICE '192: % existing banner file(s) are over 5 MB or not jpeg/png/webp. They stay readable; only new uploads are checked.', v_n;
  END IF;
END $pre$;

-- ── 1. Who may write a community's banner folder ───────────────────────────
--
-- Same rule as the communities UPDATE policy after 190: not deleted, and the
-- caller is the creator or an admin member. Takes the folder name as text so a
-- non-UUID folder is refused instead of raising.
CREATE OR REPLACE FUNCTION public.can_manage_community_banner(p_folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_folder IS NULL
     OR p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.communities c
     WHERE c.id = p_folder::uuid
       AND c.deleted_at IS NULL
       AND (c.creator_id = v_uid
            OR EXISTS (SELECT 1 FROM public.community_members m
                        WHERE m.community_id = c.id
                          AND m.user_id = v_uid
                          AND m.role = 'admin'))
  );
END;
$fn$;

COMMENT ON FUNCTION public.can_manage_community_banner(text) IS
  'T-COMM1 (192). True when the caller may write <folder>/ in the community-banners bucket: creator or admin member of a live community. Mirrors the communities UPDATE policy.';

REVOKE ALL ON FUNCTION public.can_manage_community_banner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_community_banner(text) TO authenticated;

-- ── 2. Replace the five write policies with three ──────────────────────────
DROP POLICY IF EXISTS "Authenticated users can upload community banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update community banners" ON storage.objects;
DROP POLICY IF EXISTS "Community owners can upload banners" ON storage.objects;
DROP POLICY IF EXISTS "Community owners can update banners" ON storage.objects;
DROP POLICY IF EXISTS "Community owners can delete banners" ON storage.objects;

DROP POLICY IF EXISTS "Community managers can upload banners" ON storage.objects;
CREATE POLICY "Community managers can upload banners"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'community-banners'
    AND public.can_manage_community_banner((storage.foldername(name))[1])
  );

-- USING decides which existing files the caller may overwrite; WITH CHECK
-- stops a rename that moves a file into a folder the caller does not manage.
DROP POLICY IF EXISTS "Community managers can update banners" ON storage.objects;
CREATE POLICY "Community managers can update banners"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'community-banners'
    AND public.can_manage_community_banner((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'community-banners'
    AND public.can_manage_community_banner((storage.foldername(name))[1])
  );

-- Needed so the app can remove the older files in the folder after a save.
DROP POLICY IF EXISTS "Community managers can delete banners" ON storage.objects;
CREATE POLICY "Community managers can delete banners"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'community-banners'
    AND public.can_manage_community_banner((storage.foldername(name))[1])
  );

-- ── 3. Bucket limits ───────────────────────────────────────────────────────
--
-- Both upload paths compress to JPEG before sending (about 1200px, well under
-- 1 MB). 5 MB and three image types leave room without admitting anything
-- that is not a picture.
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'community-banners';

-- ── 4. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n int;
BEGIN
  -- The arm that matters: no write policy on this bucket is bucket-only, under
  -- any name. Policies are OR'd; one open policy cancels the rest.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-banners%'
     -- Each expression that decides a write must check it. For UPDATE that is
     -- both: USING picks the files that may be overwritten, WITH CHECK where
     -- they may end up. One open half is still an open policy.
     AND (   (cmd IN ('UPDATE', 'DELETE', 'ALL')
              AND position('can_manage_community_banner' IN coalesce(qual, '')) = 0)
          OR (cmd IN ('INSERT', 'UPDATE', 'ALL')
              AND position('can_manage_community_banner' IN coalesce(with_check, '')) = 0));
  IF v_n <> 0 THEN
    RAISE EXCEPTION '192 ABORTED: % write policy(ies) on community-banners do not check can_manage_community_banner.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-banners%';
  IF v_n <> 3 THEN
    RAISE EXCEPTION '192 ABORTED: expected 3 write policies on community-banners, found %.', v_n;
  END IF;

  -- Upsert needs all three: INSERT for a new file, UPDATE to replace one, and
  -- the app's cleanup needs DELETE.
  IF (SELECT count(DISTINCT cmd) FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
         AND policyname LIKE 'Community managers can % banners') <> 3 THEN
    RAISE EXCEPTION '192 ABORTED: the INSERT, UPDATE and DELETE banner policies are not all present.';
  END IF;

  -- The update policy must check the destination too.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'Community managers can update banners'
                    AND position('can_manage_community_banner' IN coalesce(with_check, '')) > 0) THEN
    RAISE EXCEPTION '192 ABORTED: the banner UPDATE policy has no WITH CHECK.';
  END IF;

  -- Banners stay readable by everyone.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'Anyone can read community banners' AND cmd = 'SELECT')
     OR NOT (SELECT public FROM storage.buckets WHERE id = 'community-banners') THEN
    RAISE EXCEPTION '192 ABORTED: community banners are no longer publicly readable.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.can_manage_community_banner(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '192 ABORTED: authenticated cannot execute can_manage_community_banner; every banner upload would fail.';
  END IF;
  IF has_function_privilege('anon', 'public.can_manage_community_banner(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '192 ABORTED: anon can execute can_manage_community_banner.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets
                  WHERE id = 'community-banners'
                    AND file_size_limit = 5242880
                    AND allowed_mime_types @> ARRAY['image/jpeg']
                    AND NOT allowed_mime_types && ARRAY['image/svg+xml', 'text/html']) THEN
    RAISE EXCEPTION '192 ABORTED: the community-banners bucket limits did not apply.';
  END IF;

  RAISE NOTICE '192: community-banners writes scoped to creator or admin, bucket limited to 5 MB of jpeg/png/webp.';
END $$;

-- ── 5. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('192_community_banner_storage_scope', 'T-COMM1: community-banners writes scoped to creator/admin via can_manage_community_banner; bucket size and type limits')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-banners%'
      AND (   (cmd IN ('UPDATE', 'DELETE', 'ALL')
               AND position('can_manage_community_banner' IN coalesce(qual, '')) = 0)
           OR (cmd IN ('INSERT', 'UPDATE', 'ALL')
               AND position('can_manage_community_banner' IN coalesce(with_check, '')) = 0))) = 0
                                                                                    AS no_open_write_policy_ok,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'Community managers can % banners') = 3                AS three_scoped_policies_ok,
  EXISTS (SELECT 1 FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname = 'Anyone can read community banners')                AS public_read_kept_ok,
  (SELECT file_size_limit = 5242880 FROM storage.buckets WHERE id = 'community-banners')
                                                                                    AS size_limit_ok,
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'community-banners')  AS allowed_types,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'community-banners')      AS banner_files,
  EXISTS (SELECT 1 FROM public.migrations_applied
           WHERE migration = '192_community_banner_storage_scope')                  AS recorded_ok;

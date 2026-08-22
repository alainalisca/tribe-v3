-- 145_sec4_media_bucket_lockdown.sql
-- T-SEC4: harden the public `media` Storage bucket.
--
-- Captures three dashboard/audit changes plus the real write-policy fix:
--   1. Bucket limits: file_size_limit 50 MB + allowed_mime_types allowlist.
--   2. Drop the broad "Anyone can read media" SELECT policy (it let ANY client
--      LIST every object in the bucket — the Supabase advisory).
--   3. Replace migration 091's TWO bucket_id-only write policies (INSERT/UPDATE,
--      which let ANY authenticated user write ANY object in media) with
--      owner-scoped equivalents, and add a DELETE policy so a user can remove
--      their own storefront video and community-post images. (091 shipped no
--      DELETE, which is why a removed storefront video orphaned in the bucket.)
--
-- PATH SHAPES (the owner uid sits at a DIFFERENT foldername[] index per prefix):
--   storefront-banners/<uid>/<ts>.<ext>              -> uid = foldername[2]
--   storefront-videos/<uid>/intro.mp4                -> uid = foldername[2]
--   community-posts/<communityId>/<uid>/post-*.jpg   -> uid = foldername[3]
--
-- storefront-banners is intentionally NOT covered by the new policies: its
-- owner-scoped INSERT/UPDATE/DELETE already exist from migration 057. The new
-- policies below cover the two prefixes 057 does not: storefront-videos and
-- community-posts.
--
-- Reads still work after dropping the broad SELECT: `media` is a PUBLIC bucket,
-- so object URLs are served through the public endpoint, which bypasses RLS.
-- No code lists the bucket (verified), so removing the broad SELECT is safe.
--
-- Rolling-safe: additive first (bucket limits + new policies), destructive drops
-- in a separate section at the very bottom.

-- ── Section 1: bucket limits (additive) ────────────────────────────────────
-- 50 MB matches the client-side video cap (lib/videoValidation.ts MAX_VIDEO_BYTES).
-- The MIME allowlist covers every prefix: banners (jpeg/png/webp), community
-- posts (jpeg), storefront videos (mp4). Verified: zero HEIC objects exist and
-- every media upload path is jpeg/png/webp/mp4, so this cannot break iPhone
-- uploads to this bucket.
UPDATE storage.buckets
   SET file_size_limit    = 52428800,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
 WHERE id = 'media';

-- ── Section 2: owner-scoped write policies (additive) ──────────────────────
-- Scope: storefront-videos + community-posts (banners stay on migration 057).
-- The owner-uid segment must equal auth.uid(); its index differs by prefix.
DROP POLICY IF EXISTS "Users can upload own media" ON storage.objects;
CREATE POLICY "Users can upload own media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;
CREATE POLICY "Users can update own media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
CREATE POLICY "Users can delete own media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  );

-- ── Section 3: DROP the broad migration-091 policies (destructive, last) ─────
-- Superseded: writes are now owner-scoped (Section 2 for videos/posts,
-- migration 057 for banners); reads are served by the public bucket endpoint.
DROP POLICY IF EXISTS "Anyone can read media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update media" ON storage.objects;

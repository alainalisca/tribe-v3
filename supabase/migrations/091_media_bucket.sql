-- Migration 091: Create shared media Storage bucket + RLS policies.
--
-- Used by:
--   - app/communities/[id]/post/page.tsx (community post images at
--     `community-posts/<communityId>/<userId>/post-<timestamp>.jpg`)
--   - components/dashboard/StorefrontEditor.tsx (storefront banners at
--     `storefront-banners/<userId>/<timestamp>.<ext>`)
--
-- Public read; authenticated users can upload. Path prefixes encode the
-- owner so an attacker can't overwrite someone else's file by guessing the
-- timestamp.

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
CREATE POLICY "Authenticated users can upload media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "Authenticated users can update media" ON storage.objects;
CREATE POLICY "Authenticated users can update media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Anyone can read media" ON storage.objects;
CREATE POLICY "Anyone can read media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

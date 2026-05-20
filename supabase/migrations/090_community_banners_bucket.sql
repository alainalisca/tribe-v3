-- Migration 090: Create community-banners Storage bucket + RLS policies.
--
-- Used by app/communities/[id]/page.tsx (handleBannerUpload). Path format:
-- `<communityId>/banner-<timestamp>.jpg`. The upload control is only exposed
-- in the UI to community owners, admins, and moderators; RLS just gates that
-- the user is authenticated. Public read so banners render for everyone.

INSERT INTO storage.buckets (id, name, public)
VALUES ('community-banners', 'community-banners', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload community banners" ON storage.objects;
CREATE POLICY "Authenticated users can upload community banners"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'community-banners');

DROP POLICY IF EXISTS "Authenticated users can update community banners" ON storage.objects;
CREATE POLICY "Authenticated users can update community banners"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'community-banners');

DROP POLICY IF EXISTS "Anyone can read community banners" ON storage.objects;
CREATE POLICY "Anyone can read community banners"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-banners');

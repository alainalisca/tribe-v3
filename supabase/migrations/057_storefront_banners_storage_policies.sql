-- 057_storefront_banners_storage_policies.sql
--
-- Adds storage RLS policies for `storefront-banners/<auth-uid>/...` paths
-- in the `media` bucket. Without these, instructor banner uploads from the
-- dashboard StorefrontEditor fail with "new row violates row-level security
-- policy" — the same family of bug that migration 038 fixed for
-- `community-banners`.
--
-- StorefrontEditor uses `upsert: true`, so DELETE permission is required
-- in addition to INSERT/UPDATE (Supabase storage's upsert deletes the
-- existing object before inserting the new one). This is the lesson from
-- 038's QA-12 incident.
--
-- Public SELECT is required so anonymous visitors of /storefront/[id] can
-- fetch the banner image.
--
-- TODO: there is a parallel architectural inconsistency where
-- /onboarding/instructor uploads to a DIFFERENT bucket (`profile-images`,
-- path `banners/banner-<userId>-...`). New banners from onboarding land in
-- one bucket, dashboard updates land in another. That cleanup needs its
-- own migration plus a code change to consolidate on one bucket. Tracked
-- separately — this migration only unblocks the dashboard editor.

-- Public read on storefront banners (instructor profiles are public marketing surfaces).
drop policy if exists "Storefront banners are publicly readable" on storage.objects;
create policy "Storefront banners are publicly readable"
  on storage.objects for select
  using (
    bucket_id = 'media'
    and (storage.foldername(storage.objects.name))[1] = 'storefront-banners'
  );

-- Authenticated instructors can upload their own banner.
-- Path shape: `storefront-banners/<auth.uid()>/<timestamp>.<ext>`.
drop policy if exists "Instructors can upload own storefront banner" on storage.objects;
create policy "Instructors can upload own storefront banner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(storage.objects.name))[1] = 'storefront-banners'
    and (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

-- Authenticated instructors can update their own banner files.
drop policy if exists "Instructors can update own storefront banner" on storage.objects;
create policy "Instructors can update own storefront banner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(storage.objects.name))[1] = 'storefront-banners'
    and (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

-- Authenticated instructors can delete their own banner files.
-- Required so `upsert: true` works on replacement uploads (see 038/QA-12).
drop policy if exists "Instructors can delete own storefront banner" on storage.objects;
create policy "Instructors can delete own storefront banner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(storage.objects.name))[1] = 'storefront-banners'
    and (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

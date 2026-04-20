-- 040_bulletin_flyers_bucket.sql
-- QA-19: replace "Flyer Image URL" paste field with direct file upload.
-- Creates the storage bucket the bulletin tab uploads to + RLS policies.

insert into storage.buckets (id, name, public)
values ('community-bulletin-flyers', 'community-bulletin-flyers', true)
on conflict (id) do nothing;

-- File path format: ${userId}/${timestamp}.${ext}
-- A user can only upload into their own folder (first path segment = their uid).
drop policy if exists "Users can upload own bulletin flyers" on storage.objects;
create policy "Users can upload own bulletin flyers"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-bulletin-flyers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own bulletin flyers" on storage.objects;
create policy "Users can update own bulletin flyers"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'community-bulletin-flyers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own bulletin flyers" on storage.objects;
create policy "Users can delete own bulletin flyers"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-bulletin-flyers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read so anyone can see the flyer image in the bulletin feed.
drop policy if exists "Anyone can view bulletin flyers" on storage.objects;
create policy "Anyone can view bulletin flyers"
  on storage.objects for select
  to public
  using (bucket_id = 'community-bulletin-flyers');

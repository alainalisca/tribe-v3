-- Migration: community-banners storage bucket and policies
-- Allows community owners (creator_id) to upload banner images,
-- and anyone to view banner images.

insert into storage.buckets (id, name, public)
values ('community-banners', 'community-banners', true)
on conflict (id) do nothing;

drop policy if exists "Community owners can upload banners" on storage.objects;
create policy "Community owners can upload banners"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-banners'
    and exists (
      select 1 from public.communities
      where communities.creator_id = auth.uid()
    )
  );

drop policy if exists "Community owners can update banners" on storage.objects;
create policy "Community owners can update banners"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'community-banners'
    and exists (
      select 1 from public.communities
      where communities.creator_id = auth.uid()
    )
  );

drop policy if exists "Anyone can view community banners" on storage.objects;
create policy "Anyone can view community banners"
  on storage.objects for select
  to public
  using (bucket_id = 'community-banners');

-- 038_community_banners_rls_fix.sql
-- QA-12: "Failed to upload banner" on the communities page.
-- Root cause in migration 026: the INSERT/UPDATE policies check
--   `exists (select 1 from communities where creator_id = auth.uid())`
-- which is unscoped — passes for ANY community creator but doesn't prove
-- the user can write to THIS community's folder. Worse, there was no
-- DELETE policy, so Supabase storage `upsert: true` fails when a banner
-- already exists (it tries to remove-then-insert, and delete is blocked).
--
-- Fix: tighten the policies so a user can write/delete a banner only in
-- the folder for a community they created, AND add the missing DELETE
-- policy so upsert works for replacements.

-- Drop the old loose policies and recreate them scoped to the community's
-- folder. storage.foldername(name) returns the path segments; for
-- `${community_id}/banner-xxx.jpg` the first segment is the community id.

drop policy if exists "Community owners can upload banners" on storage.objects;
create policy "Community owners can upload banners"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-banners'
    and exists (
      select 1 from public.communities c
      where c.id = ((storage.foldername(storage.objects.name))[1])::uuid
        and c.creator_id = auth.uid()
    )
  );

drop policy if exists "Community owners can update banners" on storage.objects;
create policy "Community owners can update banners"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'community-banners'
    and exists (
      select 1 from public.communities c
      where c.id = ((storage.foldername(storage.objects.name))[1])::uuid
        and c.creator_id = auth.uid()
    )
  );

-- NEW: allow the creator to delete their own community's banner files.
-- Without this, upsert: true uploads fail once a banner has ever been set.
drop policy if exists "Community owners can delete banners" on storage.objects;
create policy "Community owners can delete banners"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-banners'
    and exists (
      select 1 from public.communities c
      where c.id = ((storage.foldername(storage.objects.name))[1])::uuid
        and c.creator_id = auth.uid()
    )
  );

-- SELECT policy from migration 026 is fine (public read) — no change needed.

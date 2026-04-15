-- Migration: community post moderation
-- Adds is_pinned/pinned_at columns, allows community admins (creator_id) to delete posts,
-- and creates a community_post_reports table for member reports.

alter table public.community_posts add column if not exists is_pinned boolean default false;
alter table public.community_posts add column if not exists pinned_at timestamptz;

create index if not exists idx_community_posts_pinned
  on public.community_posts(community_id, is_pinned, pinned_at desc);

drop policy if exists "Authors can delete own posts" on public.community_posts;
drop policy if exists "Authors or community admins can delete posts" on public.community_posts;
create policy "Authors or community admins can delete posts"
  on public.community_posts for delete
  using (
    auth.uid() = author_id
    or exists (
      select 1 from public.communities
      where communities.id = community_posts.community_id
        and communities.creator_id = auth.uid()
    )
  );

-- Community admins can update posts (for pin/unpin)
drop policy if exists "Community admins can update posts" on public.community_posts;
create policy "Community admins can update posts"
  on public.community_posts for update
  using (
    exists (
      select 1 from public.communities
      where communities.id = community_posts.community_id
        and communities.creator_id = auth.uid()
    )
  );

create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reason text,
  resolved boolean default false,
  created_at timestamptz default now(),
  unique (post_id, reporter_id)
);

create index if not exists idx_community_post_reports_post
  on public.community_post_reports(post_id);

alter table public.community_post_reports enable row level security;

drop policy if exists "Members can report posts" on public.community_post_reports;
create policy "Members can report posts"
  on public.community_post_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "Community admins can read reports" on public.community_post_reports;
create policy "Community admins can read reports"
  on public.community_post_reports for select
  using (
    exists (
      select 1 from public.communities c
      join public.community_posts p on p.community_id = c.id
      where p.id = community_post_reports.post_id
        and c.creator_id = auth.uid()
    )
  );

drop policy if exists "Community admins can resolve reports" on public.community_post_reports;
create policy "Community admins can resolve reports"
  on public.community_post_reports for update
  using (
    exists (
      select 1 from public.communities c
      join public.community_posts p on p.community_id = c.id
      where p.id = community_post_reports.post_id
        and c.creator_id = auth.uid()
    )
  );

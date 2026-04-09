-- ============================================================
-- Migration: user_feedback table + storage bucket
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Create the user_feedback table
create table if not exists public.user_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null check (category in ('bug', 'feature_request', 'general')),
  message text not null check (char_length(message) >= 10),
  screenshot_url text,
  device_info jsonb default '{}'::jsonb,
  app_version text,
  status text default 'new' check (status in ('new', 'reviewed', 'in_progress', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Add comment for documentation
comment on table public.user_feedback is 'User-submitted feedback from in-app feedback widget';

-- 3. Create indexes
create index idx_user_feedback_user_id on public.user_feedback(user_id);
create index idx_user_feedback_status on public.user_feedback(status);
create index idx_user_feedback_category on public.user_feedback(category);
create index idx_user_feedback_created_at on public.user_feedback(created_at desc);

-- 4. Enable RLS
alter table public.user_feedback enable row level security;

-- 5. RLS Policies

-- Users can insert their own feedback
create policy "Users can insert own feedback"
  on public.user_feedback
  for insert
  with check (auth.uid() = user_id);

-- Users can view their own feedback (so they can see status updates)
create policy "Users can view own feedback"
  on public.user_feedback
  for select
  using (auth.uid() = user_id);

-- Service role (used by API route) bypasses RLS automatically,
-- so no admin policy needed for server-side reads.

-- 6. Auto-update updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_user_feedback_updated
  before update on public.user_feedback
  for each row
  execute function public.handle_updated_at();

-- 7. Create storage bucket for feedback screenshots
insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', false)
on conflict (id) do nothing;

-- 8. Storage RLS: users can upload to their own folder
create policy "Users can upload feedback screenshots"
  on storage.objects
  for insert
  with check (
    bucket_id = 'feedback-screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 9. Storage RLS: users can view their own screenshots
create policy "Users can view own feedback screenshots"
  on storage.objects
  for select
  using (
    bucket_id = 'feedback-screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 10. Storage RLS: service role can read all (for admin/email)
-- Service role bypasses RLS automatically, no policy needed.

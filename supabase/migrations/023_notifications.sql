-- Notification center table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  type text not null default 'general'
    check (type in ('session_reminder','session_update','new_message','connection_request','review_received','referral_converted','streak_milestone','general','follow','like','comment','review','session_join','dm','community_invite','achievement','referral_complete','challenge_complete','community_post')),
  entity_type text,
  entity_id text,
  message text not null,
  action_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(recipient_id) where is_read = false;

alter table public.notifications enable row level security;

create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = recipient_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = recipient_id);

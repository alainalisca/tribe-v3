-- Composite indexes to match common query patterns in DAL functions and cron jobs
-- These are additive (IF NOT EXISTS) and do not affect existing queries

-- Home feed + cron jobs: filter sessions by status + date
CREATE INDEX IF NOT EXISTS idx_sessions_status_date
ON public.sessions(status, date);

-- Reminders + attendance: lookup participants by session + status
CREATE INDEX IF NOT EXISTS idx_session_participants_session_status
ON public.session_participants(session_id, status);

-- Chat queries: messages ordered by creation within a session
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
ON public.chat_messages(session_id, created_at DESC);

-- Re-engagement cron: find inactive users by last activity
CREATE INDEX IF NOT EXISTS idx_users_updated_at
ON public.users(updated_at);

-- 122_notifications_realtime.sql
-- QA (Ana): the in-app notification bell only updated on the 5-minute poll or on
-- app reopen — never live. Root cause: public.notifications was NOT in the
-- supabase_realtime publication, so NotificationBell's postgres_changes
-- subscription (channel notifications-bell-<uid>, filter recipient_id=eq.<uid>)
-- received nothing. Verified live: the publication holds chat_messages, messages,
-- session_participants, sessions — notifications was the sole gap.
--
-- Fix:
--   1. Publish the table so INSERT/UPDATE/DELETE flow to subscribers.
--   2. REPLICA IDENTITY FULL so UPDATE/DELETE events carry recipient_id and the
--      bell's per-user filter matches on those events too (INSERT already
--      carries the full new row; DELETE otherwise ships only the PK).
--
-- Safe to publish — this migration changes NO RLS. RLS stays enabled and the
-- SELECT policy is recipient_id = auth.uid(), which Realtime enforces per
-- subscriber, so a user can only receive their OWN notifications even if they
-- tamper with the client-side filter.

-- Idempotent add (ALTER PUBLICATION ... ADD TABLE errors if already a member).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Idempotent (setting FULL again is a no-op).
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

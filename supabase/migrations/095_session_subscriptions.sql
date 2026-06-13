-- 095_session_subscriptions.sql
--
-- Proper home for the "subscribe to a recurring session series" feature.
--
-- Background: SubscribeButton + /subscriptions were writing/reading four
-- columns (instructor_id, is_subscription, recurrence_pattern,
-- subscription_status) on session_participants that DO NOT EXIST. Every
-- subscribe 500'd and the page rendered empty. Worse, nothing in the
-- codebase ever read those fields, so the core promise — "you'll be
-- automatically added to future sessions" — was never implemented at all.
--
-- session_participants is a per-occurrence join table (one row = one person
-- in one concrete session). A subscription is a different concept: a standing
-- intent attached to the recurring PARENT session that should fan out to each
-- generated child occurrence. It gets its own table.
--
-- The recurring-sessions cron (app/api/cron/recurring-sessions) now reads this
-- table and inserts confirmed session_participants rows into each newly
-- created child session for every active subscriber.

CREATE TABLE IF NOT EXISTS public.session_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- The recurring PARENT session (the template the user subscribed to).
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recurrence_pattern text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One subscription per (user, parent session). Re-subscribing flips an
  -- existing row back to 'active' via upsert rather than creating a duplicate.
  UNIQUE (user_id, session_id)
);

-- Lookups: "my subscriptions" (by user), "who's subscribed to this series"
-- (by session, active only — used by the cron fan-out), and the instructor's
-- view of their subscribers.
CREATE INDEX IF NOT EXISTS idx_session_subscriptions_user ON public.session_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_session_subscriptions_session_active
  ON public.session_subscriptions(session_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_session_subscriptions_instructor ON public.session_subscriptions(instructor_id);

ALTER TABLE public.session_subscriptions ENABLE ROW LEVEL SECURITY;

-- A subscriber fully owns their own subscription rows.
CREATE POLICY "Users manage own subscriptions"
  ON public.session_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Instructors may READ subscriptions to their own sessions (so a future
-- "your subscribers" view works) but not modify them.
CREATE POLICY "Instructors view subscribers to their sessions"
  ON public.session_subscriptions
  FOR SELECT
  USING (auth.uid() = instructor_id);

-- Keep updated_at fresh on status changes (subscribe/unsubscribe).
CREATE OR REPLACE FUNCTION public.touch_session_subscriptions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_subscriptions_touch_updated_at ON public.session_subscriptions;
CREATE TRIGGER session_subscriptions_touch_updated_at
  BEFORE UPDATE ON public.session_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_session_subscriptions_updated_at();

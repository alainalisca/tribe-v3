-- 149_proximity_alerts_preference.sql
-- Adds a dedicated proximity_alerts preference to notification_preferences so
-- the notify-nearby push ("someone near you wants to train right now") can be
-- gated on its own category instead of being bundled into social_activity.
--
-- Opt-out, default true: this matches every other activity category created in
-- 037 and preserves today's behavior. notify-nearby currently sends
-- unconditionally in production, so defaulting the flag to off would silently
-- suppress sends that work today. Existing rows inherit the default; there is
-- no backfill.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, so re-running is a no-op.
--
-- RLS and grants (confirmed against 037's conventions):
--   * RLS: notification_preferences already has RLS enabled with the own_prefs
--     policy (FOR ALL USING auth.uid() = user_id) from 037. That policy is
--     row-scoped, not column-scoped, so it automatically covers the new column.
--     No policy change is needed or made here.
--   * Grants: 037 granted no table privileges explicitly, and a new column on
--     an existing table inherits the table's existing privileges, so no GRANT
--     is needed here either.
--   * Comment: 037 attaches no column comments, so none is added, to match its
--     conventions exactly.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS proximity_alerts BOOLEAN NOT NULL DEFAULT true;

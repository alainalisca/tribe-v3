-- 105_drop_notifications_type_check.sql
--
-- FIX (audit 2026-06-30): notifications.type CHECK constraint silently drops
-- valid notifications.
--
-- Migration 011 created notifications with:
--   type text NOT NULL CHECK (type IN (
--     'follow','like','comment','review','session_join','community_invite',
--     'achievement','referral_complete','dm','challenge_complete','community_post'))
-- (migration 023 tried to widen it but used CREATE TABLE IF NOT EXISTS, which
-- no-ops once 011 has created the table — classic schema drift.)
--
-- The application now writes ~20 distinct notification types that are NOT in
-- that allowlist, e.g. partner_application, join_request_approved,
-- training_interest, bulletin_pending, session_invite, waitlist_offered,
-- waitlist_expired, spotlight_selected, smart_match, and the behavioral-nudge
-- types (streak_milestone, streak_risk, habit_session, comeback,
-- review_reminder). Each INSERT that uses one of these violates the CHECK and
-- is rejected, so the notification is silently lost in production (this is the
-- same class of bug already fixed once for notify-join, BUG-203).
--
-- An enumerated CHECK would keep breaking every time a feature adds a new
-- notification type. The type column is a descriptive render key, not a
-- security boundary; valid values are governed in app code by createNotification
-- and the notification-i18n copy map (an unknown type degrades to fallback copy,
-- never a dropped row). So we drop the CHECK constraint entirely.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Keep NOT NULL so a type is always present.
ALTER TABLE notifications ALTER COLUMN type SET NOT NULL;

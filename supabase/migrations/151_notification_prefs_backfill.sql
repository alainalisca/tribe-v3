-- 151_notification_prefs_backfill.sql
-- Backfill: give every existing user a notification_preferences row so
-- DEFAULT_PREFERENCES in the DAL stops acting as a shadow policy. Migration 150
-- seeds new signups going forward; this handles the existing base. Also folds in
-- the legacy session_reminders_enabled merge, in this same migration.
--
-- ADDITIVE and idempotent. Safe to run while the app is live and safe to re-run:
-- the INSERT uses ON CONFLICT DO NOTHING and the UPDATE only touches rows that
-- are not already off.
--
-- SOURCE IS auth.users, NOT public.users. notification_preferences.user_id
-- references auth.users(id) (037), and the 150 signup trigger seeds on
-- auth.users. auth.users is the superset (an auth user can exist without a
-- public.users profile row), so sourcing from auth.users covers the exact same
-- population 150 covers and cannot leave an auth user rowless. Seeding a row for
-- an auth user with no profile is harmless: the FK is to auth.users, and the
-- step-2 merge below simply finds no public.users row and leaves the default.

-- 1. Default row for every auth user missing one. Only user_id is supplied, so
--    every other column takes its DB default (037 + 149). No values hardcoded,
--    so the DB column defaults stay the single source of truth.
INSERT INTO public.notification_preferences (user_id)
SELECT a.id FROM auth.users a
ON CONFLICT (user_id) DO NOTHING;

-- 2. Legacy merge, same migration. Where the legacy users.session_reminders_enabled
--    is FALSE, force the session_reminders category off. This applies both to
--    rows the backfill just created and to rows that already existed.
--
--    Disagreement resolves toward OFF on purpose. Today the session-reminders
--    cron ANDs the legacy column with the category, so a user with the legacy
--    column false receives nothing regardless of the category. Copying that
--    false into the category reproduces exactly what they experience today.
--    Re-enabling a notification someone turned off is the harmful direction
--    (unwanted sends, lost trust); keeping it off is safe. No other flag is
--    touched.
UPDATE public.notification_preferences p
   SET session_reminders = false
  FROM public.users u
 WHERE u.id = p.user_id
   AND u.session_reminders_enabled IS FALSE
   AND p.session_reminders IS DISTINCT FROM false;

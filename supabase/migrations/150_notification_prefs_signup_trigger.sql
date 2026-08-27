-- 150_notification_prefs_signup_trigger.sql
-- Creates a notification_preferences row automatically for every new user, so
-- the row exists from signup instead of being created lazily. Today rows are
-- only written when a user saves settings, so DEFAULT_PREFERENCES in the DAL is
-- the effective policy and the DB column defaults never apply (two sources of
-- truth). A trigger on auth.users is the single choke point that covers every
-- signup path (email, OAuth, admin/coach-created), which app-code-at-signup
-- would miss.
--
-- ADDITIVE, no backfill. Existing rowless users are handled by the step-2
-- backfill migration, not here.
--
-- SAFETY (all load-bearing): this trigger fires INSIDE the auth.users INSERT
-- that Supabase Auth runs to create an account. If it raised, account creation
-- would fail. So:
--   * SECURITY DEFINER, so it can write public.notification_preferences
--     regardless of the role performing the signup INSERT; search_path is
--     pinned to keep the function resolving the intended objects.
--   * INSERT ... ON CONFLICT (user_id) DO NOTHING, so a race or a pre-existing
--     row is a no-op, never a duplicate-key error.
--   * Only user_id is supplied; every other column takes its DB default
--     (037 + 149). The function hardcodes no preference values, so the DB
--     defaults stay the single source of truth.
--   * The body is wrapped in EXCEPTION WHEN OTHERS THEN RETURN NEW. A missing
--     preferences row is fully recoverable (the DAL falls back to
--     DEFAULT_PREFERENCES and the step-2 backfill repairs it); a signup that
--     fails because of this trigger is not. So any error is swallowed and the
--     user is still created.
--
-- Idempotent: DROP TRIGGER IF EXISTS then CREATE.

CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never let a preferences insert failure abort the signup transaction.
    -- A missing row is recoverable; a blocked account creation is not.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_notification_prefs_on_signup ON auth.users;
CREATE TRIGGER create_notification_prefs_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_preferences();

-- 098_rls_self_escalation_guards.sql
--
-- Two self-escalation holes, both closed with BEFORE UPDATE triggers in the
-- same style as 043_lock_is_admin (RLS WITH CHECK can't compare NEW vs OLD,
-- so a trigger is the right tool).
--
-- T1-7: users.banned had no guard. The users UPDATE policy is
--   `USING (auth.uid() = id)`, so a banned user could PATCH their own row
--   `{ "banned": false }` and un-ban themselves. (is_admin was already locked
--   by 043; banned was missed.)
--
-- T1-6: session_participants UPDATE policy is `USING (auth.uid() = user_id)`
--   with no WITH CHECK. A user on a curated/invite-only session whose row is
--   `status = 'pending'` could PATCH it to `'confirmed'` and appear on the
--   host's roster without approval — bypassing the join policy. Host approval
--   and system cancellation run as non-owners (auth.uid() <> user_id) so they
--   are unaffected by this guard.

-- ── T1-7: lock users.banned ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_banned_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.banned IS DISTINCT FROM OLD.banned THEN
    -- Service-role / migration contexts have auth.uid() = NULL — let them
    -- through (admin tooling). A regular authenticated user changing `banned`
    -- (on themselves or anyone) must already be an admin.
    IF auth.uid() IS NOT NULL AND NOT public.is_app_admin_uid(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can modify banned'
        USING HINT = 'Ban state is managed by moderators.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_banned_guard ON public.users;
CREATE TRIGGER users_banned_guard
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_banned_self_update();

-- ── T1-6: block participant self-promotion of their own status ───────────
-- A participant may cancel/withdraw their own row, but may NOT raise their own
-- status (e.g. pending -> confirmed). Status is otherwise set by the
-- join_session RPC (on insert), by the host on approval, or by the system on
-- cancellation — none of which is an owner self-update, so all are unaffected.
CREATE OR REPLACE FUNCTION public.prevent_participant_status_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND auth.uid() = OLD.user_id
     AND NEW.status NOT IN ('cancelled', 'withdrawn') THEN
    RAISE EXCEPTION 'Participants cannot change their own status to %', NEW.status
      USING HINT = 'Confirmation is controlled by the session host / join policy.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_participants_status_guard ON public.session_participants;
CREATE TRIGGER session_participants_status_guard
  BEFORE UPDATE ON public.session_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_participant_status_self_escalation();

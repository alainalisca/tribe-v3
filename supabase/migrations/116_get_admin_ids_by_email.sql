-- Migration 116 — T-SEC5 Batch 2 (additive)
--
-- Adds get_admin_ids_by_email(): resolves an email whitelist to user-ids
-- server-side, so notifyAdminsOfPendingBulletin can stop reading
-- public.users.email from the browser (it currently does
-- `select id, email ... where email in (ADMIN_EMAILS)`, which the T-SEC5 email
-- revoke will break).
--
-- ADDITIVE: creates one function, revokes nothing on public.users. Safe to
-- apply before the email revoke, and fully reversible by dropping the function.
--
-- Deliberately NOT get_admin_user_ids(): that resolves `is_admin = true`, a
-- DIFFERENT admin definition from the ADMIN_EMAILS whitelist the bulletin uses.
-- The two sets are identical today (one user) but can diverge; reusing the
-- is_admin function would silently change who is notified. This function
-- preserves the whitelist semantics exactly (WHERE email = ANY($1)).
--
-- Returns only ids — no email ever leaves the DB.

CREATE OR REPLACE FUNCTION public.get_admin_ids_by_email(p_emails text[])
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.users WHERE email = ANY(p_emails);
$$;

COMMENT ON FUNCTION public.get_admin_ids_by_email(text[]) IS
  'T-SEC5: resolves an email whitelist (ADMIN_EMAILS) to user-ids server-side. '
  'Returns ids only, never email. Used by notifyAdminsOfPendingBulletin.';

-- Supabase ALTER DEFAULT PRIVILEGES grants EXECUTE to anon DIRECTLY on new
-- public functions, so revoking from PUBLIC alone leaves anon able to call it
-- (the T-SEC3 lesson). Revoke anon explicitly; only authenticated needs it
-- (bulletin posts are created by signed-in users).
REVOKE ALL ON FUNCTION public.get_admin_ids_by_email(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_ids_by_email(text[]) TO authenticated;

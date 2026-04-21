-- 050_admin_delete_user_rpc.sql
-- AUDIT-P0-5: admin cascade-delete was split across three separate
-- `supabase.from(...).delete()` calls with Promise.allSettled, then an
-- unconditional soft-delete on the users row. Two problems:
--
--   1. allSettled catches thrown exceptions but Supabase returns
--      `{ data, error }` instead of throwing. A real cascade failure
--      (RLS surprise, FK violation) never tripped the `status === 'rejected'`
--      branch. Result: orphan rows (e.g. chat_messages referencing a
--      now-deleted user) because the users.update(deleted_at) ran anyway.
--
--   2. Even with proper error checks, three separate statements aren't
--      atomic. If step 2 fails after step 1 succeeds, chat messages are
--      already gone but participants remain.
--
-- This RPC collapses the whole cascade + soft-delete into one transaction.
-- If any step errors, the whole thing rolls back and the caller sees a
-- single coherent error.
--
-- Output: { success: true } on a clean cascade, or jsonb error on failure.
-- Errors are plpgsql RAISE, which Supabase surfaces as a `{ error }`
-- response to the route.
--
-- Authorization: route handler must call isAdmin() before invoking the RPC.
-- The RPC itself runs with SECURITY DEFINER (service role) but does NOT
-- re-check the admin role — it's a private helper meant to be fenced by
-- its caller. GRANT is restricted to service_role for that reason.

DROP FUNCTION IF EXISTS admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION admin_delete_user(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $adu$
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_user_id');
  END IF;

  -- Cascade order matters for FK integrity:
  --   chat_messages → session_participants → sessions → users (soft)
  -- Each delete is atomic within this function because plpgsql wraps the
  -- whole body in a single transaction.
  --
  -- Intentional asymmetry: the dependent rows are HARD-deleted while
  -- `users` is SOFT-deleted (deleted_at = NOW()). Consequence: clearing
  -- deleted_at to "undo" the delete cannot restore the user's chat
  -- history or hosted sessions. That's by design — the purpose of admin
  -- delete is permanent removal for compliance (GDPR delete requests,
  -- abuse bans). The soft-delete on users exists only so foreign keys
  -- from other rows (reviews, follows, etc.) can still resolve to a
  -- tombstone row rather than dangling.

  DELETE FROM chat_messages WHERE user_id = p_target_user_id;
  DELETE FROM session_participants WHERE user_id = p_target_user_id;
  DELETE FROM sessions WHERE creator_id = p_target_user_id;

  -- Soft-delete the users row. auth.users is left alone — Supabase dashboard
  -- has a separate hard-delete path for releasing the email.
  UPDATE users
    SET deleted_at = NOW()
    WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_target_user_id);
EXCEPTION WHEN OTHERS THEN
  -- Any error rolls the whole cascade back automatically.
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
END;
$adu$;

REVOKE ALL ON FUNCTION admin_delete_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_user(uuid) TO service_role;

-- 154_close_guest_delete_policy.sql
-- Close the unverified guest DELETE hole on session_participants.
--
-- LIVE STATE (from pg_policies, not the migration files, which were incomplete):
-- session_participants has SEVEN DELETE policies. RLS policies are permissive and
-- OR'd, so a guest row is deletable if ANY of them passes. Two of them gate guest
-- rows with no real authorization:
--   * "Guests can leave sessions"                    USING (is_guest AND user_id IS NULL)
--       -> NO verification at all. This is the hole: any role with table DELETE
--          privilege can remove any guest row of any session.
--   * "Allow guests to delete their own participation"
--          USING (is_guest AND user_id IS NULL AND check_guest_identity())
--       -> check_guest_identity() (the only overload in prod, 0-arg) compares the
--          x-guest-token header to a bare guest_token with no parameter and no FROM,
--          so inside a USING clause it cannot see the row and likely errors rather
--          than authorizing. Either way this policy is not a real guard, and no
--          wired client sends that header.
--
-- WHY DROPPING BOTH IS SAFE (delete-path audit, verified in code):
--   * Guest self-unjoin runs through guest_leave_session (migration 128), a
--     SECURITY DEFINER RPC that verifies guest_token server-side and bypasses RLS.
--     Called from hooks/sessionActionHelpers.ts. It does not use either policy.
--   * The two DAL helpers that did direct client guest deletes
--     (deleteGuestParticipant, deleteGuestParticipantsForSession) have ZERO
--     callers (dead code from before 128).
-- After the drop, the surviving DELETE policies are: sp_delete_by_instructor
-- (creator can delete rows of their own session, guests included), the three
-- identical self-delete policies (auth.uid() = user_id, real accounts only), and
-- the admin-email policy. So guest rows remain removable by the host (policy AND
-- the explicit host_remove_session_guest RPC from 153) and by the guest
-- (guest_leave_session). A token-less direct DELETE by a non-creator is then
-- default-denied.
--
-- KEPT ON PURPOSE:
--   * sp_delete_by_instructor: this IS the creator-scoped guest-delete grant. It
--     stays. host_remove_session_guest (153) is kept alongside it as the explicit
--     RPC the door UI calls (recomputes current_participants, structured errors,
--     survives future policy tightening).
--   * The three duplicate self-delete policies ("Users can leave sessions",
--     participants_delete_policy, sp_delete_self) are left intact so real-account
--     self-unjoin keeps working. Consolidating those three into one is pure
--     duplication cleanup and belongs in its OWN migration, not here.
--
-- SEPARATE CONCERN (filed, not touched here): "Admin can delete
-- session_participants" is gated on a hardcoded email
-- ((auth.jwt() ->> 'email') = 'alainalisca@aplusfitnessllc.com'). That should move
-- to public.is_app_admin() like the rest of the admin surface, in its own ticket.

DROP POLICY IF EXISTS "Guests can leave sessions" ON public.session_participants;
DROP POLICY IF EXISTS "Allow guests to delete their own participation" ON public.session_participants;

-- "Allow guests to delete their own participation" referenced check_guest_identity(),
-- so it is dropped above first. The 0-arg overload is the only one in production;
-- the 2-arg drop is a no-op in prod (present only in dev/staging DBs where the
-- superseded add_guest_unjoin_policy.sql ran) and is included for environment
-- robustness.
DROP FUNCTION IF EXISTS public.check_guest_identity();
DROP FUNCTION IF EXISTS public.check_guest_identity(text, text);

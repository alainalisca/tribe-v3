-- 154_close_guest_delete_policy.sql
-- Close the loose guest DELETE policy on session_participants.
--
-- THE HOLE: "Allow guests to delete their own participation" is
--   FOR DELETE USING (is_guest = true AND user_id IS NULL [AND check_guest_identity()])
-- with no scoping to the guest, the session, or the creator. Its intended
-- verification, check_guest_identity(), was created returning TRUE unconditionally
-- (add_guest_unjoin_policy.sql) and later re-created to compare an x-guest-token
-- request header to the row's guest_token (fix_guest_identity_check.sql). Either
-- way the policy is a table-wide guest-delete door: near-harmless today (almost no
-- guest rows) but serious the moment door check-in (153) ships and every roster is
-- guest rows.
--
-- WHY DROPPING IT IS SAFE (delete-path audit, verified in code)
--   * Guest self-unjoin does NOT use this policy. It goes through the
--     guest_leave_session SECURITY DEFINER RPC (migration 128), called from
--     hooks/sessionActionHelpers.ts with the guest_token stored in localStorage.
--     Definer RPCs bypass RLS, so the policy is irrelevant to it.
--   * Host removal of a guest goes through host_remove_session_guest (migration
--     153), also SECURITY DEFINER and creator-scoped. Also policy-independent.
--   * The two DAL helpers that DID do direct client guest deletes
--     (deleteGuestParticipant, deleteGuestParticipantsForSession in
--     lib/dal/participants.ts) have ZERO callers. They are dead code left over
--     from before migration 128 rerouted onto the RPC. Nothing wired breaks.
--   * The host kick path (deleteParticipantBySessionAndUser) filters on
--     user_id equality, so it only ever targets real-user rows and never matched
--     this guest policy in the first place.
-- So after this drop, the only guest-delete paths are the two definer RPCs, each
-- gated (guest_token for the guest, creator/admin for the host). A token-less
-- direct DELETE by anon/authenticated is default-denied (RLS on, no DELETE policy).
--
-- PROD-STATE NOTE: which check_guest_identity() variant is live and whether the
-- policy's USING clause includes it cannot be read from a migration file. This
-- migration is robust to that ambiguity: it drops the policy BY NAME and both
-- function overloads BY SIGNATURE, so it lands correctly regardless of which
-- variant production currently has. (Confirm the live state with the SQL in the
-- rehearsal header if you want ground truth before applying.)
--
-- Also drops both check_guest_identity overloads: once the policy is gone they are
-- orphaned, and the arg-less-returns-true original is a foot-gun worth removing.

DROP POLICY IF EXISTS "Allow guests to delete their own participation" ON public.session_participants;

-- Order matters: the policy above referenced check_guest_identity(), so it must be
-- dropped first. Both overloads are removed (the 0-arg token-check version and the
-- 2-arg return-TRUE original). No other policy or object references them.
DROP FUNCTION IF EXISTS public.check_guest_identity();
DROP FUNCTION IF EXISTS public.check_guest_identity(text, text);

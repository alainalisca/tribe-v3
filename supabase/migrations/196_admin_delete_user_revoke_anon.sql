-- 196_admin_delete_user_revoke_anon.sql
--
-- EMERGENCY FIX, APPLIED TO PRODUCTION BY HAND BEFORE MERGE.
--
-- Al ran the three statements in section 1 below in the production Supabase
-- SQL editor on 2026-09-27, as an emergency, before this file existed on any
-- branch, and verified the result there:
--
--     anon_can_run = false, logged_in_can_run = false, server_can_run = true
--
-- This file records that change in git after the fact. It inverts the house
-- rule ("merge the branch, then paste"), deliberately and once: the hole was
-- open to anyone holding the public anon key, and closing it could not wait
-- for a review cycle. Everything below section 1 was NOT run by hand. When this
-- branch merges, paste the WHOLE file: section 1 is idempotent and changes
-- nothing on a database that already has it, and sections 2 and 3 add the
-- assertion and the migrations_applied row that the hand-run did not write.
--
-- NUMBER: 196. Read 2026-09-27 immediately before writing, after `git fetch`:
-- origin/main ends at 193; 194 is claimed by chore/194-scrub-push-send-bearer
-- and 195 by fix/s3-notification-forgery (both unmerged, both also present as
-- files in their worktrees); no branch or worktree carries 196 or higher.
-- Re-check against origin/main immediately before merge. A number belongs to
-- whichever branch merges first.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS WRONG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- public.admin_delete_user(uuid) (migration 050) is SECURITY DEFINER and has
-- no caller check. Its body deletes the target's chat_messages,
-- session_participants and hosted sessions, then sets users.deleted_at. It is
-- meant to be reached only through app/api/admin/users/[id]/delete/route.ts,
-- which checks the admin first and then calls it with the service-role client.
--
-- 050 ended with:
--     REVOKE ALL ON FUNCTION admin_delete_user(uuid) FROM PUBLIC;
--     REVOKE ALL ON FUNCTION admin_delete_user(uuid) FROM authenticated;
-- and never revoked anon. Revoking PUBLIC does not remove an explicit grant to
-- anon. Where the explicit grant came from is a hypothesis, not a measurement:
-- most likely Supabase's default privileges on the public schema, which grant
-- anon on objects as they are created. What IS measured is the result. The
-- production schema dump pulled 2026-09-26 carries, at the time of the pull:
--     GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "anon";
--
-- So anyone with the public anon key could POST /rest/v1/rpc/admin_delete_user
-- with any user id and soft-delete that user, along with their messages,
-- bookings and hosted sessions.
--
-- HOW IT WAS FOUND: T-AV19 (athlete-value branch) brought the local stack's
-- grants into parity with that dump. Reading the re-measured table, anon held
-- EXECUTE on this function and authenticated did not, which is backwards for
-- an admin function. A rolled-back rehearsal on the LOCAL stack under
-- production's grants then showed, as role anon with auth.uid() NULL:
--     admin_delete_user('<seed user>') -> {"success": true}, deleted_at set
-- Production itself was never called.
--
-- WHAT IS NOT KNOWN: whether anyone used it. supabase/recon/
-- admin-delete-prod-readonly.sql (athlete-value branch) is the read-only
-- damage check; see its header for what it can and cannot establish.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- AFTER THIS FILE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- EXECUTE is held by service_role (and the owner) only. The admin route is
-- unaffected: it calls through getServiceRoleClient. No browser client calls
-- this function; lib/dal/admin.ts references it only in a comment.
--
-- Not changed here, deliberately: the function body still has no caller
-- check. With EXECUTE held only by service_role it does not need one, but a
-- later GRANT to anon or authenticated would reopen the hole in one line. The
-- probe in verify-migration-state.sql fails if either client role ever holds
-- EXECUTE again.

-- ── 1. The three statements run by hand in production on 2026-09-27 ─────────
revoke all on function public.admin_delete_user(uuid) from anon;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to service_role;

-- ── 2. Assert the end state, after the write ────────────────────────────────
-- has_function_privilege answers "can this role run it", from the catalog,
-- including via PUBLIC. That is the capability question, not whether a GRANT
-- row happens to exist.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_delete_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '196 ABORTED: anon can still execute admin_delete_user.';
  END IF;
  IF has_function_privilege('authenticated', 'public.admin_delete_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '196 ABORTED: authenticated can execute admin_delete_user.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.admin_delete_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '196 ABORTED: service_role cannot execute admin_delete_user; the admin delete route would break.';
  END IF;
  RAISE NOTICE '196: admin_delete_user executable by service_role only.';
END $$;

-- ── 3. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('196_admin_delete_user_revoke_anon', 'Emergency: revoke anon/PUBLIC EXECUTE on admin_delete_user; statements hand-applied in production 2026-09-27 before merge')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  NOT has_function_privilege('anon', 'public.admin_delete_user(uuid)', 'EXECUTE')          AS anon_cannot_run_ok,
  NOT has_function_privilege('authenticated', 'public.admin_delete_user(uuid)', 'EXECUTE') AS logged_in_cannot_run_ok,
  has_function_privilege('service_role', 'public.admin_delete_user(uuid)', 'EXECUTE')      AS server_can_run_ok,
  EXISTS (SELECT 1 FROM public.migrations_applied
           WHERE migration = '196_admin_delete_user_revoke_anon')                          AS recorded_ok;

-- 121_gate3_drop_session_participants_insert_rls.sql
-- T-SEC1 Gate 3 (final): remove the direct-INSERT door on session_participants.
--
-- Every join path now goes through a SECURITY DEFINER RPC — join_session (member),
-- join_session_as_guest (guest), accept_waitlist_offer (reserved seat) — plus the
-- service-role subscriber fan-out (enrollSubscribersInChildSession). All of those
-- bypass RLS (definer runs as owner; service_role has BYPASSRLS). A three-pass
-- sweep confirmed NO authenticated/anon code path inserts directly anymore.
--
-- So these four permissive INSERT policies are the last remaining bypass surface:
-- e.g. "sp_insert_self" lets any authenticated user INSERT a row for themselves
-- with an arbitrary status (bypassing the server-side policy/capacity derivation),
-- and the guest policies let anon insert guest rows with no token check at all.
-- With the policies gone and RLS still enabled, direct inserts DEFAULT-DENY, while
-- the definer/service-role paths keep working untouched.
--
-- Drops only the four INSERT policies BY NAME (idempotent). SELECT/DELETE/UPDATE
-- policies are intentionally left alone — their consolidation is a separate ticket.

DROP POLICY IF EXISTS "Allow guest inserts"     ON public.session_participants;
DROP POLICY IF EXISTS "Allow guest joins"       ON public.session_participants;
DROP POLICY IF EXISTS "Users can join sessions" ON public.session_participants;
DROP POLICY IF EXISTS "sp_insert_self"          ON public.session_participants;

-- RLS is already enabled on session_participants; no INSERT policy now exists, so
-- inserts by anon/authenticated are denied by default. No replacement policy is
-- added on purpose — the RPCs are the only intended write path.

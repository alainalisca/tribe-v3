-- 126_gate3_drop_conversation_insert_rls.sql
-- T-DM Gate 3 (final): make the get_or_create_direct_conversation RPC the ONLY
-- write path into conversations + conversation_participants, mirroring T-SEC1/121
-- (session_participants). Removes the residual direct-INSERT RLS surface.
--
-- MEASURED LIVE STATE (2026-07-13, external anon-key REST, throwaway user):
--   * conversations INSERT as authenticated        -> 403 / 42501 ALREADY.
--       The permissive "Authenticated users can create conversations"
--       (auth.uid() IS NOT NULL) policy is NOT live. This half is already closed;
--       the DROP below is an idempotent no-op kept for hygiene + intent.
--   * conversation_participants INSERT (self)       -> 201.
--   * conversation_participants INSERT (other user) -> 403 / 42501.
--       => the LIVE policy is migration 013's stricter
--          "Users can add themselves to conversations" WITH CHECK (user_id = auth.uid()),
--          NOT the wide-open 011 "auth.uid() IS NOT NULL". Self-insert only.
--   * The 123 guard trigger additionally blocks self-insert into a conversation
--     that already has members you are not part of (verified 42501 previously).
--
-- So the acute "join any conversation" vuln is ALREADY mitigated live by
-- (013 self-only RLS + 123 trigger + the fact that empty conversations cannot be
-- created directly since conversations INSERT is denied and the RPC always writes
-- both rows atomically). This migration formalizes the invariant: with NO INSERT
-- policy and RLS still enabled, all direct authenticated/anon inserts DEFAULT-DENY,
-- while the SECURITY DEFINER RPC (runs as owner, RLS bypassed) keeps working.
--
-- The 123 guard trigger is intentionally LEFT IN PLACE as defense-in-depth: it
-- costs nothing and still blocks the attack if a permissive INSERT policy is ever
-- re-introduced (this codebase has already shown drift on these exact policies).
--
-- Idempotent + drift-proof: explicit DROPs by every known name, then a
-- name-independent sweep of any remaining INSERT-command policy on both tables.
-- SELECT / UPDATE / DELETE policies are deliberately untouched (reads via
-- BottomNav + getUnreadCount + get_my_conversations, and mark-read UPDATE via
-- markConversationRead, must keep working).

-- ── conversation_participants: drop the self-insert INSERT policy ──────────────
DROP POLICY IF EXISTS "Users can add themselves to conversations" ON public.conversation_participants;  -- 013 (live)
DROP POLICY IF EXISTS "Authenticated users can join conversations" ON public.conversation_participants;  -- 011 (drift guard)

-- ── conversations: drop the create INSERT policy (already default-deny live) ───
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;            -- 011 (no-op today)

-- ── drift-proof sweep: drop ANY remaining INSERT-command policy on both tables ─
-- polcmd 'a' = INSERT. Leaves 'r'(SELECT) / 'w'(UPDATE) / 'd'(DELETE) intact.
-- (No ALL '*' policy exists on these tables; reads/updates are command-specific.)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pol.polname, cls.relname
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname IN ('conversations', 'conversation_participants')
      AND pol.polcmd = 'a'   -- INSERT only
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.polname, r.relname);
    RAISE NOTICE 'dropped residual INSERT policy % on %', r.polname, r.relname;
  END LOOP;
END$$;

-- RLS is already enabled on both tables (011). With no INSERT policy present,
-- direct inserts by anon/authenticated are denied by default. No replacement
-- policy is added on purpose — the RPC is the only intended write path.
-- The 123 trigger (trg_guard_conversation_participant_insert) is NOT dropped.

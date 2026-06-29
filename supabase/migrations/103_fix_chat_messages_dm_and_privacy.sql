-- 103_fix_chat_messages_dm_and_privacy.sql
--
-- !! MUST RUN ON LIVE DB !!
--
-- Fixes BUG-204: DM sends fail with "Connection error" because
-- chat_messages.session_id is NOT NULL but sendDirectMessage does not
-- supply session_id (DMs use conversation_id instead).
--
-- Also closes a privacy leak: the "Enable realtime for authenticated users"
-- policy (SELECT USING (true)) allowed ANY authenticated user to read ALL
-- chat messages, including private DMs. This migration replaces it with
-- scoped policies:
--   - Session messages: SELECT gated by session_participants (existing policy,
--     named "Users can view chat messages for sessions they participate in" or
--     similar — kept as-is; not touched here)
--   - DM messages: SELECT gated by conversation_participants (new policy)
--   - DM messages: INSERT gated by conversation_participants (new policy)
--
-- INSERT coverage after this migration:
--   - Session chat: "Users can send messages in sessions they participate in"
--     (existing, checks session_id IN session_participants for auth.uid())
--   - DM chat: new "Users can send messages to their conversations" policy below
--   - The broad "Users can send messages to their sessions" policy
--     (WITH CHECK user_id = auth.uid() only) is DROPPED because it lets any
--     authenticated user inject a message into any conversation or session.
--     The two scoped policies above fully cover all legitimate sends.

-- ─────────────────────────────────────────────────────────────────
-- 1. Allow session_id to be NULL so DM inserts no longer violate
--    the NOT NULL constraint.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_messages
  ALTER COLUMN session_id DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 2. Drop the over-permissive SELECT policy (privacy leak).
--    After this, SELECT is governed by:
--      • Existing session-scoped SELECT(s) — session chat remains readable
--        by session participants only.
--      • New conversation-scoped SELECT below — DMs readable by participants
--        only.
--      • Admin UPDATE/DELETE policy (unchanged).
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Enable realtime for authenticated users" ON public.chat_messages;

-- ─────────────────────────────────────────────────────────────────
-- 3. Drop the broad INSERT policy that lets any user inject a message
--    into any session or conversation.
--    Scoped replacements: "Users can send messages in sessions they
--    participate in" (existing) + new DM INSERT below.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can send messages to their sessions" ON public.chat_messages;

-- ─────────────────────────────────────────────────────────────────
-- 4. New conversation-scoped SELECT: a user may read a DM only when
--    they are a participant of the message's conversation.
--    Session messages (session_id IS NOT NULL) are unaffected — the
--    existing session-scoped SELECT policy continues to govern them.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read messages in their conversations" ON public.chat_messages;
CREATE POLICY "Users can read messages in their conversations"
  ON public.chat_messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT conversation_id
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 5. New conversation-scoped INSERT: a user may send a DM only when
--    they are a participant of the target conversation.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.chat_messages;
CREATE POLICY "Users can send messages to their conversations"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND conversation_id IN (
      SELECT conversation_id
      FROM public.conversation_participants
      WHERE user_id = auth.uid()
    )
  );

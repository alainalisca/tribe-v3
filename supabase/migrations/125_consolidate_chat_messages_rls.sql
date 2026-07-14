-- 125_consolidate_chat_messages_rls.sql
-- Consolidate chat_messages RLS to ONE policy per action, on the single table both
-- messaging systems actually use.
--
-- Confirmed LIVE columns (from the production schema — no assumptions):
--   chat_messages: id, message, session_id, conversation_id, user_id,
--                  created_at, updated_at, deleted, deleted_at, deleted_by
--   There is NO sender_id — messages use user_id. The bare `messages` table is an
--   empty, unused orphan with columns {id, message, session_id, user_id} and NO
--   conversation_id, so DMs cannot live there; it is intentionally NOT touched.
--
-- Both message kinds share this table, distinguished by exactly one FK:
--   session message : session_id set,      conversation_id null
--   direct message  : conversation_id set, session_id null
-- The INSERT policy enforces that exactly-one-of split (both-null / both-set fail).
--
-- Replaces the sprawling ~11 live policies (RLS drift — see the project-wide RLS
-- audit ticket). Drops them name-independently so none are missed.
--
-- NOTE / DECISION POINT: UPDATE and DELETE are "own messages only" (user_id =
-- auth.uid()), per spec. If the live dump shows a legitimate host/admin
-- moderation policy (e.g. a session host deleting a member's message), this drops
-- it — tell me and I'll add it back as its own explicit policy.

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 1. Drop EVERY existing policy on chat_messages (name-independent).
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_messages', p.policyname);
  END LOOP;
END $$;

-- 2. One policy per action.

-- SELECT: a member/creator of the message's session, or a participant of its DM.
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT
  USING (
    (session_id IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.session_participants sp
                WHERE sp.session_id = chat_messages.session_id AND sp.user_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.sessions s
                WHERE s.id = chat_messages.session_id AND s.creator_id = auth.uid())
    ))
    OR
    (conversation_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM public.conversation_participants cp
                WHERE cp.conversation_id = chat_messages.conversation_id AND cp.user_id = auth.uid())
    )
  );

-- INSERT: post as yourself, into exactly one of a session you're in/own OR a DM
-- you're a participant of. Both-null and both-set are rejected (no branch matches).
CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (session_id IS NOT NULL AND conversation_id IS NULL AND (
          EXISTS (SELECT 1 FROM public.session_participants sp
                  WHERE sp.session_id = chat_messages.session_id AND sp.user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.sessions s
                  WHERE s.id = chat_messages.session_id AND s.creator_id = auth.uid())
      ))
      OR
      (conversation_id IS NOT NULL AND session_id IS NULL AND
          EXISTS (SELECT 1 FROM public.conversation_participants cp
                  WHERE cp.conversation_id = chat_messages.conversation_id AND cp.user_id = auth.uid())
      )
    )
  );

-- UPDATE: your own messages only (covers soft-delete / edit of your own).
CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: your own messages only.
CREATE POLICY "chat_messages_delete" ON public.chat_messages
  FOR DELETE
  USING (user_id = auth.uid());

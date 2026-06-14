-- 101_get_my_conversations_rpc.sql
--
-- fetchUserConversations (the /messages tab) was N+1 / unbounded:
--   - it pulled EVERY chat_message for every one of the user's conversations
--     just to find the latest message + count unread per conversation
--     (perf audit H-7). At 30 threads x 500 messages that's 15k rows to render
--     30 previews.
-- This RPC returns exactly one row per direct conversation — other participant,
-- latest message, unread count, last_read_at — in a single query using LATERAL
-- subqueries that each ride the existing idx_chat_messages_conversation
-- (conversation_id, created_at) index.
--
-- SECURITY DEFINER + auth.uid(): the function only ever returns the CALLER's
-- conversations. There is no user-id parameter to spoof.

CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  conversation_id uuid,
  other_user_id uuid,
  other_user_name text,
  other_user_avatar text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint,
  last_read_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH my_convs AS (
    SELECT cp.conversation_id, cp.last_read_at, c.updated_at
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    WHERE cp.user_id = auth.uid() AND c.type = 'direct'
  )
  SELECT
    mc.conversation_id,
    ou.id          AS other_user_id,
    ou.name        AS other_user_name,
    ou.avatar_url  AS other_user_avatar,
    lm.message     AS last_message,
    lm.created_at  AS last_message_at,
    COALESCE(uc.cnt, 0) AS unread_count,
    mc.last_read_at,
    mc.updated_at
  FROM my_convs mc
  -- The other participant (direct conversations have exactly two).
  LEFT JOIN LATERAL (
    SELECT u.id, u.name, u.avatar_url
    FROM conversation_participants cp2
    JOIN users u ON u.id = cp2.user_id
    WHERE cp2.conversation_id = mc.conversation_id
      AND cp2.user_id <> auth.uid()
    LIMIT 1
  ) ou ON true
  -- Latest message (rides the (conversation_id, created_at) index).
  LEFT JOIN LATERAL (
    SELECT m.message, m.created_at
    FROM chat_messages m
    WHERE m.conversation_id = mc.conversation_id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  -- Unread = messages after the caller's last_read_at for this conversation.
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM chat_messages m
    WHERE m.conversation_id = mc.conversation_id
      AND m.created_at > mc.last_read_at
  ) uc ON true
  -- Only surface conversations that have an "other" participant.
  WHERE ou.id IS NOT NULL
  ORDER BY mc.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;

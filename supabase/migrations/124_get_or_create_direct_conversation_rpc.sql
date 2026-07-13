-- 124_get_or_create_direct_conversation_rpc.sql
-- Permanent DM fix, GATE 1 (additive — nothing removed yet).
--
-- A SECURITY DEFINER RPC that creates a 1:1 direct conversation + BOTH participant
-- rows ATOMICALLY, as owner, enforcing the real boundary the RLS was missing:
--   #1 You can only create a conversation that INCLUDES YOURSELF. The RPC always
--      inserts auth.uid() as a participant and only accepts a single target — a
--      caller cannot fabricate a conversation for arbitrary users (the vuln).
--   #2 You cannot join a conversation you are not already in. The RPC never adds
--      you to a pre-existing conversation; the migration-123 guard trigger stays
--      as the backstop for any direct insert.
-- NO connection gate (product decision): any authenticated user may start a DM.
-- Atomic create also fixes the orphan/duplicate-conversation bug (task_89cf8925):
-- the conversation + both participant rows commit or roll back together.
--
-- Session GROUP chat is NOT a conversation — it is session_id-scoped chat_messages
-- gated by session_participants — so it needs no RPC here. Boundary #3 (only real
-- session participants may post) lives in the chat_messages session-INSERT policy,
-- verified separately.
--
-- Compatible with the live 123 trigger: inside the definer RPC auth.uid() is still
-- the caller, so the self row (inserted first) passes the trigger's zero-participant
-- rule and the target row passes its already-a-member rule.
--
-- Gate 2 moves the client (getOrCreateDirectConversation) onto this + ships the
-- storefront Message button. Gate 3 tightens conversation_participants INSERT RLS.

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_cid uuid;
BEGIN
  -- Boundary #1: must be authenticated, and you always join yourself.
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';  -- 42501
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_me THEN
    RAISE EXCEPTION 'invalid target' USING ERRCODE = 'check_violation';            -- 23514
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'foreign_key_violation';    -- 23503
  END IF;

  -- Idempotent + dedupe fix: return the existing 1:1 thread ONLY when it is the
  -- conversation whose participants are EXACTLY {me, target} (count = 2). The old
  -- client used an .in().in() intersection that matched ANY conversation the
  -- caller was in, so a DM to a different person could hijack an existing thread
  -- (a privacy bug: a message meant for B landing in A's thread). Requiring both
  -- users AND exactly two participants makes the match precise by construction.
  SELECT c.id INTO v_cid
  FROM conversations c
  JOIN conversation_participants cp_me
    ON cp_me.conversation_id = c.id AND cp_me.user_id = v_me
  JOIN conversation_participants cp_other
    ON cp_other.conversation_id = c.id AND cp_other.user_id = p_target_user_id
  WHERE c.type = 'direct'
    AND (SELECT count(*) FROM conversation_participants x WHERE x.conversation_id = c.id) = 2
  LIMIT 1;

  IF v_cid IS NOT NULL THEN
    RETURN v_cid;
  END IF;

  -- Create atomically. Self row FIRST so the 123 guard trigger allows the pair.
  INSERT INTO conversations (type) VALUES ('direct') RETURNING id INTO v_cid;
  INSERT INTO conversation_participants (conversation_id, user_id, last_read_at) VALUES
    (v_cid, v_me, now()),
    (v_cid, p_target_user_id, now());

  RETURN v_cid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

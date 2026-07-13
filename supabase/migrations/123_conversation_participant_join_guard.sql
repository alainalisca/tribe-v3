-- 123_conversation_participant_join_guard.sql
-- INTERIM MITIGATION for a critical, live-proven private-DM read/write vulnerability.
--
-- Live state: conversation_participants INSERT policy is (auth.uid() IS NOT NULL),
-- so ANY authenticated user can insert themselves into ANY conversation and then
-- read AND write its chat_messages (SELECT/INSERT on chat_messages are gated by
-- conversation_participants membership). Proven end-to-end against production.
-- Note: reverting to migration 013's (user_id = auth.uid()) does NOT fix this —
-- the attacker adds THEMSELVES, which that policy still permits.
--
-- This BEFORE INSERT trigger stops the bleeding without an RLS policy (so it can't
-- trigger the 42P17 self-referential-policy recursion already seen on
-- challenge_participants) by reading membership inside a SECURITY DEFINER function
-- that runs as owner (RLS bypassed for that read):
--   1. ALLOW inserts into a conversation with ZERO existing participants — the
--      legitimate getOrCreateDirectConversation path creating a fresh 2-person
--      thread (it inserts the caller's own row first, then the other member).
--   2. ALLOW service-role / SECURITY DEFINER writers (auth.uid() IS NULL).
--   3. ALLOW a caller who is ALREADY a participant (covers the 2nd row of the
--      creation batch; also any future member-add-by-a-member).
--   4. BLOCK everything else — an authenticated user adding a row to a
--      conversation that already has members and that they are not part of. THIS
--      is the attack.
--
-- Verified safe: the ONLY client insert path is getOrCreateDirectConversation
-- (fresh 2-person conversation, self-row first). There is NO group chat and NO
-- add-participant-to-existing-conversation feature, and production currently has
-- zero conversations — so this guard breaks nothing.
--
-- PERMANENT fix (follows, three-gate): a get_or_create_direct_conversation
-- SECURITY DEFINER RPC + locking down direct INSERT, which also ships the Message
-- button. This trigger is the stop-the-bleeding step only.

CREATE OR REPLACE FUNCTION public.guard_conversation_participant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing int;
BEGIN
  -- Count current participants as OWNER (SECURITY DEFINER) so RLS is bypassed for
  -- this read — it never re-evaluates a policy on conversation_participants, so no
  -- 42P17 recursion. (A SELECT fires no triggers, so no trigger recursion either.)
  SELECT count(*) INTO v_existing
  FROM conversation_participants
  WHERE conversation_id = NEW.conversation_id;

  -- 1. Brand-new conversation -> allow (legitimate fresh-thread creation).
  IF v_existing = 0 THEN
    RETURN NEW;
  END IF;

  -- 2. Server-side writer (service_role / SECURITY DEFINER RPC, no JWT) -> allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Caller is already in this conversation -> allow (2nd row of the creation
  --    batch, where the caller's own row was inserted first).
  IF EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = NEW.conversation_id AND user_id = auth.uid()
  ) THEN
    RETURN NEW;
  END IF;

  -- 4. Otherwise: authenticated user joining a conversation they are not part of.
  RAISE EXCEPTION 'not authorized to join conversation %', NEW.conversation_id
    USING ERRCODE = 'insufficient_privilege';  -- 42501
END;
$$;

REVOKE ALL ON FUNCTION public.guard_conversation_participant_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_conversation_participant_insert ON public.conversation_participants;
CREATE TRIGGER trg_guard_conversation_participant_insert
  BEFORE INSERT ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_participant_insert();

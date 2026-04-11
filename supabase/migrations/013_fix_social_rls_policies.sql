-- ══════════════════════════════════════════════════
-- Migration 013: Fix overly permissive social feature RLS policies
-- Addresses security audit findings M1, M2, M3
-- ══════════════════════════════════════════════════

-- Fix M1: conversation_participants INSERT was too permissive
-- Only allow users to add THEMSELVES to conversations, not arbitrary user_ids
DROP POLICY IF EXISTS "Authenticated users can join conversations" ON conversation_participants;
CREATE POLICY "Users can add themselves to conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Fix M2: community_post_comments SELECT was globally open
-- Only allow reading comments on posts in communities the user can access
DROP POLICY IF EXISTS "Users can read comments on visible posts" ON community_post_comments;
CREATE POLICY "Users can read comments on accessible posts"
  ON community_post_comments FOR SELECT
  USING (
    post_id IN (
      SELECT cp.id FROM community_posts cp
      JOIN communities c ON cp.community_id = c.id
      WHERE c.is_private = false
         OR c.id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid())
    )
  );

-- Fix M2b: community_post_comments INSERT should verify community membership
DROP POLICY IF EXISTS "Users can create comments" ON community_post_comments;
CREATE POLICY "Members can create comments on accessible posts"
  ON community_post_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND post_id IN (
      SELECT cp.id FROM community_posts cp
      JOIN communities c ON cp.community_id = c.id
      WHERE c.is_private = false
         OR c.id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid())
    )
  );

-- Fix M3: notifications INSERT should only allow self-targeting
-- Users should only create notifications where they are the actor, not the recipient
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND actor_id = auth.uid());

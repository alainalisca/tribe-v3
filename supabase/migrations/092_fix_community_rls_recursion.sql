-- Migration 092: fix RLS recursion blocking community_posts SELECT.
--
-- The community_members SELECT policy from migration 011 has a
-- self-referential third clause that Postgres collapses to "return nothing":
--
--   community_id IN (SELECT community_id FROM community_members cm
--                    WHERE cm.user_id = auth.uid())
--
-- That breaks any policy whose USING clause does
-- `IN (SELECT ... FROM community_members WHERE ...)`, including the
-- community_posts SELECT policy. INSERT works because Postgres evaluates
-- WITH CHECK in a non-recursive context.
--
-- Migration 048 introduced is_community_member() (SECURITY DEFINER) for
-- exactly this purpose — community_posts SELECT just never got rewritten
-- to use it.
--
-- Note: this migration runs idempotently on a DB where Al already applied
-- the equivalent SQL on 2026-05-20. CREATE POLICY uses DROP IF EXISTS so
-- re-running is safe.

-- 1. community_members SELECT — drop the recursive third clause.
DROP POLICY IF EXISTS "Anyone can view members of public communities" ON community_members;
DROP POLICY IF EXISTS "Members + public communities can be read" ON community_members;
CREATE POLICY "Members + public communities can be read"
  ON community_members FOR SELECT
  USING (
    community_id IN (SELECT id FROM communities WHERE is_private = false)
    OR user_id = auth.uid()
    OR is_community_member(community_id, auth.uid())
  );

-- 2. community_posts SELECT — use the security-definer helper + allow
-- authors to always read their own posts as a defensive safety net.
DROP POLICY IF EXISTS "Members can view community posts" ON community_posts;
DROP POLICY IF EXISTS "Public posts + members + author can read" ON community_posts;
CREATE POLICY "Public posts + members + author can read"
  ON community_posts FOR SELECT
  USING (
    community_id IN (SELECT id FROM communities WHERE is_private = false)
    OR is_community_member(community_id, auth.uid())
    OR author_id = auth.uid()
  );

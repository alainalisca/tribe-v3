-- 106_community_events_update_with_check.sql
--
-- FIX (audit 2026-06-30): the community_events UPDATE policy (from
-- add_community_events.sql) has USING (created_by = auth.uid()) but NO
-- WITH CHECK. So a creator could UPDATE their event to reassign created_by
-- to someone else, or move it into a community they are not a member of.
-- Add a WITH CHECK mirroring the INSERT policy so the post-update row must
-- still belong to the caller and stay within a community they belong to.

DROP POLICY IF EXISTS "community_events_update" ON community_events;
CREATE POLICY "community_events_update"
  ON community_events FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (
    created_by = auth.uid()
    AND is_community_member(community_id, auth.uid())
  );

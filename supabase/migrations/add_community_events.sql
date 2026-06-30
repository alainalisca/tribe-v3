-- add_community_events.sql
-- BUG-218: Add community_events + community_event_rsvps tables.
--
-- The community detail page had a planned "create event" button with no
-- backend to back it up. This migration creates the two tables and their
-- RLS policies, mirroring the community_posts patterns from migrations
-- 011 + 092 (uses the is_community_member() SECURITY DEFINER helper
-- introduced in migration 048).
--
-- IMPORTANT: This migration MUST be run on the live Supabase database
-- before deploying the BUG-218 feature branch. Running it a second time
-- is safe — all statements are idempotent (IF NOT EXISTS / OR REPLACE).

-- ── community_events ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid       NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) > 0),
  description text,
  location    text,
  event_at    timestamptz NOT NULL,
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_events_feed
  ON community_events(community_id, event_at);

-- ── community_event_rsvps ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_event_rsvps (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_event_rsvps_event
  ON community_event_rsvps(event_id);

-- ── RLS: community_events ────────────────────────────────────────────────

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;

-- SELECT: same expression used by community_posts in migration 092.
-- Public communities → all authenticated users; private → members only.
DROP POLICY IF EXISTS "community_events_select" ON community_events;
CREATE POLICY "community_events_select"
  ON community_events FOR SELECT
  USING (
    community_id IN (SELECT id FROM communities WHERE is_private = false)
    OR is_community_member(community_id, auth.uid())
    OR created_by = auth.uid()
  );

-- INSERT: must be a member; created_by must match the caller.
DROP POLICY IF EXISTS "community_events_insert" ON community_events;
CREATE POLICY "community_events_insert"
  ON community_events FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND is_community_member(community_id, auth.uid())
  );

-- UPDATE: event creator only.
DROP POLICY IF EXISTS "community_events_update" ON community_events;
CREATE POLICY "community_events_update"
  ON community_events FOR UPDATE
  USING (created_by = auth.uid());

-- DELETE: event creator or community admin/moderator.
DROP POLICY IF EXISTS "community_events_delete" ON community_events;
CREATE POLICY "community_events_delete"
  ON community_events FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM community_members
      WHERE community_id = community_events.community_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'moderator')
    )
  );

-- ── RLS: community_event_rsvps ───────────────────────────────────────────

ALTER TABLE community_event_rsvps ENABLE ROW LEVEL SECURITY;

-- SELECT: visible to anyone who can view the community.
DROP POLICY IF EXISTS "community_event_rsvps_select" ON community_event_rsvps;
CREATE POLICY "community_event_rsvps_select"
  ON community_event_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_events e
      JOIN communities c ON c.id = e.community_id
      WHERE e.id = community_event_rsvps.event_id
        AND (c.is_private = false OR is_community_member(c.id, auth.uid()))
    )
  );

-- INSERT: own row; user must be able to view the community.
DROP POLICY IF EXISTS "community_event_rsvps_insert" ON community_event_rsvps;
CREATE POLICY "community_event_rsvps_insert"
  ON community_event_rsvps FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM community_events e
      JOIN communities c ON c.id = e.community_id
      WHERE e.id = community_event_rsvps.event_id
        AND (c.is_private = false OR is_community_member(c.id, auth.uid()))
    )
  );

-- DELETE: own row only.
DROP POLICY IF EXISTS "community_event_rsvps_delete" ON community_event_rsvps;
CREATE POLICY "community_event_rsvps_delete"
  ON community_event_rsvps FOR DELETE
  USING (user_id = auth.uid());

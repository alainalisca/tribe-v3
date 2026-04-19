-- Migration 011: Social Features
-- Creates all tables needed for DMs, communities, notifications,
-- challenges, and post comments. Run once in Supabase SQL Editor.
--
-- Tables created:
--   conversations, conversation_participants,
--   communities, community_members, community_posts,
--   community_post_comments, community_post_likes,
--   notifications, challenges, challenge_participants,
--   post_comments
--
-- Columns added:
--   chat_messages.conversation_id, instructor_posts.comments_count,
--   users.community_id, sessions.community_id

-- ══════════════════════════════════════════════════
-- 1. DIRECT MESSAGING
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group', 'session')),
  title text,                          -- For group convos; null for DMs
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user
  ON conversation_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_conv_participants_conv
  ON conversation_participants(conversation_id);

-- Add conversation_id to existing chat_messages (nullable — existing messages keep session_id)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at)
  WHERE conversation_id IS NOT NULL;

-- RLS for conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their conversations"
  ON conversations FOR SELECT
  USING (
    id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS for conversation_participants
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participants of their conversations"
  ON conversation_participants FOR SELECT
  USING (
    conversation_id IN (SELECT conversation_id FROM conversation_participants cp WHERE cp.user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can join conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own participation"
  ON conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════
-- 2. COMMUNITIES
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cover_image_url text,
  sport text,                          -- Nullable: some communities are general
  location_lat double precision,
  location_lng double precision,
  location_name text,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_private boolean DEFAULT false,
  member_count integer DEFAULT 1,      -- Cached; creator counts as first member
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communities_sport ON communities(sport) WHERE sport IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communities_creator ON communities(creator_id);

CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);

CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  media_url text,
  media_type text,                     -- 'image' | 'video' | null
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_feed
  ON community_posts(community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 500),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_post_comments_post
  ON community_post_comments(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS community_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- RLS for communities
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public communities are visible to all"
  ON communities FOR SELECT
  USING (
    is_private = false
    OR creator_id = auth.uid()
    OR id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can create communities"
  ON communities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND creator_id = auth.uid());

CREATE POLICY "Admins can update their communities"
  ON communities FOR UPDATE
  USING (
    creator_id = auth.uid()
    OR id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- RLS for community_members
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view members of public communities"
  ON community_members FOR SELECT
  USING (
    community_id IN (SELECT id FROM communities WHERE is_private = false)
    OR user_id = auth.uid()
    OR community_id IN (SELECT community_id FROM community_members cm WHERE cm.user_id = auth.uid())
  );

CREATE POLICY "Users can join communities"
  ON community_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave communities"
  ON community_members FOR DELETE
  USING (user_id = auth.uid());

-- RLS for community_posts
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view community posts"
  ON community_posts FOR SELECT
  USING (
    community_id IN (SELECT id FROM communities WHERE is_private = false)
    OR community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can create posts"
  ON community_posts FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Authors and admins can delete posts"
  ON community_posts FOR DELETE
  USING (
    author_id = auth.uid()
    OR community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- RLS for community_post_comments
ALTER TABLE community_post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read comments on visible posts"
  ON community_post_comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment"
  ON community_post_comments FOR INSERT
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete their own comments"
  ON community_post_comments FOR DELETE
  USING (author_id = auth.uid());

-- RLS for community_post_likes
ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view likes" ON community_post_likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON community_post_likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unlike" ON community_post_likes FOR DELETE USING (user_id = auth.uid());

-- Add community_id to sessions (optional link)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE SET NULL;

-- Add community_id to users (instructor's linked community)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════
-- 3. NOTIFICATIONS
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'follow', 'like', 'comment', 'review', 'session_join',
    'community_invite', 'achievement', 'referral_complete', 'dm',
    'challenge_complete', 'community_post'
  )),
  entity_type text,                    -- 'post' | 'session' | 'community' | 'review' | 'conversation' | 'challenge'
  entity_id uuid,
  message text NOT NULL,               -- Precomputed display string
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_feed
  ON notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(recipient_id, is_read)
  WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (recipient_id = auth.uid());

-- ══════════════════════════════════════════════════
-- 4. CHALLENGES
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  cover_image_url text,
  challenge_type text NOT NULL DEFAULT 'session_count'
    CHECK (challenge_type IN ('session_count', 'streak', 'sport_variety', 'custom')),
  target_value integer NOT NULL DEFAULT 10,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id uuid REFERENCES communities(id) ON DELETE SET NULL,
  sport text,                          -- Nullable: for sport-specific challenges
  is_public boolean DEFAULT true,
  participant_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_discovery
  ON challenges(end_date, is_public)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_challenges_creator
  ON challenges(creator_id);

CREATE TABLE IF NOT EXISTS challenge_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress integer DEFAULT 0,
  joined_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_user
  ON challenge_participants(user_id);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public challenges are visible"
  ON challenges FOR SELECT
  USING (is_public = true OR creator_id = auth.uid());

CREATE POLICY "Authenticated users can create challenges"
  ON challenges FOR INSERT
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creators can update their challenges"
  ON challenges FOR UPDATE
  USING (creator_id = auth.uid());

ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view challenge participants"
  ON challenge_participants FOR SELECT USING (true);

CREATE POLICY "Users can join challenges"
  ON challenge_participants FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own progress"
  ON challenge_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can leave challenges"
  ON challenge_participants FOR DELETE
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════
-- 5. POST COMMENTS (on instructor_posts)
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES instructor_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 500),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post
  ON post_comments(post_id, created_at ASC);

-- Add cached comment count to instructor_posts
ALTER TABLE instructor_posts
  ADD COLUMN IF NOT EXISTS comments_count integer DEFAULT 0;

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments" ON post_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON post_comments FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors can delete their comments" ON post_comments FOR DELETE USING (author_id = auth.uid());

-- ══════════════════════════════════════════════════
-- 6. CHALLENGE PROGRESS TRIGGER
-- ══════════════════════════════════════════════════
-- Auto-increment challenge progress when a session is attended.
-- Fires on INSERT to session_participants where status = 'joined' or attended = true.

CREATE OR REPLACE FUNCTION update_challenge_progress()
RETURNS trigger AS $$
DECLARE
  r RECORD;
  session_sport text;
BEGIN
  -- Get the sport of the session
  SELECT sport INTO session_sport FROM sessions WHERE id = NEW.session_id;

  -- Find active challenges this user is participating in
  FOR r IN
    SELECT cp.id AS cp_id, c.challenge_type, c.target_value, cp.progress, c.id AS challenge_id
    FROM challenge_participants cp
    JOIN challenges c ON c.id = cp.challenge_id
    WHERE cp.user_id = NEW.user_id
      AND c.start_date <= now()
      AND c.end_date >= now()
      AND cp.completed_at IS NULL
  LOOP
    -- For session_count: always increment
    IF r.challenge_type = 'session_count' THEN
      UPDATE challenge_participants
      SET progress = progress + 1,
          completed_at = CASE WHEN progress + 1 >= r.target_value THEN now() ELSE NULL END
      WHERE id = r.cp_id;
    END IF;

    -- For sport_variety: increment if this is a new sport for the user in this challenge
    IF r.challenge_type = 'sport_variety' THEN
      IF NOT EXISTS (
        SELECT 1 FROM session_participants sp
        JOIN sessions s ON s.id = sp.session_id
        WHERE sp.user_id = NEW.user_id
          AND s.sport = session_sport
          AND sp.session_id != NEW.session_id
      ) THEN
        UPDATE challenge_participants
        SET progress = progress + 1,
            completed_at = CASE WHEN progress + 1 >= r.target_value THEN now() ELSE NULL END
        WHERE id = r.cp_id;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_challenge_progress'
  ) THEN
    CREATE TRIGGER trg_challenge_progress
      AFTER INSERT ON session_participants
      FOR EACH ROW
      EXECUTE FUNCTION update_challenge_progress();
  END IF;
END
$$;

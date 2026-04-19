-- 031_instructor_content_feed.sql
-- Fill out the existing instructor_posts table and add post_comments.

ALTER TABLE instructor_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'text'
    CHECK (post_type IN ('text', 'photo', 'video', 'tip', 'workout', 'session_preview'));

ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS title_es TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS body_es TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE instructor_posts
  ADD COLUMN IF NOT EXISTS linked_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- post_likes may already exist; guard creation.
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES instructor_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES instructor_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_posts_author
  ON instructor_posts (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instructor_posts_feed
  ON instructor_posts (created_at DESC)
  WHERE post_type != 'session_preview';
CREATE INDEX IF NOT EXISTS idx_post_comments_post
  ON post_comments (post_id, created_at ASC);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_comments" ON post_comments;
CREATE POLICY "anyone_can_read_comments" ON post_comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "auth_users_can_comment" ON post_comments;
CREATE POLICY "auth_users_can_comment" ON post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_comments" ON post_comments;
CREATE POLICY "own_comments" ON post_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Maintain like_count
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE instructor_posts SET like_count = COALESCE(like_count, 0) + 1
      WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE instructor_posts SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0)
      WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_like_count_trigger ON post_likes;
CREATE TRIGGER post_like_count_trigger
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

-- Maintain comment_count
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE instructor_posts SET comment_count = COALESCE(comment_count, 0) + 1
      WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE instructor_posts SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
      WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_comment_count_trigger ON post_comments;
CREATE TRIGGER post_comment_count_trigger
  AFTER INSERT OR DELETE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

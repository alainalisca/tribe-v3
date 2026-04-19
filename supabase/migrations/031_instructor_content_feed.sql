-- 031_instructor_content_feed.sql
-- Extend the existing instructor_posts table with content feed features.
-- IMPORTANT: The live table uses author_id (not instructor_id) and content (not body).
-- We only ADD columns that don't already exist.

-- New columns
ALTER TABLE instructor_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'text'
    CHECK (post_type IN ('text', 'photo', 'video', 'tip', 'workout', 'session_preview'));

ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS title_es TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS body_es TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE instructor_posts ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- linked_session_id, like_count, is_pinned already exist — skip

-- Indexes using correct column name (author_id)
CREATE INDEX IF NOT EXISTS idx_instructor_posts_author
  ON instructor_posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instructor_posts_feed
  ON instructor_posts (created_at DESC)
  WHERE post_type != 'session_preview';

-- post_comments already exists (migration 011) with author_id column.
-- Ensure RLS policies use author_id (not user_id).
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_comments" ON post_comments;
CREATE POLICY "anyone_can_read_comments" ON post_comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "auth_users_can_comment" ON post_comments;
CREATE POLICY "auth_users_can_comment" ON post_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "own_comments" ON post_comments;
CREATE POLICY "own_comments" ON post_comments
  FOR DELETE USING (auth.uid() = author_id);

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

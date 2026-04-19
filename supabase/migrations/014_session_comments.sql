-- Migration 014: Session Q&A Comments
-- Pre-session questions and host answers on session detail pages.
-- Allows users to ask questions BEFORE joining a session.

CREATE TABLE IF NOT EXISTS session_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 500),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_session_comments_session ON session_comments(session_id, created_at ASC);

ALTER TABLE session_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read session comments
CREATE POLICY "Authenticated users can read session comments"
  ON session_comments FOR SELECT USING (auth.uid() IS NOT NULL);

-- Authenticated users can post comments
CREATE POLICY "Authenticated users can post session comments"
  ON session_comments FOR INSERT WITH CHECK (author_id = auth.uid());

-- Authors and session creators can delete comments
CREATE POLICY "Authors can delete their own session comments"
  ON session_comments FOR DELETE USING (author_id = auth.uid());

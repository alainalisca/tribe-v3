-- Create reviews table for host ratings
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one review per user per session
  UNIQUE(session_id, reviewer_id)
);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_reviews_host_id ON reviews(host_id);
CREATE INDEX IF NOT EXISTS idx_reviews_session_id ON reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all reviews
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

-- Policy: Users can only create reviews for sessions they attended
CREATE POLICY "Users can review sessions they attended"
  ON reviews FOR INSERT
  WITH CHECK (
    -- Reviewer must be the authenticated user
    reviewer_id = auth.uid()
    -- Session must be in the past
    AND EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND s.date < CURRENT_DATE
    )
    -- User must have been a confirmed participant (not the host)
    AND EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = reviews.session_id
      AND sp.user_id = auth.uid()
      AND sp.status = 'confirmed'
    )
    -- User cannot review their own session
    AND host_id != auth.uid()
    -- User hasn't already reviewed this session
    AND NOT EXISTS (
      SELECT 1 FROM reviews r
      WHERE r.session_id = reviews.session_id
      AND r.reviewer_id = auth.uid()
    )
  );

-- Policy: Users can update their own reviews
CREATE POLICY "Users can update their own reviews"
  ON reviews FOR UPDATE
  USING (reviewer_id = auth.uid());

-- Policy: Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews"
  ON reviews FOR DELETE
  USING (reviewer_id = auth.uid());

-- Add average_rating column to users table for caching
ALTER TABLE users
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- Create function to update host's average rating
CREATE OR REPLACE FUNCTION update_host_average_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the host's average rating
  UPDATE users
  SET
    average_rating = (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM reviews
      WHERE host_id = COALESCE(NEW.host_id, OLD.host_id)
    ),
    total_reviews = (
      SELECT COUNT(*)
      FROM reviews
      WHERE host_id = COALESCE(NEW.host_id, OLD.host_id)
    )
  WHERE id = COALESCE(NEW.host_id, OLD.host_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update average rating
DROP TRIGGER IF EXISTS trigger_update_host_rating ON reviews;
CREATE TRIGGER trigger_update_host_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_host_average_rating();

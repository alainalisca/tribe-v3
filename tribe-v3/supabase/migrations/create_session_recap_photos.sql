-- Create session_recap_photos table if it doesn't exist
CREATE TABLE IF NOT EXISTS session_recap_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reported BOOLEAN DEFAULT FALSE,
  CONSTRAINT unique_user_photo_per_session UNIQUE(session_id, user_id, photo_url)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_session_recap_photos_session 
ON session_recap_photos(session_id);

CREATE INDEX IF NOT EXISTS idx_session_recap_photos_user 
ON session_recap_photos(user_id);

-- Enable RLS
ALTER TABLE session_recap_photos ENABLE ROW LEVEL SECURITY;

-- Policies: Anyone can read, authenticated users can insert their own photos
CREATE POLICY "Anyone can view recap photos"
ON session_recap_photos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can upload their own recap photos"
ON session_recap_photos FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recap photos"
ON session_recap_photos FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can moderate recap photos"
ON session_recap_photos FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.email = 'alainalisca@aplusfitnessllc.com'
  )
);

CREATE TABLE IF NOT EXISTS community_bulletin (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID REFERENCES users(id) NOT NULL,
  title TEXT NOT NULL,
  description_en TEXT,
  description_es TEXT,
  category TEXT NOT NULL DEFAULT 'event', -- event, announcement, meetup, social, other
  sport_type TEXT, -- optional, can be null for social/tangential events
  event_date DATE,
  event_time TIME,
  location_name TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  image_url TEXT, -- flier image
  external_url TEXT, -- link to event page
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_bulletin ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved active posts
CREATE POLICY "Anyone can read approved posts" ON community_bulletin
  FOR SELECT USING (status = 'approved' AND is_active = true);

-- Users can create posts (go to pending)
CREATE POLICY "Users can create posts" ON community_bulletin
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Users can update their own posts
CREATE POLICY "Users can update own posts" ON community_bulletin
  FOR UPDATE USING (auth.uid() = author_id);

-- Admins can manage all posts
CREATE POLICY "Admins can manage bulletin" ON community_bulletin
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

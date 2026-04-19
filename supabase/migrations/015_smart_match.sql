-- Smart Match: Training preferences and auto-suggestion tables
-- Migration: add_smart_match

-- Training preferences for smart matching
CREATE TABLE IF NOT EXISTS user_training_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  preferred_sports TEXT[] DEFAULT '{}',
  availability JSONB DEFAULT '[]'::jsonb,
  gender_preference TEXT DEFAULT 'any' CHECK (gender_preference IN ('any', 'male', 'female')),
  max_distance_km INT DEFAULT 10,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_training_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own prefs" ON user_training_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own prefs" ON user_training_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own prefs" ON user_training_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Smart match results
CREATE TABLE IF NOT EXISTS smart_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  matched_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  score NUMERIC(5,2) DEFAULT 0,
  shared_sports TEXT[] DEFAULT '{}',
  distance_km NUMERIC(6,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'dismissed', 'acted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, matched_user_id)
);

ALTER TABLE smart_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own matches" ON smart_matches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own matches" ON smart_matches FOR UPDATE USING (auth.uid() = user_id);

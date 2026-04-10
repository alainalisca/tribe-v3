-- Migration 012: Connections (session-gated) + Cold Start Infrastructure
--
-- This migration adds:
-- 1. connections table — mutual connections between users who've trained together
-- 2. shared_sessions view — tracks who has trained with whom
-- 3. external_events cache table — stores aggregated events from Meetup/Eventbrite
-- 4. popular_venues cache table — stores Google Places fitness venues
-- 5. first_mover badges — achievement for first session in an area
-- 6. strava_routes cache table — stores popular Strava segments

-- ══════════════════════════════════════════════════
-- 1. CONNECTIONS (session-gated, mutual)
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  shared_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id != recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_recipient ON connections(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_accepted
  ON connections(status) WHERE status = 'accepted';

-- Helper: check if two users have shared a session
CREATE OR REPLACE FUNCTION have_shared_session(user_a uuid, user_b uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM session_participants sp1
    JOIN session_participants sp2 ON sp1.session_id = sp2.session_id
    WHERE sp1.user_id = user_a
      AND sp2.user_id = user_b
      AND sp1.session_id = sp2.session_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: get first shared session between two users
CREATE OR REPLACE FUNCTION first_shared_session(user_a uuid, user_b uuid)
RETURNS uuid AS $$
DECLARE
  result uuid;
BEGIN
  SELECT sp1.session_id INTO result
  FROM session_participants sp1
  JOIN session_participants sp2 ON sp1.session_id = sp2.session_id
  JOIN sessions s ON s.id = sp1.session_id
  WHERE sp1.user_id = user_a
    AND sp2.user_id = user_b
  ORDER BY s.date ASC
  LIMIT 1;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Count shared sessions between two users
CREATE OR REPLACE FUNCTION shared_session_count(user_a uuid, user_b uuid)
RETURNS integer AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(DISTINCT sp1.session_id) INTO cnt
  FROM session_participants sp1
  JOIN session_participants sp2 ON sp1.session_id = sp2.session_id
  WHERE sp1.user_id = user_a
    AND sp2.user_id = user_b;
  RETURN cnt;
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS for connections
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connections"
  ON connections FOR SELECT
  USING (requester_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can create connection requests"
  ON connections FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND have_shared_session(requester_id, recipient_id)
  );

CREATE POLICY "Recipients can update connection status"
  ON connections FOR UPDATE
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can delete their own connections"
  ON connections FOR DELETE
  USING (requester_id = auth.uid() OR recipient_id = auth.uid());

-- ══════════════════════════════════════════════════
-- 2. EXTERNAL EVENTS CACHE (Meetup, Eventbrite)
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS external_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('meetup', 'eventbrite', 'strava')),
  external_id text NOT NULL,
  title text NOT NULL,
  description text,
  sport text,
  location_lat double precision,
  location_lng double precision,
  location_name text,
  event_url text NOT NULL,
  image_url text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  participant_count integer DEFAULT 0,
  organizer_name text,
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours',
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_events_geo
  ON external_events(location_lat, location_lng)
  WHERE expires_at > now();

CREATE INDEX IF NOT EXISTS idx_external_events_time
  ON external_events(start_time)
  WHERE expires_at > now();

CREATE INDEX IF NOT EXISTS idx_external_events_sport
  ON external_events(sport)
  WHERE sport IS NOT NULL AND expires_at > now();

-- Public read, only server can write (via service role key)
ALTER TABLE external_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view external events"
  ON external_events FOR SELECT USING (true);

-- ══════════════════════════════════════════════════
-- 3. POPULAR VENUES CACHE (Google Places)
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS popular_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('gym', 'park', 'pool', 'studio', 'track', 'trail', 'box', 'other')),
  location_lat double precision NOT NULL,
  location_lng double precision NOT NULL,
  address text,
  rating double precision,
  photo_url text,
  suggested_sports text[] DEFAULT '{}',
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS idx_popular_venues_geo
  ON popular_venues(location_lat, location_lng);

CREATE INDEX IF NOT EXISTS idx_popular_venues_category
  ON popular_venues(category);

ALTER TABLE popular_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view venues"
  ON popular_venues FOR SELECT USING (true);

-- ══════════════════════════════════════════════════
-- 4. STRAVA ROUTES CACHE
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS strava_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_segment_id bigint NOT NULL UNIQUE,
  name text NOT NULL,
  sport text NOT NULL CHECK (sport IN ('Running', 'Cycling')),
  distance_meters double precision NOT NULL,
  elevation_gain double precision,
  start_lat double precision NOT NULL,
  start_lng double precision NOT NULL,
  end_lat double precision,
  end_lng double precision,
  polyline text,
  athlete_count integer DEFAULT 0,
  star_count integer DEFAULT 0,
  city text,
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS idx_strava_routes_geo
  ON strava_routes(start_lat, start_lng);

CREATE INDEX IF NOT EXISTS idx_strava_routes_sport
  ON strava_routes(sport);

ALTER TABLE strava_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view routes"
  ON strava_routes FOR SELECT USING (true);

-- ══════════════════════════════════════════════════
-- 5. FIRST MOVER TRACKING
-- ══════════════════════════════════════════════════

-- Add first_session_in_area flag to track trailblazers
-- Uses a geohash-like approach: round lat/lng to ~1km grid
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_trailblazer boolean DEFAULT false;

-- Track which grid cells have had sessions
CREATE TABLE IF NOT EXISTS area_first_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_lat integer NOT NULL,        -- lat * 100 (rounds to ~1km)
  grid_lng integer NOT NULL,        -- lng * 100 (rounds to ~1km)
  first_session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  first_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_name text,                   -- human-readable location
  created_at timestamptz DEFAULT now(),
  UNIQUE (grid_lat, grid_lng)
);

CREATE INDEX IF NOT EXISTS idx_area_first_sessions_user
  ON area_first_sessions(first_user_id);

ALTER TABLE area_first_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view first sessions"
  ON area_first_sessions FOR SELECT USING (true);

CREATE POLICY "System can insert first sessions"
  ON area_first_sessions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger: when a session is created, check if it's the first in that grid cell
CREATE OR REPLACE FUNCTION check_first_in_area()
RETURNS trigger AS $$
DECLARE
  g_lat integer;
  g_lng integer;
  loc_name text;
BEGIN
  -- Only process sessions with location
  IF NEW.location_lat IS NULL OR NEW.location_lng IS NULL THEN
    RETURN NEW;
  END IF;

  -- Round to ~1km grid
  g_lat := ROUND(NEW.location_lat * 100)::integer;
  g_lng := ROUND(NEW.location_lng * 100)::integer;

  -- Check if this grid cell already has a session
  IF NOT EXISTS (SELECT 1 FROM area_first_sessions WHERE grid_lat = g_lat AND grid_lng = g_lng) THEN
    -- Get location name from session
    loc_name := COALESCE(NEW.location, 'Unknown area');

    -- Record as first in area
    INSERT INTO area_first_sessions (grid_lat, grid_lng, first_session_id, first_user_id, area_name)
    VALUES (g_lat, g_lng, NEW.id, NEW.creator_id, loc_name)
    ON CONFLICT (grid_lat, grid_lng) DO NOTHING;

    -- Mark user as trailblazer
    UPDATE users SET is_trailblazer = true WHERE id = NEW.creator_id;

    -- Create notification for the user
    INSERT INTO notifications (recipient_id, type, message, entity_type, entity_id)
    VALUES (
      NEW.creator_id,
      'achievement',
      '🏔️ Trailblazer! You hosted the first session in ' || loc_name || '!',
      'session',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on session creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_first_in_area'
  ) THEN
    CREATE TRIGGER trg_first_in_area
      AFTER INSERT ON sessions
      FOR EACH ROW
      EXECUTE FUNCTION check_first_in_area();
  END IF;
END
$$;

-- Comments
COMMENT ON TABLE connections IS 'Mutual connections between users. Can only be created after sharing a session (enforced by RLS + have_shared_session function).';
COMMENT ON TABLE external_events IS 'Cached fitness events from Meetup, Eventbrite. Auto-expires after 24h. Populated by API routes.';
COMMENT ON TABLE popular_venues IS 'Cached Google Places fitness venues. Auto-expires after 7 days. Used for smart session templates.';
COMMENT ON TABLE strava_routes IS 'Cached popular Strava segments. Auto-expires after 7 days.';
COMMENT ON TABLE area_first_sessions IS 'Tracks which geographic grid cells have had their first session. Used for Trailblazer badge.';

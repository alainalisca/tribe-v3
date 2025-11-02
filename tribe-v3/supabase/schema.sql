-- Tribe v3 Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  rating DECIMAL(3, 2) DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  show_rate DECIMAL(5, 2) DEFAULT 0,
  preferred_sports TEXT[] DEFAULT '{}',
  verified_credentials JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  sport TEXT NOT NULL,
  title TEXT,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration INTEGER NOT NULL,
  location TEXT NOT NULL,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  max_participants INTEGER NOT NULL,
  current_participants INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session participants table
CREATE TABLE public.session_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- Match requests table
CREATE TABLE public.match_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  requester_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_sessions_date ON public.sessions(date);
CREATE INDEX idx_sessions_sport ON public.sessions(sport);
CREATE INDEX idx_sessions_creator ON public.sessions(creator_id);
CREATE INDEX idx_session_participants_user ON public.session_participants(user_id);
CREATE INDEX idx_match_requests_recipient ON public.match_requests(recipient_id);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_requests ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view all profiles" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Sessions policies
CREATE POLICY "Anyone can view active sessions" ON public.sessions FOR SELECT USING (status = 'active');
CREATE POLICY "Users can create sessions" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Users can update own sessions" ON public.sessions FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Users can delete own sessions" ON public.sessions FOR DELETE USING (auth.uid() = creator_id);

-- Session participants policies
CREATE POLICY "Anyone can view session participants" ON public.session_participants FOR SELECT USING (true);
CREATE POLICY "Users can join sessions" ON public.session_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own participation" ON public.session_participants FOR UPDATE USING (auth.uid() = user_id);

-- Match requests policies
CREATE POLICY "Users can view their match requests" ON public.match_requests FOR SELECT USING (auth.uid() = recipient_id OR auth.uid() = requester_id);
CREATE POLICY "Users can create match requests" ON public.match_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Recipients can update match requests" ON public.match_requests FOR UPDATE USING (auth.uid() = recipient_id);

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update participant count
CREATE OR REPLACE FUNCTION public.update_session_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    UPDATE public.sessions SET current_participants = current_participants + 1 WHERE id = NEW.session_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
    UPDATE public.sessions SET current_participants = current_participants + 1 WHERE id = NEW.session_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
    UPDATE public.sessions SET current_participants = current_participants - 1 WHERE id = NEW.session_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    UPDATE public.sessions SET current_participants = current_participants - 1 WHERE id = OLD.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for participant count
CREATE TRIGGER update_participant_count
  AFTER INSERT OR UPDATE OR DELETE ON public.session_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_session_participant_count();

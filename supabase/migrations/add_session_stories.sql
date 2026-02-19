-- Session Stories table
CREATE TABLE IF NOT EXISTS public.session_stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  thumbnail_url TEXT,
  caption TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '48 hours')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_stories_session_id ON public.session_stories(session_id);
CREATE INDEX IF NOT EXISTS idx_session_stories_expires_at ON public.session_stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_stories_user_id ON public.session_stories(user_id);

-- RLS
ALTER TABLE public.session_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view non-expired stories" ON public.session_stories FOR SELECT USING (expires_at > NOW());
CREATE POLICY "Authenticated users can insert own stories" ON public.session_stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own stories" ON public.session_stories FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for session stories media
-- Run this in the Supabase SQL Editor:
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'session-stories',
--   'session-stories',
--   true,
--   52428800,
--   ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
-- )
-- ON CONFLICT (id) DO NOTHING;
--
-- CREATE POLICY "Anyone can view session stories media"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'session-stories');
--
-- CREATE POLICY "Authenticated users can upload session stories media"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'session-stories' AND auth.role() = 'authenticated');
--
-- CREATE POLICY "Users can delete own session stories media"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'session-stories' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Live Status table: tracks users actively training in a session
CREATE TABLE IF NOT EXISTS public.live_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '15 minutes'),
  last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_live_status_session_id ON public.live_status(session_id);
CREATE INDEX IF NOT EXISTS idx_live_status_expires_at ON public.live_status(expires_at);
CREATE INDEX IF NOT EXISTS idx_live_status_user_id ON public.live_status(user_id);

-- RLS
ALTER TABLE public.live_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live status"
  ON public.live_status FOR SELECT
  USING (true);

CREATE POLICY "Auth users can insert own live status"
  ON public.live_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own live status"
  ON public.live_status FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own live status"
  ON public.live_status FOR DELETE
  USING (auth.uid() = user_id);

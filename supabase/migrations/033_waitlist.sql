-- 033_waitlist.sql
-- Waitlist system for full sessions. Preserves demand when a session is full
-- and offers spots to the next in line when someone leaves.

CREATE TABLE IF NOT EXISTS session_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
  offered_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_session_waiting
  ON session_waitlist (session_id, position) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_waitlist_user
  ON session_waitlist (user_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_offers
  ON session_waitlist (offer_expires_at) WHERE status = 'offered';

ALTER TABLE session_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_waitlist" ON session_waitlist;
CREATE POLICY "users_own_waitlist" ON session_waitlist
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "session_creator_view_waitlist" ON session_waitlist;
CREATE POLICY "session_creator_view_waitlist" ON session_waitlist
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id = session_waitlist.session_id AND creator_id = auth.uid()
    )
  );

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS waitlist_count INTEGER DEFAULT 0;

-- Keep sessions.waitlist_count synced when waiting rows are added/removed
CREATE OR REPLACE FUNCTION update_session_waitlist_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'waiting' THEN
      UPDATE sessions SET waitlist_count = COALESCE(waitlist_count, 0) + 1
        WHERE id = NEW.session_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'waiting' AND NEW.status != 'waiting' THEN
      UPDATE sessions SET waitlist_count = GREATEST(COALESCE(waitlist_count, 0) - 1, 0)
        WHERE id = NEW.session_id;
    ELSIF OLD.status != 'waiting' AND NEW.status = 'waiting' THEN
      UPDATE sessions SET waitlist_count = COALESCE(waitlist_count, 0) + 1
        WHERE id = NEW.session_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'waiting' THEN
      UPDATE sessions SET waitlist_count = GREATEST(COALESCE(waitlist_count, 0) - 1, 0)
        WHERE id = OLD.session_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waitlist_count_trigger ON session_waitlist;
CREATE TRIGGER waitlist_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON session_waitlist
  FOR EACH ROW EXECUTE FUNCTION update_session_waitlist_count();

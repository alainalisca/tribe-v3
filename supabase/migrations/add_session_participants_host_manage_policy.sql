-- Migration: add_session_participants_host_manage_policy
--
-- Additive / defensive: adds UPDATE and DELETE policies on session_participants
-- that allow the session creator (sessions.creator_id) to manage participant
-- rows of their own sessions.
--
-- Without these policies only the participant themselves could update/delete
-- their own row (via the existing self-only policies). An RLS-blocked host
-- write would silently return 0 rows — now the DAL detects this, but the real
-- fix is granting the host the permission they need.
--
-- MUST BE RUN ON THE LIVE DATABASE after deploying the corresponding code.
-- Safe to run multiple times (DROP POLICY IF EXISTS before each CREATE POLICY).

-- Host: UPDATE a participant row for a session they created
DROP POLICY IF EXISTS "Host can update participants of own sessions" ON public.session_participants;
CREATE POLICY "Host can update participants of own sessions"
  ON public.session_participants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_participants.session_id
        AND s.creator_id = auth.uid()
    )
  );

-- Host: DELETE a participant row for a session they created
DROP POLICY IF EXISTS "Host can delete participants of own sessions" ON public.session_participants;
CREATE POLICY "Host can delete participants of own sessions"
  ON public.session_participants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_participants.session_id
        AND s.creator_id = auth.uid()
    )
  );

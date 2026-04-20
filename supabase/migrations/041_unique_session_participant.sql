-- 041_unique_session_participant.sql
-- LOGIC-07: session_participants has no unique constraint, so a double-click
-- or a race between two browser tabs can insert the same user twice. Also
-- required as a prerequisite for the ON CONFLICT path inside the join_session
-- RPC (migration 042).

-- Dedupe any accidental duplicates before applying the constraint. Keep the
-- earliest row by ctid.
DELETE FROM session_participants a
USING session_participants b
WHERE a.ctid > b.ctid
  AND a.session_id = b.session_id
  AND a.user_id = b.user_id;

-- Idempotent constraint add — Postgres doesn't support
-- `ADD CONSTRAINT IF NOT EXISTS`, so we guard via pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_participants_session_user_uniq'
  ) THEN
    ALTER TABLE session_participants
      ADD CONSTRAINT session_participants_session_user_uniq
      UNIQUE (session_id, user_id);
  END IF;
END $$;

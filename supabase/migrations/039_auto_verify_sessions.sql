-- 039_auto_verify_sessions.sql
-- QA-15: Al flagged that every new session had to be manually photo-verified
-- in the admin panel. For a Medellín-scale instructor base, per-session
-- manual review is not a reasonable use of admin time — and the QA note
-- was explicit: "These are basic things that don't need my input."
--
-- Policy change: sessions are trusted on creation (photo_verified = true).
-- Admin still has the Verify / Remove UI to act when someone manually
-- unverifies (e.g. from a report), but the default is "trusted until
-- flagged" instead of "suspicious until cleared."

-- 1. Flip the column default so new sessions come in verified.
ALTER TABLE sessions
  ALTER COLUMN photo_verified SET DEFAULT true;

-- 2. Backfill existing sessions so the admin list isn't buried in legacy
--    unverified rows. This only changes rows where verification hasn't
--    been explicitly recorded yet.
UPDATE sessions
SET photo_verified = true
WHERE photo_verified IS NOT TRUE
  AND verified_at IS NULL;

-- Migration 081 — Per-gym intelligence email opt-out
--
-- The nightly intelligence cron creates community_insights for every
-- AT_RISK member. Coaches won't always be on the dashboard, so we
-- email them a digest after the run completes — but some coaches
-- will want to disable that (already-busy inbox, multiple coaches
-- on one gym, etc.). This adds a per-gym toggle wired to the
-- email-send branch in the cron.
--
-- Defaulting to TRUE so every existing premium gym starts receiving
-- the digest immediately. Users can flip it off from /os/gym
-- settings.

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS intelligence_email_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.gyms.intelligence_email_enabled IS
  'When true, the nightly intelligence cron emails the gym owner a digest of newly-created insights. Defaults true; opt out from /os/gym settings.';

-- Verification:
--   SELECT id, name, intelligence_email_enabled FROM public.gyms LIMIT 5;

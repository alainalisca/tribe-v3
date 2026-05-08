-- 059_extend_tribe_os_waitlist.sql
-- Extends tribe_os_waitlist (added in 056) with the signal-gathering fields
-- needed for the Studio San Diego sit-down: pricing model preference,
-- free-form comments, plus IP and referrer for bot filtering and source
-- tracking.
--
-- Additive only. Existing rows from migration 056 stay valid; new columns
-- are nullable. The form layer marks `pricing_preference` required for new
-- submissions, so the DB stays permissive while the product enforces.
--
-- RLS untouched: 056 already allows anon INSERT and admin SELECT/UPDATE/DELETE
-- via is_app_admin().

ALTER TABLE tribe_os_waitlist
  ADD COLUMN IF NOT EXISTS pricing_preference text
    CHECK (pricing_preference IS NULL OR pricing_preference IN ('monthly_30', 'revenue_share_15')),
  ADD COLUMN IF NOT EXISTS comments text
    CHECK (comments IS NULL OR char_length(comments) <= 2000),
  ADD COLUMN IF NOT EXISTS ip_address text
    CHECK (ip_address IS NULL OR char_length(ip_address) <= 64),
  ADD COLUMN IF NOT EXISTS referrer text
    CHECK (referrer IS NULL OR char_length(referrer) <= 1024);

COMMENT ON COLUMN tribe_os_waitlist.pricing_preference IS
  'Which monetization model the instructor would prefer. ''monthly_30'' = $30/mo flat. ''revenue_share_15'' = 15% of paid session revenue. Required at form layer; nullable at DB so 056-era rows stay valid.';

COMMENT ON COLUMN tribe_os_waitlist.comments IS
  'Optional free-form notes from the instructor about their practice or what would help most. 2000-char ceiling.';

COMMENT ON COLUMN tribe_os_waitlist.ip_address IS
  'Captured server-side from x-forwarded-for. For bot filtering and abuse review only.';

COMMENT ON COLUMN tribe_os_waitlist.referrer IS
  'Captured server-side from the Referer header. Tracks which surface the signup came from.';

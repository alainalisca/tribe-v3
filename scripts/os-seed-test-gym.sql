-- T-OS0 Step 4: Convert Al's existing dormant gym into the test gym
-- CLASS: A (update existing Tribe.OS-owned row)
-- Run manually in Supabase SQL editor. Do NOT run from code.
--
-- Why UPDATE not INSERT: getGymForUser picks the OLDEST owned gym while
-- the premium gate picks the first ACTIVE gym, so a second owned gym
-- makes some routes open the wrong gym. Converting the existing dormant
-- gym avoids that.

-- Convert the gym
UPDATE gyms
SET
  name                      = 'BullBox (Prueba)',
  slug                      = 'bullbox-prueba',
  tribe_os_status           = 'active',
  tribe_os_tier             = 'team_studio',
  tribe_os_granted_at       = now(),
  tribe_os_granted_by       = 'manual:t-os0-test-gym',
  intelligence_email_enabled = false
WHERE id = 'd585af30-5ed5-448b-bd9c-ab82b2e99970'
  AND owner_user_id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e';

-- Ensure Al is in gym_coaches as owner
INSERT INTO gym_coaches (gym_id, user_id, role)
VALUES (
  'd585af30-5ed5-448b-bd9c-ab82b2e99970',
  'eaff348f-5df3-4df5-bd80-69ec233aad0e',
  'owner'
)
ON CONFLICT (gym_id, user_id) DO NOTHING;

-- ============================================================
-- REVERT (uncomment and run to restore the gym to its original state)
-- ============================================================
-- UPDATE gyms
-- SET
--   slug                      = 'alainalisca-53a8bc',
--   tribe_os_status           = NULL,
--   tribe_os_tier             = 'solo',
--   tribe_os_granted_at       = NULL,
--   tribe_os_granted_by       = NULL,
--   intelligence_email_enabled = true
-- WHERE id = 'd585af30-5ed5-448b-bd9c-ab82b2e99970'
--   AND owner_user_id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e';

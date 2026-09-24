-- T-OS0 Step 4: Create the test gym
-- CLASS: A (new rows only, Tribe.OS-owned tables)
-- Run manually in Supabase SQL editor. Replace <AL_USER_ID> with Al's auth.users id.
--
-- BEFORE running: verify Al's user id:
--   SELECT id FROM auth.users WHERE email = 'alainalisca@aplusfitnessllc.com';

-- 1. Create the test gym (skip if already exists)
INSERT INTO gyms (
  id, name, slug, owner_user_id, timezone,
  tribe_os_status, created_at
)
VALUES (
  gen_random_uuid(),
  'BullBox (Prueba)',
  'bullbox-prueba',
  '<AL_USER_ID>',           -- replace before running
  'America/Bogota',
  'active',
  now()
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Turn OFF intelligence email digest so main's nightly cron
--    doesn't email Al about fake members.
UPDATE gyms
SET email_digest_enabled = false
WHERE slug = 'bullbox-prueba';

-- 3. Add Al as owner in gym_coaches
INSERT INTO gym_coaches (gym_id, user_id, role)
SELECT g.id, g.owner_user_id, 'owner'
FROM gyms g
WHERE g.slug = 'bullbox-prueba'
ON CONFLICT (gym_id, user_id) DO NOTHING;

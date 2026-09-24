-- T-OS0 Step 4: Create the test gym
-- CLASS: A (new rows only, Tribe.OS-owned tables)
-- Run manually in Supabase SQL editor. Do NOT run from code.
--
-- owner_user_id is looked up by email; a wrong email fails on NOT NULL
-- instead of inserting garbage.

INSERT INTO gyms (
  id,
  name,
  slug,
  owner_user_id,
  timezone,
  tribe_os_status,
  tribe_os_tier,
  tribe_os_granted_at,
  tribe_os_granted_by,
  intelligence_email_enabled,
  created_at
)
VALUES (
  gen_random_uuid(),
  'BullBox (Prueba)',
  'bullbox-prueba',
  (SELECT id FROM auth.users WHERE email = 'alainalisca@aplusfitnessllc.com'),
  'America/Bogota',
  'active',
  'team_studio',
  now(),
  'manual:t-os0-test-gym',
  false,
  now()
)
ON CONFLICT (slug) DO NOTHING;

-- Add Al as owner in gym_coaches
INSERT INTO gym_coaches (gym_id, user_id, role)
SELECT g.id, g.owner_user_id, 'owner'
FROM gyms g
WHERE g.slug = 'bullbox-prueba'
ON CONFLICT (gym_id, user_id) DO NOTHING;

-- supabase/audit-legacy-auth-path.sql
--
-- Run BEFORE attempting to retire the legacy instructor_user_id
-- auth path in lib/dal/clients.ts (and everywhere else).
--
-- Purpose: identify any rows / users still on the legacy path so
-- we can backfill them into the gym-based model before flipping
-- the code to gym-only.
--
-- The legacy path means:
--   - clients.gym_id IS NULL (the new gym foreign key wasn't set)
--   - clients.instructor_user_id IS NOT NULL (old FK is set)
--   - users may or may not be in gym_coaches
--
-- The gym path requires:
--   - clients.gym_id IS NOT NULL
--   - The owner of the gym is in gym_coaches with role='owner'
--   - All coaches in the gym are in gym_coaches with their role
--
-- Migration 069 was supposed to backfill everything in one shot
-- but the code still defensively handles the legacy branch. Once
-- this audit returns zero rows in the 'legacy_only' bucket, we
-- can drop the `else: scope by instructor_user_id` code paths
-- across the DAL with confidence.
--
-- Safe to run repeatedly — pure SELECTs, no side effects.

-- ──────────────────────────────────────────────────────────────────
-- 1. Clients on the legacy-only path (no gym_id)
-- ──────────────────────────────────────────────────────────────────
-- Expectation: ZERO rows after migration 069 ran. Any rows here
-- need a one-time UPDATE that sets gym_id from the owner's gym.

SELECT
  'clients_on_legacy_only' AS bucket,
  count(*)                  AS row_count,
  count(DISTINCT instructor_user_id) AS distinct_owners
FROM public.clients
WHERE gym_id IS NULL
  AND instructor_user_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2. Users with legacy clients who are NOT in gym_coaches
-- ──────────────────────────────────────────────────────────────────
-- Expectation: ZERO rows. If non-zero, these owners need a gyms
-- + gym_coaches row created before their clients can be moved
-- to the gym path.

SELECT
  'users_with_legacy_clients_no_gym_coaches' AS bucket,
  count(*)                                    AS user_count
FROM public.users u
WHERE EXISTS (
  SELECT 1 FROM public.clients c
  WHERE c.instructor_user_id = u.id AND c.gym_id IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM public.gym_coaches gc
  WHERE gc.user_id = u.id
);

-- ──────────────────────────────────────────────────────────────────
-- 3. Specific users + client counts (if either of the above > 0)
-- ──────────────────────────────────────────────────────────────────
-- This is the diagnostic list. Use it to plan the backfill: each
-- row tells you how many of one user's clients need their gym_id
-- populated.

SELECT
  u.id            AS user_id,
  u.email,
  u.name,
  count(c.id)     AS legacy_client_count,
  EXISTS (
    SELECT 1 FROM public.gyms g WHERE g.owner_user_id = u.id
  )               AS has_gym,
  EXISTS (
    SELECT 1 FROM public.gym_coaches gc WHERE gc.user_id = u.id
  )               AS in_gym_coaches
FROM public.users u
JOIN public.clients c ON c.instructor_user_id = u.id
WHERE c.gym_id IS NULL
GROUP BY u.id, u.email, u.name
ORDER BY count(c.id) DESC;

-- ──────────────────────────────────────────────────────────────────
-- 4. Backfill template (commented out — review case-by-case)
-- ──────────────────────────────────────────────────────────────────
-- The general shape for one user. Adapt to your specific findings.
--
-- For users WITH a gym already:
--   UPDATE public.clients c
--   SET gym_id = (SELECT id FROM public.gyms g WHERE g.owner_user_id = c.instructor_user_id LIMIT 1)
--   WHERE c.instructor_user_id = '<user-id>'
--     AND c.gym_id IS NULL;
--
-- For users WITHOUT a gym (need to provision one first):
--   INSERT INTO public.gyms (owner_user_id, name, slug)
--   VALUES ('<user-id>', '<gym name>', '<slug>')
--   RETURNING id;
--   -- Then INSERT INTO gym_coaches (gym_id, user_id, role) VALUES (<gym-id>, '<user-id>', 'owner');
--   -- Then run the UPDATE above with the new gym_id.
--
-- After the backfill, re-run the 'clients_on_legacy_only' query.
-- When it returns 0, the code can be refactored to drop the
-- legacy branch (see lib/dal/clients.ts listClients,
-- generateClientsCsv, etc.).

-- T-OS0: Clean up seed data from bullbox-prueba
-- Run manually in Supabase SQL editor. Do NOT run from code.
-- Only deletes clients tagged 'seed'. The 4 existing clients are untouched.
--
-- client_visits.client_id has ON DELETE CASCADE, so all seed members'
-- visits are automatically deleted when the client row is removed.
-- No separate DELETE FROM client_visits is needed.

BEGIN;

DELETE FROM public.clients
WHERE gym_id = 'd585af30-5ed5-448b-bd9c-ab82b2e99970'
  AND 'seed' = ANY(tags);

COMMIT;

SELECT
  count(*) FILTER (WHERE tags @> '{seed}') AS remaining_seed_clients,
  count(*) AS total_clients
FROM public.clients
WHERE gym_id = 'd585af30-5ed5-448b-bd9c-ab82b2e99970';

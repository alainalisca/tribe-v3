-- T-OS1 Schema Revert: undo migrations 9000–9004
--
-- ⚠️  WARNING: This drops all T-OS1 schema objects and their data.
--     Only use this if you need to completely roll back the T-OS1 schema.
--     There is no undo for dropped data.
--
-- Run in the Supabase SQL editor. Objects are dropped in reverse
-- dependency order.

BEGIN;

-- 9004: drop view first (depends on client_visits)
DROP VIEW IF EXISTS public.client_activity_v2;

-- 9003: gym_import_mappings
DROP TABLE IF EXISTS public.gym_import_mappings CASCADE;

-- 9002: client_visits (depends on client_imports via import_id)
DROP TABLE IF EXISTS public.client_visits CASCADE;

-- 9001: columns on clients (drop index, then columns)
DROP INDEX IF EXISTS public.idx_clients_gym_external;
ALTER TABLE public.clients DROP COLUMN IF EXISTS external_source;
ALTER TABLE public.clients DROP COLUMN IF EXISTS external_id;
ALTER TABLE public.clients DROP COLUMN IF EXISTS joined_on;
ALTER TABLE public.clients DROP COLUMN IF EXISTS membership_plan;
ALTER TABLE public.clients DROP COLUMN IF EXISTS plan_ends_on;

-- 9000: client_imports
DROP TABLE IF EXISTS public.client_imports CASCADE;

-- Remove ledger entries
DELETE FROM public.migrations_applied
WHERE migration IN (
  '9000_client_imports',
  '9001_clients_import_columns',
  '9002_client_visits',
  '9003_gym_import_mappings',
  '9004_client_activity_v2'
);

COMMIT;

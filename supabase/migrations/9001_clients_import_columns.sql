-- CLASS: A
-- TABLE: clients (tribe-os) — new nullable columns only
--
-- T-OS1 Step 2: Columns for matching imported members to external
-- systems (Mira, generic CSV). All nullable, no NOT NULL, no CHECK
-- that existing rows could violate. Main never reads or writes these.
--
-- No REVOKE needed: this migration adds columns and an index to the
-- existing clients table. Indexes have no privileges in PostgreSQL.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS joined_on date,
  ADD COLUMN IF NOT EXISTS membership_plan text,
  ADD COLUMN IF NOT EXISTS plan_ends_on date;

-- Partial unique index for upsert-by-external-id within a gym.
-- Only applies when external_id is not null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_gym_external
  ON public.clients (gym_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

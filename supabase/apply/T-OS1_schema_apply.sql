-- T-OS1 Schema Apply: migrations 9000–9004
-- Run this in a single transaction against the Supabase SQL editor.
-- It creates all Tribe.OS T-OS1 objects and records them in migrations_applied.
--
-- SAFE TO RE-RUN: uses IF NOT EXISTS and ON CONFLICT DO NOTHING throughout.

BEGIN;

------------------------------------------------------------
-- 9000: client_imports
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('members', 'visits')),
  source text NOT NULL CHECK (source IN ('mira_csv', 'csv', 'manual')),
  file_name text,
  row_count integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  errors jsonb,
  imported_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_imports_gym
  ON public.client_imports (gym_id, created_at DESC);

ALTER TABLE public.client_imports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "client_imports_coach_select"
    ON public.client_imports FOR SELECT TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_imports_coach_insert"
    ON public.client_imports FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_imports_coach_update"
    ON public.client_imports FOR UPDATE TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_imports_coach_delete"
    ON public.client_imports FOR DELETE TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON public.client_imports FROM PUBLIC;
REVOKE ALL ON public.client_imports FROM anon;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('9000_client_imports', 'T-OS1: import tracking table')
ON CONFLICT (migration) DO NOTHING;

------------------------------------------------------------
-- 9001: clients import columns
------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS joined_on date,
  ADD COLUMN IF NOT EXISTS membership_plan text,
  ADD COLUMN IF NOT EXISTS plan_ends_on date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_gym_external
  ON public.clients (gym_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('9001_clients_import_columns', 'T-OS1: external_source/id columns on clients')
ON CONFLICT (migration) DO NOTHING;

------------------------------------------------------------
-- 9002: client_visits
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL,
  class_name text,
  coach_name text,
  source text NOT NULL CHECK (source IN ('mira_csv', 'csv', 'manual')),
  external_id text,
  import_id uuid REFERENCES public.client_imports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, client_id, visited_at)
);

CREATE INDEX IF NOT EXISTS idx_client_visits_gym_client_date
  ON public.client_visits (gym_id, client_id, visited_at DESC);

ALTER TABLE public.client_visits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "client_visits_coach_select"
    ON public.client_visits FOR SELECT TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_visits.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_visits_coach_insert"
    ON public.client_visits FOR INSERT TO authenticated
    WITH CHECK (
      (
        EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_visits.gym_id AND gc.user_id = auth.uid())
        OR public.is_app_admin()
      )
      AND EXISTS (
        SELECT 1 FROM public.clients c WHERE c.id = client_visits.client_id AND c.gym_id = client_visits.gym_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_visits_coach_delete"
    ON public.client_visits FOR DELETE TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_visits.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON public.client_visits FROM PUBLIC;
REVOKE ALL ON public.client_visits FROM anon;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('9002_client_visits', 'T-OS1: external attendance table')
ON CONFLICT (migration) DO NOTHING;

------------------------------------------------------------
-- 9003: gym_import_mappings
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gym_import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('members', 'visits')),
  name text NOT NULL DEFAULT 'default',
  mapping jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, kind, name)
);

CREATE INDEX IF NOT EXISTS idx_gym_import_mappings_gym
  ON public.gym_import_mappings (gym_id);

ALTER TABLE public.gym_import_mappings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "gym_import_mappings_coach_select"
    ON public.gym_import_mappings FOR SELECT TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "gym_import_mappings_coach_insert"
    ON public.gym_import_mappings FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "gym_import_mappings_coach_update"
    ON public.gym_import_mappings FOR UPDATE TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "gym_import_mappings_coach_delete"
    ON public.gym_import_mappings FOR DELETE TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON public.gym_import_mappings FROM PUBLIC;
REVOKE ALL ON public.gym_import_mappings FROM anon;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('9003_gym_import_mappings', 'T-OS1: saved column mappings per gym')
ON CONFLICT (migration) DO NOTHING;

------------------------------------------------------------
-- 9004: client_activity_v2 (view)
------------------------------------------------------------
CREATE OR REPLACE VIEW public.client_activity_v2
WITH (security_invoker = true)
AS
  SELECT
    ca.id,
    ca.gym_id,
    ca.client_id,
    COALESCE(ca.attended_at, ca.created_at) AS activity_at,
    'tribe_session'::text AS source,
    NULL::text AS class_name,
    NULL::text AS coach_name,
    ca.session_id,
    NULL::uuid AS import_id,
    ca.created_at
  FROM public.client_attendance ca
  WHERE ca.attended = true

  UNION ALL

  SELECT
    cv.id,
    cv.gym_id,
    cv.client_id,
    cv.visited_at AS activity_at,
    cv.source,
    cv.class_name,
    cv.coach_name,
    NULL::uuid AS session_id,
    cv.import_id,
    cv.created_at
  FROM public.client_visits cv;

REVOKE ALL ON public.client_activity_v2 FROM PUBLIC;
REVOKE ALL ON public.client_activity_v2 FROM anon;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('9004_client_activity_v2', 'T-OS1: unified activity view (SECURITY INVOKER)')
ON CONFLICT (migration) DO NOTHING;

------------------------------------------------------------
-- Verification
------------------------------------------------------------
SELECT json_build_object(
  'client_imports_exists', (SELECT to_regclass('public.client_imports') IS NOT NULL),
  'client_imports_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_imports'::regclass),
  'client_visits_exists', (SELECT to_regclass('public.client_visits') IS NOT NULL),
  'client_visits_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_visits'::regclass),
  'gym_import_mappings_exists', (SELECT to_regclass('public.gym_import_mappings') IS NOT NULL),
  'gym_import_mappings_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gym_import_mappings'::regclass),
  'client_activity_v2_exists', (SELECT to_regclass('public.client_activity_v2') IS NOT NULL),
  'idx_clients_gym_external_exists', (SELECT to_regclass('public.idx_clients_gym_external') IS NOT NULL),
  'anon_cannot_select_client_imports', NOT has_table_privilege('anon', 'public.client_imports', 'SELECT'),
  'anon_cannot_select_client_visits', NOT has_table_privilege('anon', 'public.client_visits', 'SELECT'),
  'anon_cannot_select_gym_import_mappings', NOT has_table_privilege('anon', 'public.gym_import_mappings', 'SELECT'),
  'anon_cannot_select_client_activity_v2', NOT has_table_privilege('anon', 'public.client_activity_v2', 'SELECT'),
  'ledger_9000', EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '9000_client_imports'),
  'ledger_9001', EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '9001_clients_import_columns'),
  'ledger_9002', EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '9002_client_visits'),
  'ledger_9003', EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '9003_gym_import_mappings'),
  'ledger_9004', EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '9004_client_activity_v2')
) AS verification;

COMMIT;

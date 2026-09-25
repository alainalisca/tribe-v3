-- T-OS1 Step 3 Apply: migration 9005 (client_retention_v2)
-- Run in a single transaction in the Supabase SQL editor.
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_retention_v2 (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  score numeric,
  level text CHECK (level IN ('high', 'medium', 'low', 'new', 'insufficient_data')),
  reasons text[] NOT NULL DEFAULT '{}',
  signals jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_retention_v2_gym_level
  ON public.client_retention_v2 (gym_id, level);

ALTER TABLE public.client_retention_v2 ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "client_retention_v2_coach_select"
    ON public.client_retention_v2 FOR SELECT TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_retention_v2_coach_insert"
    ON public.client_retention_v2 FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_retention_v2_coach_update"
    ON public.client_retention_v2 FOR UPDATE TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_retention_v2_coach_delete"
    ON public.client_retention_v2 FOR DELETE TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.gym_coaches gc WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid())
      OR public.is_app_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON public.client_retention_v2 FROM PUBLIC;
REVOKE ALL ON public.client_retention_v2 FROM anon;

INSERT INTO public.migrations_applied (migration, note)
VALUES ('9005_client_retention_v2', 'T-OS1 Step 3: retention scoring table')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

SELECT json_build_object(
  'client_retention_v2_exists', (SELECT to_regclass('public.client_retention_v2') IS NOT NULL),
  'client_retention_v2_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_retention_v2'::regclass),
  'anon_cannot_select', NOT has_table_privilege('anon', 'public.client_retention_v2', 'SELECT'),
  'ledger_9005', EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '9005_client_retention_v2')
) AS verification;

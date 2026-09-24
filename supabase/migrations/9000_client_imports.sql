-- CLASS: A
-- TABLE: client_imports (tribe-os) — new table
--
-- T-OS1 Step 2: Import tracking table. Created before client_visits
-- because client_visits.import_id references it.

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
  imported_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_imports_gym
  ON public.client_imports (gym_id, created_at DESC);

-- RLS: gym coaches only
ALTER TABLE public.client_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_imports_coach_select"
  ON public.client_imports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "client_imports_coach_insert"
  ON public.client_imports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "client_imports_coach_delete"
  ON public.client_imports FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_imports.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

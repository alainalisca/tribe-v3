-- CLASS: A
-- TABLE: gym_import_mappings (tribe-os) — new table
--
-- T-OS1 Step 2: Saved column mappings per gym per import kind.
-- The owner picks which CSV column maps to name, email, phone, etc.
-- Mapping is saved so re-imports of the same format don't need
-- re-mapping. A 'mira' preset can be added when Leo's real export
-- format is known.

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

-- RLS: gym coaches only
ALTER TABLE public.gym_import_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gym_import_mappings_coach_select"
  ON public.gym_import_mappings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "gym_import_mappings_coach_insert"
  ON public.gym_import_mappings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "gym_import_mappings_coach_update"
  ON public.gym_import_mappings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "gym_import_mappings_coach_delete"
  ON public.gym_import_mappings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_import_mappings.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.gym_import_mappings FROM PUBLIC;
REVOKE ALL ON public.gym_import_mappings FROM anon;

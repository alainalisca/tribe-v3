-- CLASS: A
-- TABLE: client_visits (tribe-os) — new table
--
-- T-OS1 Step 1: Attendance that happens outside Tribe (Mira, manual).
-- Separate from client_attendance because that table has 6 triggers
-- that fire on insert and write to clients columns owned by main's
-- nightly crons. No triggers on this table.

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

-- RLS: gym coaches only, no anon
ALTER TABLE public.client_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_visits_coach_select"
  ON public.client_visits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_visits.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "client_visits_coach_insert"
  ON public.client_visits FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = client_visits.gym_id AND gc.user_id = auth.uid()
      )
      OR public.is_app_admin()
    )
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_visits.client_id AND c.gym_id = client_visits.gym_id
    )
  );

CREATE POLICY "client_visits_coach_delete"
  ON public.client_visits FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_visits.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.client_visits FROM PUBLIC;
REVOKE ALL ON public.client_visits FROM anon;

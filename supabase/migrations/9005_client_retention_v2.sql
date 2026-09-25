-- CLASS: A
-- TABLE: client_retention_v2 (tribe-os) — new table
--
-- T-OS1 Step 3: Retention scores computed from client_activity_v2.
-- Never writes to clients.churn_risk_* (owned by main's nightly cron).

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

CREATE POLICY "client_retention_v2_coach_select"
  ON public.client_retention_v2 FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "client_retention_v2_coach_insert"
  ON public.client_retention_v2 FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "client_retention_v2_coach_update"
  ON public.client_retention_v2 FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "client_retention_v2_coach_delete"
  ON public.client_retention_v2 FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_retention_v2.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.client_retention_v2 FROM PUBLIC;
REVOKE ALL ON public.client_retention_v2 FROM anon;

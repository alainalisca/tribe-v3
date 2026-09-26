-- CLASS: A
-- TABLE: client_touches (tribe-os) — new table
--
-- T-OS1 Step 4: Records when a coach contacts a member (WhatsApp, call, etc).

CREATE TABLE IF NOT EXISTS public.client_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'call', 'in_person', 'other')),
  note text,
  ai_assisted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_touches_gym_client_at
  ON public.client_touches (gym_id, client_id, created_at DESC);

ALTER TABLE public.client_touches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_touches_coach_select"
  ON public.client_touches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_touches.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "client_touches_coach_insert"
  ON public.client_touches FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = client_touches.gym_id AND gc.user_id = auth.uid()
      )
      OR public.is_app_admin()
    )
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_touches.client_id AND c.gym_id = client_touches.gym_id
    )
  );

CREATE POLICY "client_touches_coach_delete"
  ON public.client_touches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = client_touches.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.client_touches FROM PUBLIC;
REVOKE ALL ON public.client_touches FROM anon;

-- CLASS: A
-- TABLE: gym_plans (tribe-os) — new table
--
-- Maps plan names found in clients.plan to a price and duration so the
-- Pronóstico page can compute revenue at risk.
--
-- Plan names come from the import (e.g. "Mensual", "Semestral") and
-- are matched case-insensitively via the unique index.
--
-- No trigger for updated_at (Class A forbids CREATE TRIGGER).
-- The app sets updated_at = now() on every UPDATE.

CREATE TABLE IF NOT EXISTS public.gym_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL CHECK (currency IN ('COP', 'USD')),
  duration_months int NOT NULL CHECK (duration_months BETWEEN 1 AND 24),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_plans_gym_name
  ON public.gym_plans (gym_id, lower(name));

ALTER TABLE public.gym_plans ENABLE ROW LEVEL SECURITY;

-- SELECT: gym owner, coaches, or app admin
CREATE POLICY "gym_plans_member_select"
  ON public.gym_plans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_plans.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_plans.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- INSERT: gym owner only
CREATE POLICY "gym_plans_owner_insert"
  ON public.gym_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_plans.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- UPDATE: gym owner only
CREATE POLICY "gym_plans_owner_update"
  ON public.gym_plans FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_plans.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_plans.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- DELETE: gym owner only
CREATE POLICY "gym_plans_owner_delete"
  ON public.gym_plans FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = gym_plans.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.gym_plans FROM PUBLIC;
REVOKE ALL ON public.gym_plans FROM anon;

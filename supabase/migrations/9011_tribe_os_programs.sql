-- CLASS: A
-- TABLES: tribe_os_programs, tribe_os_program_members
--
-- Gym-level training programs. A program is a named block (e.g.
-- "HYROX 8-Week Prep") that groups members for a training cycle.
-- Progress is tracked against target_sessions_per_week using
-- client_visits rows between starts_at and today/ends_at.
--
-- No triggers, no functions, no ALTER on existing tables, no DROP.
-- updated_at is set by the app, not a trigger.

-- ─── 1. Programs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  sport text CHECK (sport IS NULL OR (sport = btrim(sport) AND char_length(sport) BETWEEN 1 AND 60)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  starts_at date,
  ends_at date,
  target_sessions_per_week smallint CHECK (
    target_sessions_per_week IS NULL
    OR target_sessions_per_week BETWEEN 1 AND 14
  ),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

-- Composite unique for child composite FK (program_members)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_programs_id_gym
  ON public.tribe_os_programs (id, gym_id);

CREATE INDEX IF NOT EXISTS idx_tribe_os_programs_gym_status
  ON public.tribe_os_programs (gym_id, status);

ALTER TABLE public.tribe_os_programs ENABLE ROW LEVEL SECURITY;

-- Owner or coach can read
CREATE POLICY "tribe_os_programs_select"
  ON public.tribe_os_programs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_programs.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_programs.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- Owner or coach can create; created_by must be the caller.
CREATE POLICY "tribe_os_programs_insert"
  ON public.tribe_os_programs FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.id = tribe_os_programs.gym_id AND g.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = tribe_os_programs.gym_id AND gc.user_id = auth.uid()
      )
    )
    AND tribe_os_programs.created_by = auth.uid()
  );

-- Owner or coach can update
CREATE POLICY "tribe_os_programs_update"
  ON public.tribe_os_programs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_programs.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_programs.gym_id AND gc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_programs.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_programs.gym_id AND gc.user_id = auth.uid()
    )
  );

-- No DELETE policy: programs are archived, not deleted.

REVOKE ALL ON public.tribe_os_programs FROM PUBLIC;
REVOKE ALL ON public.tribe_os_programs FROM anon;

-- ─── 2. Program members ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_program_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  gym_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  FOREIGN KEY (program_id, gym_id)
    REFERENCES public.tribe_os_programs (id, gym_id) ON DELETE CASCADE
);

-- One active assignment per client per program
CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_program_members_active
  ON public.tribe_os_program_members (program_id, client_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tribe_os_program_members_gym
  ON public.tribe_os_program_members (gym_id);

CREATE INDEX IF NOT EXISTS idx_tribe_os_program_members_client
  ON public.tribe_os_program_members (client_id)
  WHERE removed_at IS NULL;

ALTER TABLE public.tribe_os_program_members ENABLE ROW LEVEL SECURITY;

-- Owner or coach can read
CREATE POLICY "tribe_os_program_members_select"
  ON public.tribe_os_program_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_program_members.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_program_members.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- Owner or coach can assign; created_by must be the caller;
-- client must belong to the same gym.
CREATE POLICY "tribe_os_program_members_insert"
  ON public.tribe_os_program_members FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.id = tribe_os_program_members.gym_id AND g.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = tribe_os_program_members.gym_id AND gc.user_id = auth.uid()
      )
    )
    AND tribe_os_program_members.created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = tribe_os_program_members.client_id
        AND c.gym_id = tribe_os_program_members.gym_id
    )
  );

-- Owner or coach can update (soft-remove via removed_at);
-- client must still belong to the same gym.
CREATE POLICY "tribe_os_program_members_update"
  ON public.tribe_os_program_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_program_members.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_program_members.gym_id AND gc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.id = tribe_os_program_members.gym_id AND g.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = tribe_os_program_members.gym_id AND gc.user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = tribe_os_program_members.client_id
        AND c.gym_id = tribe_os_program_members.gym_id
    )
  );

-- No DELETE policy: members are soft-removed via removed_at.

REVOKE ALL ON public.tribe_os_program_members FROM PUBLIC;
REVOKE ALL ON public.tribe_os_program_members FROM anon;

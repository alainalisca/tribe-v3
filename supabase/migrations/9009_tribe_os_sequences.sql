-- CLASS: A
-- TABLES: tribe_os_gym_settings, tribe_os_sequences, tribe_os_sequence_steps,
--         tribe_os_sequence_enrollments, tribe_os_step_completions
--
-- Follow-up sequences for at-risk members. The system never sends anything;
-- it creates tasks and drafts that a human sends via Escribir/WhatsApp.
--
-- No triggers, no functions, no ALTER on existing tables.
-- updated_at is set by the app, not a trigger.

-- ─── 1. Gym settings (autonomy mode) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_gym_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  sequence_autonomy text NOT NULL DEFAULT 'manual'
    CHECK (sequence_autonomy IN ('manual', 'suggest', 'auto')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_gym_settings_gym
  ON public.tribe_os_gym_settings (gym_id);

ALTER TABLE public.tribe_os_gym_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tribe_os_gym_settings_select"
  ON public.tribe_os_gym_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_gym_settings.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_gym_settings.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_gym_settings_insert"
  ON public.tribe_os_gym_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_gym_settings.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_gym_settings_update"
  ON public.tribe_os_gym_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_gym_settings.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_gym_settings.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.tribe_os_gym_settings FROM PUBLIC;
REVOKE ALL ON public.tribe_os_gym_settings FROM anon;

-- ─── 2. Sequences ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tribe_os_sequences_gym
  ON public.tribe_os_sequences (gym_id);

ALTER TABLE public.tribe_os_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tribe_os_sequences_select"
  ON public.tribe_os_sequences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequences.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_sequences.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_sequences_insert"
  ON public.tribe_os_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequences.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_sequences_update"
  ON public.tribe_os_sequences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequences.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequences.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.tribe_os_sequences FROM PUBLIC;
REVOKE ALL ON public.tribe_os_sequences FROM anon;

-- ─── 3. Sequence steps ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.tribe_os_sequences(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position BETWEEN 1 AND 20),
  day_offset int NOT NULL CHECK (day_offset BETWEEN 0 AND 60),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'call', 'in_person', 'other')),
  template_key text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_sequence_steps_seq_pos
  ON public.tribe_os_sequence_steps (sequence_id, position);

CREATE INDEX IF NOT EXISTS idx_tribe_os_sequence_steps_gym
  ON public.tribe_os_sequence_steps (gym_id);

ALTER TABLE public.tribe_os_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tribe_os_sequence_steps_select"
  ON public.tribe_os_sequence_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequence_steps.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_sequence_steps.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_sequence_steps_insert"
  ON public.tribe_os_sequence_steps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequence_steps.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_sequence_steps_update"
  ON public.tribe_os_sequence_steps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequence_steps.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequence_steps.gym_id AND g.owner_user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.tribe_os_sequence_steps FROM PUBLIC;
REVOKE ALL ON public.tribe_os_sequence_steps FROM anon;

-- ─── 4. Enrollments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.tribe_os_sequences(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'completed', 'stopped', 'came_back')),
  current_step int NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_reason text,
  enrolled_by_type text NOT NULL DEFAULT 'user'
    CHECK (enrolled_by_type IN ('user', 'system')),
  enrolled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one open enrollment (pending_approval or active) per member per gym
CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_enrollments_one_open
  ON public.tribe_os_sequence_enrollments (gym_id, client_id)
  WHERE status IN ('pending_approval', 'active');

CREATE INDEX IF NOT EXISTS idx_tribe_os_enrollments_gym_status
  ON public.tribe_os_sequence_enrollments (gym_id, status);

CREATE INDEX IF NOT EXISTS idx_tribe_os_enrollments_client
  ON public.tribe_os_sequence_enrollments (client_id);

ALTER TABLE public.tribe_os_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tribe_os_enrollments_select"
  ON public.tribe_os_sequence_enrollments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequence_enrollments.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_sequence_enrollments.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_enrollments_insert"
  ON public.tribe_os_sequence_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.id = tribe_os_sequence_enrollments.gym_id AND g.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = tribe_os_sequence_enrollments.gym_id AND gc.user_id = auth.uid()
      )
      OR public.is_app_admin()
    )
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = tribe_os_sequence_enrollments.client_id
        AND c.gym_id = tribe_os_sequence_enrollments.gym_id
    )
  );

CREATE POLICY "tribe_os_enrollments_update"
  ON public.tribe_os_sequence_enrollments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequence_enrollments.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_sequence_enrollments.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_sequence_enrollments.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_sequence_enrollments.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

REVOKE ALL ON public.tribe_os_sequence_enrollments FROM PUBLIC;
REVOKE ALL ON public.tribe_os_sequence_enrollments FROM anon;

-- ─── 5. Step completions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_step_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.tribe_os_sequence_enrollments(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  step_position int NOT NULL CHECK (step_position BETWEEN 1 AND 20),
  touch_id uuid REFERENCES public.client_touches(id) ON DELETE SET NULL,
  done_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_step_completions_uniq
  ON public.tribe_os_step_completions (enrollment_id, step_position);

CREATE INDEX IF NOT EXISTS idx_tribe_os_step_completions_gym
  ON public.tribe_os_step_completions (gym_id);

ALTER TABLE public.tribe_os_step_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tribe_os_step_completions_select"
  ON public.tribe_os_step_completions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_step_completions.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_step_completions.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

CREATE POLICY "tribe_os_step_completions_insert"
  ON public.tribe_os_step_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.id = tribe_os_step_completions.gym_id AND g.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = tribe_os_step_completions.gym_id AND gc.user_id = auth.uid()
      )
      OR public.is_app_admin()
    )
    AND EXISTS (
      SELECT 1 FROM public.tribe_os_sequence_enrollments e
      WHERE e.id = tribe_os_step_completions.enrollment_id
        AND e.gym_id = tribe_os_step_completions.gym_id
    )
  );

REVOKE ALL ON public.tribe_os_step_completions FROM PUBLIC;
REVOKE ALL ON public.tribe_os_step_completions FROM anon;

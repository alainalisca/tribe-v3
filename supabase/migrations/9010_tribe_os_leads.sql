-- CLASS: A
-- TABLES: tribe_os_leads, tribe_os_lead_activities
--
-- Gym-level lead management. A lead is a prospective member who has not
-- yet been converted to a client. Activities track every touchpoint.
--
-- No triggers, no functions, no ALTER on existing tables, no DROP.
-- updated_at is set by the app, not a trigger.

-- ─── 1. Leads ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (full_name = btrim(full_name) AND char_length(full_name) BETWEEN 1 AND 120),
  phone text CHECK (phone ~ '^\+?[0-9]{7,20}$'),
  email text,
  source text NOT NULL CHECK (source IN (
    'walk_in', 'instagram', 'whatsapp', 'referral',
    'tribe_app', 'website', 'other'
  )),
  referred_by_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  tribe_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  interest text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'contacted', 'trial_booked', 'trial_done', 'joined', 'lost'
  )),
  lost_reason text,
  trial_at timestamptz,
  next_follow_up_at timestamptz,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  converted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'lost' OR lost_reason IS NOT NULL)
);

-- Composite unique for child composite FK (lead_activities)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_leads_id_gym
  ON public.tribe_os_leads (id, gym_id);

CREATE INDEX IF NOT EXISTS idx_tribe_os_leads_gym_status
  ON public.tribe_os_leads (gym_id, status);

CREATE INDEX IF NOT EXISTS idx_tribe_os_leads_follow_up
  ON public.tribe_os_leads (gym_id, next_follow_up_at)
  WHERE status NOT IN ('joined', 'lost');

-- No duplicate leads with same phone in the same gym while open
CREATE UNIQUE INDEX IF NOT EXISTS idx_tribe_os_leads_gym_phone_open
  ON public.tribe_os_leads (gym_id, phone)
  WHERE status NOT IN ('joined', 'lost') AND phone IS NOT NULL;

ALTER TABLE public.tribe_os_leads ENABLE ROW LEVEL SECURITY;

-- Owner or coach can read
CREATE POLICY "tribe_os_leads_select"
  ON public.tribe_os_leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_leads.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_leads.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- Owner or coach can create
CREATE POLICY "tribe_os_leads_insert"
  ON public.tribe_os_leads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_leads.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_leads.gym_id AND gc.user_id = auth.uid()
    )
  );

-- Owner or coach can update
CREATE POLICY "tribe_os_leads_update"
  ON public.tribe_os_leads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_leads.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_leads.gym_id AND gc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_leads.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_leads.gym_id AND gc.user_id = auth.uid()
    )
  );

-- No DELETE policy: leads are marked lost, not deleted.

REVOKE ALL ON public.tribe_os_leads FROM PUBLIC;
REVOKE ALL ON public.tribe_os_leads FROM anon;

-- ─── 2. Lead activities ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tribe_os_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  gym_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'note', 'whatsapp', 'call', 'in_person', 'status_change'
  )),
  body text,
  from_status text CHECK (from_status IS NULL OR from_status IN (
    'new', 'contacted', 'trial_booked', 'trial_done', 'joined', 'lost'
  )),
  to_status text CHECK (to_status IS NULL OR to_status IN (
    'new', 'contacted', 'trial_booked', 'trial_done', 'joined', 'lost'
  )),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (lead_id, gym_id)
    REFERENCES public.tribe_os_leads (id, gym_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tribe_os_lead_activities_lead
  ON public.tribe_os_lead_activities (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tribe_os_lead_activities_gym
  ON public.tribe_os_lead_activities (gym_id);

ALTER TABLE public.tribe_os_lead_activities ENABLE ROW LEVEL SECURITY;

-- Owner or coach can read
CREATE POLICY "tribe_os_lead_activities_select"
  ON public.tribe_os_lead_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = tribe_os_lead_activities.gym_id AND g.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = tribe_os_lead_activities.gym_id AND gc.user_id = auth.uid()
    )
    OR public.is_app_admin()
  );

-- Owner or coach can insert
CREATE POLICY "tribe_os_lead_activities_insert"
  ON public.tribe_os_lead_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.gyms g
        WHERE g.id = tribe_os_lead_activities.gym_id AND g.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.gym_coaches gc
        WHERE gc.gym_id = tribe_os_lead_activities.gym_id AND gc.user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.tribe_os_leads l
      WHERE l.id = tribe_os_lead_activities.lead_id
        AND l.gym_id = tribe_os_lead_activities.gym_id
    )
  );

-- No UPDATE or DELETE: activities are append-only.

REVOKE ALL ON public.tribe_os_lead_activities FROM PUBLIC;
REVOKE ALL ON public.tribe_os_lead_activities FROM anon;

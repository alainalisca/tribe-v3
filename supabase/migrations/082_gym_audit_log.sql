-- Migration 082 — gym_audit_log
--
-- Records sensitive actions in a gym so multi-coach gyms have a
-- forensic trail. Today's first use: every soft-archive + hard-purge
-- of a client. Future writes (refunds, role changes, gym setting
-- changes) layer in incrementally via the same DAL helper without
-- needing more migrations.
--
-- Read access: any coach in the gym (forensic visibility is a
-- multi-coach trust feature; gating it owner-only would defeat the
-- point of having a shared accountability surface).
-- Write access: same — the RLS WITH CHECK enforces actor_user_id =
-- auth.uid() so a coach can never spoof another coach's actions.
--
-- We intentionally don't reference clients(id) with a foreign key.
-- Audit entries need to survive the row they describe — purging a
-- client must NOT cascade-delete the audit entry that records the
-- purge. The target_id stays as a free uuid that may or may not
-- still exist.

CREATE TABLE IF NOT EXISTS public.gym_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  -- Who did the action. References public.users so we can show
  -- display names + avatars on a future audit-viewer surface.
  -- ON DELETE SET NULL so a deleted user doesn't blow away the log.
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Canonical action name. We don't constrain to an enum because
  -- adding new audit events shouldn't require a migration; the DAL
  -- layer decides what's loggable.
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  -- Loose categorization of what was acted on. Examples: 'client',
  -- 'attendance', 'team', 'gym', 'insight'.
  target_type text NOT NULL CHECK (char_length(target_type) BETWEEN 1 AND 40),
  target_id uuid,
  -- Free-form payload — e.g. {"name": "Anna García", "archived": true}
  -- to make the log human-readable later without joining other tables
  -- (which would fail after the target was purged).
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes:
--   - by gym + created_at DESC for "show me the last N events in this gym"
--   - by target for "what happened to this specific client?"
CREATE INDEX IF NOT EXISTS idx_gym_audit_log_gym_created
  ON public.gym_audit_log (gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gym_audit_log_target
  ON public.gym_audit_log (target_type, target_id)
  WHERE target_id IS NOT NULL;

ALTER TABLE public.gym_audit_log ENABLE ROW LEVEL SECURITY;

-- Read: any coach in the gym.
DROP POLICY IF EXISTS "gym_audit_log_coach_select" ON public.gym_audit_log;
CREATE POLICY "gym_audit_log_coach_select"
  ON public.gym_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_audit_log.gym_id AND gc.user_id = auth.uid()
    )
  );

-- Write: any coach in the gym, BUT actor_user_id must match the
-- authenticated user. Prevents one coach from forging entries that
-- look like they came from another coach.
DROP POLICY IF EXISTS "gym_audit_log_coach_insert" ON public.gym_audit_log;
CREATE POLICY "gym_audit_log_coach_insert"
  ON public.gym_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = gym_audit_log.gym_id AND gc.user_id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies — audit entries are append-only.
-- Service-role bypasses RLS and can still do administrative
-- corrections when absolutely needed.

COMMENT ON TABLE public.gym_audit_log IS
  'Append-only forensic log of sensitive actions in a gym. Each row records who did what, when, to which target. No FK to clients/attendance — entries survive their target rows so we can audit purges.';

-- Verification:
--   SELECT COUNT(*) FROM public.gym_audit_log;  -- 0 expected
--   \d+ public.gym_audit_log

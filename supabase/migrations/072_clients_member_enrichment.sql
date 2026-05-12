-- 072_clients_member_enrichment.sql
-- Phase 2 Tribe.OS Week 2 Mission 3: richer columns on clients +
-- last_seen_at sync from client_attendance.
--
-- New columns
-- -----------
--   status         — engagement state: active | inactive | lead | lapsed.
--                    Distinct from `archived` (soft-delete). Defaults to
--                    'active'. The at-risk widget (Mission 5) cross-
--                    references status with last_seen_at.
--   health_notes   — free-form text up to 4000 chars. Instructor-private
--                    metadata for medical / injury / restriction notes.
--                    Schema intentionally loose during discovery; tighten
--                    when usage patterns stabilize.
--   last_seen_at   — cached most-recent attended_at across the client's
--                    attendance history. Maintained by an AFTER INSERT
--                    OR UPDATE trigger on client_attendance so reads stay
--                    cheap (no per-row aggregation in dashboard queries).
--
-- Trigger semantics
-- -----------------
-- The sync_client_last_seen trigger fires when a client_attendance row is
-- inserted or its `attended` / `attended_at` columns change. It pushes the
-- max(existing, new) up onto clients.last_seen_at — never goes backwards.
-- Runs as the table owner so RLS does not block the cross-table write.
--
-- Backfill
-- --------
-- Step 3 backfills last_seen_at from existing attendance rows. Idempotent
-- via the IS NULL filter — re-running the migration touches zero rows.
-- Status defaults populate via the column default; no separate backfill.

-- ============================================================
-- 1. Columns
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'lead', 'lapsed'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS health_notes text
    CHECK (health_notes IS NULL OR char_length(health_notes) <= 4000);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- ============================================================
-- 2. Indexes for the at-risk widget query
-- ============================================================
-- The at-risk dashboard query (Mission 5) reads:
--   active clients (archived = false, status IN ('active', 'lapsed'))
--   for THIS gym (or instructor)
--   ordered by last_seen_at ASC (oldest first) NULLS LAST
--
-- Two indexes — one for the gym-tenant path, one for the legacy
-- instructor-tenant path. Partial-indexed on archived=false to keep
-- them small.

CREATE INDEX IF NOT EXISTS idx_clients_gym_last_seen
  ON public.clients (gym_id, last_seen_at NULLS LAST)
  WHERE gym_id IS NOT NULL AND archived = false;

CREATE INDEX IF NOT EXISTS idx_clients_instructor_last_seen
  ON public.clients (instructor_user_id, last_seen_at NULLS LAST)
  WHERE archived = false;

-- ============================================================
-- 3. last_seen_at sync trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_client_last_seen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire on attended = true. attended_at may be NULL if the app
  -- recorded attendance without an explicit time; we fall back to
  -- the row's created_at, then NOW() as final fallback (defensive).
  IF NEW.attended = true THEN
    UPDATE public.clients
    SET last_seen_at = GREATEST(
      COALESCE(last_seen_at, 'epoch'::timestamptz),
      COALESCE(NEW.attended_at, NEW.created_at, NOW())
    )
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_client_last_seen IS
  'Trigger function: pushes max(existing, new) onto clients.last_seen_at when an attendance row lands or flips to attended=true. SECURITY DEFINER so it bypasses RLS on clients; the only caller is the trigger.';

DROP TRIGGER IF EXISTS client_attendance_sync_last_seen ON public.client_attendance;
CREATE TRIGGER client_attendance_sync_last_seen
  AFTER INSERT OR UPDATE OF attended, attended_at ON public.client_attendance
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_last_seen();

-- ============================================================
-- 4. Backfill last_seen_at from existing attendance history
-- ============================================================

UPDATE public.clients c
SET last_seen_at = sub.max_seen
FROM (
  SELECT
    ca.client_id,
    MAX(COALESCE(ca.attended_at, ca.created_at)) AS max_seen
  FROM public.client_attendance ca
  WHERE ca.attended = true
  GROUP BY ca.client_id
) sub
WHERE c.id = sub.client_id
  AND c.last_seen_at IS NULL;

-- ============================================================
-- 5. Documentation
-- ============================================================

COMMENT ON COLUMN public.clients.status IS
  'Engagement state. active = currently training; inactive = stopped but kept on roster; lead = potential not yet started; lapsed = stopped without explicit reactivation. Distinct from `archived` which is the soft-delete flag.';

COMMENT ON COLUMN public.clients.health_notes IS
  'Instructor-private free-form notes on injuries, medical conditions, restrictions, goals. 4000-char cap. Schema intentionally loose; tighten if usage patterns stabilize.';

COMMENT ON COLUMN public.clients.last_seen_at IS
  'Cached max(attended_at) across this client''s attendance history. Maintained by sync_client_last_seen trigger so the at-risk widget query (Mission 5) avoids per-row aggregation.';

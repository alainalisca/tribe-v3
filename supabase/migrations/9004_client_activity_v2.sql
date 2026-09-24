-- CLASS: A
-- TABLE: client_activity_v2 (tribe-os) — new view (SECURITY INVOKER)
--
-- T-OS1 Step 1: Unified activity view. One row per activity event,
-- unioning client_attendance (where attended = true) and client_visits.
-- Everything new reads from this view so retention scoring sees both
-- Tribe sessions and external visits.
--
-- SECURITY INVOKER: the view inherits the caller's RLS context, so
-- each underlying table's policies apply. No separate RLS needed.

CREATE OR REPLACE VIEW public.client_activity_v2
WITH (security_invoker = true)
AS
  SELECT
    ca.id,
    ca.gym_id,
    ca.client_id,
    ca.attended_at AS activity_at,
    'tribe_session' AS source,
    NULL::text AS class_name,
    NULL::text AS coach_name,
    ca.session_id,
    NULL::uuid AS import_id,
    ca.created_at
  FROM public.client_attendance ca
  WHERE ca.attended = true

  UNION ALL

  SELECT
    cv.id,
    cv.gym_id,
    cv.client_id,
    cv.visited_at AS activity_at,
    cv.source,
    cv.class_name,
    cv.coach_name,
    NULL::uuid AS session_id,
    cv.import_id,
    cv.created_at
  FROM public.client_visits cv;

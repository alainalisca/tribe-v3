-- Migration 076 — TrainingPartner write trigger
--
-- Populates the community graph automatically. Every time a client
-- attendance row transitions to attended = true, we find all OTHER
-- clients who already attended the same session and upsert a
-- training_partners edge for each pair.
--
-- The community graph is the moat (see AGENTIC_FEATURES_STRATEGY.md):
-- members with 3+ training partners retain ~2.7× longer than
-- isolated members. Once this trigger is live, every attendance write
-- builds the graph automatically — no batch reconciliation needed.
--
-- Design notes:
--
-- Fired AFTER INSERT or AFTER UPDATE OF attended on client_attendance.
-- The WHEN clause filters to two cases:
--   - INSERT where NEW.attended IS TRUE (new attendance row marked attended)
--   - UPDATE where attended flips FALSE → TRUE (a corrected attendance)
-- We do not fire on UPDATEs that keep attended at TRUE (avoids
-- double-counting when payment fields get toggled).
--
-- Un-attending (TRUE → FALSE): NOT handled. The historical edge
-- stays in place. Manual attendance corrections are rare; a future
-- migration can add the inverse path if it becomes necessary.
--
-- last_30_day_sessions: NOT incremented here. That field needs to
-- decay as sessions age out of the 30-day window, which only a
-- nightly batch can compute correctly. The trigger only updates
-- shared_sessions (lifetime) + last_shared_at.
--
-- Cross-gym safety: both clients must belong to the same gym.
-- Attendance rows in a legacy (instructor-tenant) gym are skipped —
-- training_partners requires a gym_id, and the dual-path migration
-- (070) backfilled all but a handful of stragglers.

CREATE OR REPLACE FUNCTION public.upsert_training_partners_on_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id uuid;
  v_other_client_id uuid;
  v_member_a uuid;
  v_member_b uuid;
BEGIN
  -- The trigger's WHEN clause already filtered to "attended=true"
  -- cases. Get the gym id from this client's row.
  SELECT gym_id INTO v_gym_id
    FROM public.clients
    WHERE id = NEW.client_id;

  -- Skip legacy-tenant clients (gym_id NULL). The community-graph
  -- only makes sense in the gym tenant.
  IF v_gym_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Iterate over every OTHER attended client at this session.
  FOR v_other_client_id IN
    SELECT ca.client_id
    FROM public.client_attendance ca
    JOIN public.clients c ON c.id = ca.client_id
    WHERE ca.session_id = NEW.session_id
      AND ca.client_id <> NEW.client_id
      AND ca.attended = true
      AND c.gym_id = v_gym_id  -- cross-gym sessions exist; only pair within-gym
  LOOP
    -- Canonical order: member_a_id < member_b_id (enforced by CHECK
    -- constraint on training_partners).
    IF NEW.client_id < v_other_client_id THEN
      v_member_a := NEW.client_id;
      v_member_b := v_other_client_id;
    ELSE
      v_member_a := v_other_client_id;
      v_member_b := NEW.client_id;
    END IF;

    INSERT INTO public.training_partners (
      gym_id,
      member_a_id,
      member_b_id,
      shared_sessions,
      last_30_day_sessions,
      first_shared_at,
      last_shared_at
    )
    VALUES (
      v_gym_id,
      v_member_a,
      v_member_b,
      1,
      0,  -- recomputed by the nightly batch
      now(),
      now()
    )
    ON CONFLICT (member_a_id, member_b_id)
    DO UPDATE SET
      shared_sessions = public.training_partners.shared_sessions + 1,
      last_shared_at = now(),
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_training_partners_on_attendance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_training_partners_on_attendance() TO authenticated;

-- Two separate triggers because the WHEN predicate differs (INSERT
-- can't reference OLD; UPDATE can). Keeps the function body simple.

DROP TRIGGER IF EXISTS training_partners_on_attendance_insert ON public.client_attendance;
CREATE TRIGGER training_partners_on_attendance_insert
  AFTER INSERT ON public.client_attendance
  FOR EACH ROW
  WHEN (NEW.attended IS TRUE)
  EXECUTE FUNCTION public.upsert_training_partners_on_attendance();

DROP TRIGGER IF EXISTS training_partners_on_attendance_update ON public.client_attendance;
CREATE TRIGGER training_partners_on_attendance_update
  AFTER UPDATE OF attended ON public.client_attendance
  FOR EACH ROW
  WHEN (NEW.attended IS TRUE AND (OLD.attended IS DISTINCT FROM TRUE))
  EXECUTE FUNCTION public.upsert_training_partners_on_attendance();

COMMENT ON FUNCTION public.upsert_training_partners_on_attendance() IS
  'Fired by triggers on client_attendance. Upserts training_partners edges for every pair of clients who attended the same session. shared_sessions += 1 + last_shared_at = now(); last_30_day_sessions and the score fields are left to the nightly batch job.';

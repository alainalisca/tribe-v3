-- 155_door_guest_payment_not_required.sql
-- Make door-added guests carry payment_status = 'not_required', so no
-- payment badge implies Tribe is waiting on money for someone the host settles
-- with in person (Tribe is never in the flow of funds for these).
--
-- WHY AN UPDATE AFTER THE INSERT, NOT A VALUE IN THE INSERT:
-- session_participants has a BEFORE INSERT trigger (on_participant_join_set_payment
-- -> set_payment_status_on_join) whose body is unconditional for paid sessions:
--     IF session_is_paid = true THEN NEW.payment_status := 'pending'; END IF;
-- It overwrites whatever the INSERT specified, so setting payment_status inside
-- host_add_session_guest's INSERT would be silently discarded on paid sessions.
-- The trigger is BEFORE INSERT ONLY, so a follow-up UPDATE in the same function,
-- after the row exists, sticks. That is the shape below. DO NOT collapse this back
-- into the INSERT: it will look like it works on free sessions and silently fail
-- on paid ones.
--
-- WHY NOT TOUCH THE TRIGGER: it is correct for its purpose. An athlete joining a
-- paid session genuinely owes money, and join_session_as_guest also creates guests
-- on paid sessions (the self-serve door) who owe money too, so skipping all guest
-- rows in the trigger would be wrong. The trigger also cannot distinguish an
-- explicit 'not_required' from the column default 'not_required' (both arrive
-- identically as NEW.payment_status), so it could not special-case us safely.
-- Scoping the exception to THIS function, which is the only place a host adds a
-- walk-in they are settling in person, is the correct place for it.
--
-- BODY SOURCE: reproduced from migration 153 (applied verbatim to production and
-- verified by its rehearsal plus the migration-state verifier). Only the
-- post-insert UPDATE and its comment are added; everything else is byte-for-byte
-- 153. If pg_get_functiondef('public.host_add_session_guest'::regprocedure) shows
-- any drift from this, reconcile before applying.
--
-- CHECK constraint on session_participants.payment_status allows
-- (not_required, pending, confirmed, refunded), so 'not_required' is in-set and no
-- constraint change is needed. No backfill here (the one existing pending door
-- guest is corrected by a separate one-row UPDATE, reported outside this file).

CREATE OR REPLACE FUNCTION public.host_add_session_guest(
  p_session_id uuid,
  p_guest_name text,
  p_guest_phone text DEFAULT NULL,
  p_guest_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_status text;
  v_participant_id uuid;
BEGIN
  -- Reject an empty or whitespace-only name (the one required field).
  IF COALESCE(btrim(p_guest_name), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'guest_name_required');
  END IF;

  -- Lock the session and read the authorization inputs in the same SELECT.
  SELECT creator_id, status INTO v_creator, v_status
    FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  -- AUTHORIZATION: the caller must be THIS session's creator, or an app admin.
  -- Fails closed for anon (auth.uid() IS NULL). No token path and no user_id
  -- parameter, so this cannot be used against another person's account.
  IF (auth.uid() IS NULL OR v_creator IS DISTINCT FROM auth.uid()) AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_cancelled');
  END IF;

  -- CAPACITY: deliberately NOT checked. Unlike join_session_as_guest (anon,
  -- hard-blocks at max_participants), the host owns their physical room, so a
  -- walk-in past max is allowed here. The UI warns; the DB does not block.

  -- Door check-in is always CONFIRMED. The host is adding someone physically
  -- present, so the join_policy pending-derivation (curated / paid) does not
  -- apply, and confirmed-on-the-roster is the attendance signal.
  INSERT INTO session_participants (session_id, user_id, is_guest, guest_name, guest_phone, guest_email, status)
    VALUES (
      p_session_id,
      NULL,
      true,
      btrim(p_guest_name),
      NULLIF(btrim(COALESCE(p_guest_phone, '')), ''),
      NULLIF(btrim(COALESCE(p_guest_email, '')), ''),
      'confirmed'
    )
    RETURNING id INTO v_participant_id;

  -- Insert-then-update, NOT a value in the INSERT above. The BEFORE INSERT trigger
  -- set_payment_status_on_join forces payment_status = 'pending' on paid sessions
  -- and would discard any value the INSERT set. The trigger is BEFORE INSERT only,
  -- so this UPDATE on the now-existing row sticks. Door guests are settled in
  -- person and never owe Tribe, so their row must read not_required and show no
  -- payment badge. DO NOT move this into the INSERT (see the migration header).
  UPDATE session_participants
     SET payment_status = 'not_required'
   WHERE id = v_participant_id;

  -- Recompute confirmed count, identical idiom to join_session / join_session_as_guest.
  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id, 'status', 'confirmed');
END $$;

-- Grants persist across CREATE OR REPLACE; re-assert to be explicit (authenticated
-- only, revoked from anon and public), matching migration 153.
REVOKE ALL ON FUNCTION public.host_add_session_guest(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_add_session_guest(uuid, text, text, text) TO authenticated;

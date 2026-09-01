-- 153_host_door_checkin.sql
-- Host door check-in: let a session's creator build the attendance roster at the
-- door by adding walk-in guests to session_participants, one name at a time.
-- Free (not Tribe.OS, not premium). Adds two creator-scoped SECURITY DEFINER
-- RPCs; touches nothing else.
--
-- WHY THIS DOES NOT REOPEN THE T-SEC1 HOLE
-- The hole T-SEC1 closed (migration 119) was in join_session: a SECURITY DEFINER
-- RPC that trusted a caller-supplied p_user_id, so any caller could insert a
-- session_participants row for an ARBITRARY REAL ACCOUNT (impersonation / forced
-- join). host_add_session_guest is strictly narrower on both axes that mattered:
--   1. It has NO user_id parameter at all and always writes user_id = NULL. It
--      can only ever create account-less guest rows, so it cannot attach anyone
--      to a real account or impersonate a user.
--   2. It authorizes ONLY on the caller being THIS session's creator (or an app
--      admin), read under a row lock. It fails closed when auth.uid() is null.
-- A non-host therefore cannot add people to someone else's session, and no one
-- can touch a real account through it.
--
-- CONFIRMED DECISIONS
--   * Capacity: NOT enforced. join_session_as_guest hard-blocks at
--     max_participants, but that path is anon and self-service. This path is
--     creator-scoped: the host is the authority on their own physical room, so a
--     walk-in past max is allowed (the UI warns; the DB does not block). Same
--     overflow posture as accept_waitlist_offer's reserved seat. The divergence
--     is deliberate and is called out again at the insert below.
--   * Guest attendance: a door-added row lands status = 'confirmed', and
--     confirmed-on-the-roster IS the attendance signal. session_attendance is a
--     user_id-keyed table that cannot represent guests; it is intentionally NOT
--     touched in this pass.
--   * Admin branch: authorization includes public.is_app_admin() alongside the
--     creator check, matching session_payment_roster (128) and migration 152.
--   * Account holders: someone who actually has a Tribe account and is added at
--     the door becomes a GUEST row with no user_id link. Accepted for now: they
--     get no streak/history credit and no self-service leave. Linking accounts is
--     a separate, later path.
--
-- DELETE-POLICY FINDING (motivates host_remove_session_guest below)
-- There is NO creator-scoped DELETE policy for guest rows on session_participants.
-- The only DELETE policy touching guests is "Allow guests to delete their own
-- participation" USING (is_guest = true AND user_id IS NULL [AND
-- check_guest_identity()]), which is permissive and NOT creator-scoped (it lets
-- any role holding the table DELETE privilege remove any guest row; its
-- "verification" was meant to be client-side). Separately, the app's kick helper
-- deleteParticipantBySessionAndUser filters on user_id equality, so it can never
-- match a guest row (user_id IS NULL) at all. So the host has no properly-scoped,
-- guest-capable removal today. host_remove_session_guest supplies one: a
-- creator/admin-scoped, guest-only DELETE, matching the "writes go through a
-- definer RPC" posture of gate 3 (migration 121).

-- ---------------------------------------------------------------------------
-- 1. host_add_session_guest — the door-add primitive
-- ---------------------------------------------------------------------------
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

  -- Recompute confirmed count, identical idiom to join_session / join_session_as_guest.
  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id, 'status', 'confirmed');
END $$;

-- Authenticated only. Supabase default-grants EXECUTE to anon on new functions,
-- so revoke it explicitly (the T-SEC3 lesson). A door host is logged in.
REVOKE ALL ON FUNCTION public.host_add_session_guest(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_add_session_guest(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. host_remove_session_guest — creator-scoped, guest-only removal
-- ---------------------------------------------------------------------------
-- Undo for an accidental door add. Only a GUEST row (user_id IS NULL) of THIS
-- session may be removed here; kicking a registered athlete stays on the existing
-- kick path. Creator/admin scoped, same as the add.
CREATE OR REPLACE FUNCTION public.host_remove_session_guest(
  p_session_id uuid,
  p_participant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_deleted int;
BEGIN
  SELECT creator_id INTO v_creator FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF (auth.uid() IS NULL OR v_creator IS DISTINCT FROM auth.uid()) AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  -- Guest rows only (is_guest true AND user_id IS NULL): never removes a real
  -- user's participation through this door.
  DELETE FROM session_participants
   WHERE id = p_participant_id
     AND session_id = p_session_id
     AND is_guest = true
     AND user_id IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_removed');
  END IF;

  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'removed', v_deleted);
END $$;

REVOKE ALL ON FUNCTION public.host_remove_session_guest(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_remove_session_guest(uuid, uuid) TO authenticated;

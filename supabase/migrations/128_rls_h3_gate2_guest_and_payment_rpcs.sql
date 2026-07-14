-- 128_rls_h3_gate2_guest_and_payment_rpcs.sql
-- RLS-H3 GATE 2 (additive RPCs — nothing removed). The definer functions the code
-- reroute moves onto so that, once Gate 3 locks the raw table, the guest self-service
-- and host payment views keep working WITHOUT any client reading guest_token /
-- guest PII / other people's payment_status directly.
--
-- All SECURITY DEFINER (run as owner, bypass RLS). None RETURNS guest_token.

-- ── 1. guest_leave_session — verify the token SERVER-SIDE, never read it client-side.
-- Replaces the client-side anon DELETE (deleteGuestParticipant) that matched
-- guest_token via an x-guest-token header policy. The guest presents their own
-- token (held in localStorage since join); the function checks it and deletes only
-- the matching row. Returns whether a row was removed — never the token.
CREATE OR REPLACE FUNCTION public.guest_leave_session(p_session_id uuid, p_guest_token uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_deleted int;
BEGIN
  IF p_guest_token IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.session_participants
   WHERE session_id = p_session_id
     AND is_guest = true
     AND guest_token = p_guest_token;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;   -- 087 trigger recomputes sessions.current_participants
END;
$$;
REVOKE ALL ON FUNCTION public.guest_leave_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_leave_session(uuid, uuid) TO anon, authenticated;

-- ── 2. guest_participation_status — "did this browser's guest join?" WITHOUT
-- returning guest_token or any PII. The guest supplies their own phone/email
-- (from localStorage); the function returns only { has_joined, participant_id }.
-- Replaces fetchGuestParticipant, which selected guest_token/guest_phone/guest_email.
CREATE OR REPLACE FUNCTION public.guest_participation_status(
  p_session_id uuid,
  p_guest_phone text DEFAULT NULL,
  p_guest_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_guest_phone IS NULL AND p_guest_email IS NULL THEN
    RETURN jsonb_build_object('has_joined', false, 'participant_id', NULL);
  END IF;
  SELECT id INTO v_id
  FROM public.session_participants
  WHERE session_id = p_session_id
    AND is_guest = true
    AND ( (p_guest_phone IS NOT NULL AND guest_phone = p_guest_phone)
       OR (p_guest_email IS NOT NULL AND guest_email = p_guest_email) )
  LIMIT 1;
  RETURN jsonb_build_object('has_joined', v_id IS NOT NULL, 'participant_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.guest_participation_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participation_status(uuid, text, text) TO anon, authenticated;

-- ── 3. session_payment_roster — who paid, CREATOR/ADMIN ONLY.
-- payment_status must not sit in the shared roster (any participant could see who
-- paid). Only the session's creator (or an app admin) may call this.
CREATE OR REPLACE FUNCTION public.session_payment_roster(p_session_id uuid)
RETURNS TABLE (
  user_id uuid,
  is_guest boolean,
  guest_name text,
  payment_status text,
  paid_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.id = p_session_id AND s.creator_id = auth.uid()
      )
     AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'not authorized to view payment roster' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT sp.user_id, sp.is_guest, sp.guest_name, sp.payment_status, sp.paid_at
    FROM public.session_participants sp
    WHERE sp.session_id = p_session_id;
END;
$$;
REVOKE ALL ON FUNCTION public.session_payment_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_payment_roster(uuid) TO authenticated;

-- ── 4. Roster view: add user_preferred_language (not sensitive) so the pending-
-- participant readers can compose approve/decline notifications in the athlete's
-- language after moving off the raw table. CREATE OR REPLACE keeps 127's grants;
-- re-assert the anon revoke defensively (Supabase default-grants anon on new objs).
CREATE OR REPLACE VIEW public.session_participants_roster
WITH (security_invoker = false) AS
SELECT
  sp.id,
  sp.session_id,
  sp.user_id,
  sp.status,
  sp.is_guest,
  sp.guest_name,
  sp.joined_at,
  u.id                 AS user_profile_id,
  u.name               AS user_name,
  u.avatar_url         AS user_avatar_url,
  u.preferred_language AS user_preferred_language
FROM public.session_participants sp
LEFT JOIN public.users u ON u.id = sp.user_id;
REVOKE ALL ON public.session_participants_roster FROM PUBLIC, anon;
GRANT SELECT ON public.session_participants_roster TO authenticated;

-- ── 5. count_active_athletes — anon-safe aggregate for the landing "active this
-- week" stat (fetchActivityStats read session_participants directly, which anon
-- loses at Gate 3). Returns a single number; no rows, no identities.
CREATE OR REPLACE FUNCTION public.count_active_athletes(p_since timestamptz)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT count(DISTINCT user_id)::int
  FROM public.session_participants
  WHERE joined_at >= p_since AND user_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.count_active_athletes(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_active_athletes(timestamptz) TO anon, authenticated;

-- Migration 117 — T-SEC5 Batch 3 (additive)
--
-- Adds get_session_attendance(): the server-side attendance matcher for
-- SessionAttendanceSection (approved approach A). It lets the component stop
-- reading OTHER users' emails via a raw `user:users(email)` embed — the leak the
-- T-SEC5 email revoke closes.
--
-- ADDITIVE: creates one function, revokes nothing on public.users. Safe to apply
-- before the email revoke, reversible by dropping the function.
--
-- The match runs INSIDE the DB (owner-executed), so raw participant emails never
-- reach the client. Email is returned ONLY for participants with NO client match
-- (so the "Add as client" prefill still works), and only to the verified host of
-- that specific session — never a bulk email list.
--
-- Authorization is checked INSIDE the function and FAILS CLOSED before any row is
-- returned: the caller must be authenticated, must be THIS session's creator, and
-- must be Tribe.OS premium (mirrors isTribeOSPremiumActive exactly).

CREATE OR REPLACE FUNCTION public.get_session_attendance(p_session_id uuid)
RETURNS TABLE(user_id uuid, name text, avatar_url text, matched_client_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
BEGIN
  -- (a) authenticated
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  -- (b) caller is THIS session's creator
  SELECT creator_id INTO v_creator FROM public.sessions WHERE id = p_session_id;
  IF v_creator IS NULL OR v_creator <> v_caller THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  -- (c) caller is Tribe.OS premium (tier set AND status in null/active/trialing)
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_caller
      AND u.tribe_os_tier IS NOT NULL
      AND (u.tribe_os_status IS NULL OR u.tribe_os_status IN ('active', 'trialing'))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  -- Only now: the confirmed participants, matched to the caller's visible client
  -- roster server-side. Client visibility replicates the migration-070 dual-path
  -- RLS: own (instructor_user_id) OR a gym the caller coaches. archived clients
  -- are excluded, matching the active roster the UI shows.
  RETURN QUERY
  SELECT
    p.user_id,
    pu.name,
    pu.avatar_url,
    mc.id AS matched_client_id,
    -- email ONLY when there is no client match (for the Add-as-client prefill);
    -- matched participants' emails never leave the DB.
    CASE WHEN mc.id IS NULL THEN pu.email ELSE NULL END AS email
  FROM public.session_participants p
  LEFT JOIN public.users pu ON pu.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT c.id
    FROM public.clients c
    WHERE pu.email IS NOT NULL
      AND lower(trim(c.email)) = lower(trim(pu.email))
      AND c.archived = false
      AND (
        c.instructor_user_id = v_caller
        OR (c.gym_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.gym_coaches gc
          WHERE gc.gym_id = c.gym_id AND gc.user_id = v_caller
        ))
      )
    ORDER BY c.created_at
    LIMIT 1
  ) mc ON true
  WHERE p.session_id = p_session_id
    AND p.status = 'confirmed';
END $$;

COMMENT ON FUNCTION public.get_session_attendance(uuid) IS
  'T-SEC5: server-side attendance matcher. Verifies caller = session creator AND '
  'Tribe.OS premium (fail closed), matches confirmed participants to the caller''s '
  'client roster in-DB, and returns a participant email ONLY when unmatched (for '
  'Add-as-client). Raw participant emails never leave the DB.';

-- Supabase ALTER DEFAULT PRIVILEGES grants EXECUTE to anon DIRECTLY on new public
-- functions, so revoking from PUBLIC alone leaves anon able to call it (T-SEC3
-- lesson). Revoke anon explicitly; only authenticated (session creators) need it.
REVOKE ALL ON FUNCTION public.get_session_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_attendance(uuid) TO authenticated;

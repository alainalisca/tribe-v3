-- ============================================================================
-- 153_host_door_checkin_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 153's two RPCs verbatim, exercises them against LIVE data, returns a SINGLE
-- final result set, and ROLLS BACK. ZERO changes persist.
--
-- No RAISE NOTICE (the editor has no Notices panel): every scenario writes a row
-- into a temp table and the final SELECT renders them plus an ALL_CHECKS rollup.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- SIMULATING auth.uid(): identical technique to the 152 rehearsal. It sets the
-- request JWT claim GUCs with set_config(..., is_local => true) — the same GUCs
-- auth.uid() and is_app_admin() read. The RPCs are SECURITY DEFINER and the SQL
-- Editor runs as owner, so calling them works and their internal auth.uid()
-- reflects the GUC we set. Both request.jwt.claim.sub and request.jwt.claims are
-- set for version robustness. Real simulation, not a stub.
--
-- What it proves:
--   * creator_add_succeeds: the session creator can add a guest.
--   * added_row_confirmed_guest_null_user: the created row is is_guest = true,
--     user_id IS NULL, status = 'confirmed'.
--   * current_participants_increments: sessions.current_participants goes up by 1.
--   * past_max_succeeds: with max_participants forced to 0, the add still succeeds
--     (capacity is not enforced), rather than erroring.
--   * non_creator_cannot_add: a non-creator, non-admin gets 'forbidden' and adds
--     no row.
--   * empty_name_rejected: a whitespace-only name returns 'guest_name_required'.
--   * anon_no_execute_grant / authenticated_has_execute_grant: grants on BOTH RPCs.
--   * non_creator_cannot_remove / creator_can_remove: the remove RPC is
--     creator-scoped; the creator's removal restores the count.
--
-- FIXTURE DEPENDENCY: needs any one session (for its creator) plus one unrelated
-- non-admin user. Both exist in prod. Missing fixtures -> fixture_found = false
-- and ALL_CHECKS fails (no faked pass). max_participants is mutated to 0 inside
-- the transaction to force the overflow case; the ROLLBACK reverts it.
-- ============================================================================

BEGIN;

-- ── MIGRATION 153 BODY (verbatim) ───────────────────────────────────────────
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
  IF COALESCE(btrim(p_guest_name), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'guest_name_required');
  END IF;

  SELECT creator_id, status INTO v_creator, v_status
    FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF (auth.uid() IS NULL OR v_creator IS DISTINCT FROM auth.uid()) AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_cancelled');
  END IF;

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

  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id, 'status', 'confirmed');
END $$;

REVOKE ALL ON FUNCTION public.host_add_session_guest(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_add_session_guest(uuid, text, text, text) TO authenticated;

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

-- ── VERIFICATION ────────────────────────────────────────────────────────────
CREATE TEMP TABLE rehearsal_results (check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

DO $$
DECLARE
  v_s uuid; v_c uuid; v_x uuid;
  v_before int; v_cp int; v_cnt int;
  v_pid uuid;
  v_res jsonb;
  v_is_guest boolean; v_user_id uuid; v_row_status text;
BEGIN
  -- Fixture: any session S and its creator C.
  SELECT id, creator_id INTO v_s, v_c FROM public.sessions ORDER BY created_at DESC LIMIT 1;
  -- Stranger X: a non-admin user who is not the creator.
  SELECT id INTO v_x FROM public.users
   WHERE COALESCE(is_admin, false) = false AND id <> v_c
   LIMIT 1;

  INSERT INTO rehearsal_results VALUES (
    'fixture_found',
    format('S=%s C=%s X=%s', v_s, v_c, v_x),
    'S, C, X all present',
    v_s IS NOT NULL AND v_c IS NOT NULL AND v_x IS NOT NULL
  );

  IF v_s IS NULL OR v_c IS NULL OR v_x IS NULL THEN
    RETURN; -- ALL_CHECKS will fail on fixture_found; do not fabricate the rest.
  END IF;

  -- Confirmed count before any add.
  SELECT count(*) INTO v_before FROM public.session_participants
   WHERE session_id = v_s AND status = 'confirmed';

  -- Force the overflow condition: max_participants = 0 (reverted at ROLLBACK).
  UPDATE public.sessions SET max_participants = 0 WHERE id = v_s;

  -- Creator adds a guest (also the past-max case, since max is now 0).
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  v_res := public.host_add_session_guest(v_s, 'Door Walkin 1', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;

  INSERT INTO rehearsal_results VALUES ('creator_add_succeeds', v_res->>'success', 'true', (v_res->>'success') = 'true');
  INSERT INTO rehearsal_results VALUES ('past_max_succeeds', v_res->>'success', 'true (max forced to 0)', (v_res->>'success') = 'true');

  -- Inspect the created row.
  SELECT is_guest, user_id, status INTO v_is_guest, v_user_id, v_row_status
   FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'added_row_confirmed_guest_null_user',
    format('is_guest=%s user_id=%s status=%s', v_is_guest, v_user_id, v_row_status),
    'is_guest=true user_id=NULL status=confirmed',
    v_is_guest = true AND v_user_id IS NULL AND v_row_status = 'confirmed'
  );

  -- current_participants incremented by 1.
  SELECT current_participants INTO v_cp FROM public.sessions WHERE id = v_s;
  INSERT INTO rehearsal_results VALUES (
    'current_participants_increments', v_cp::text, (v_before + 1)::text, v_cp = v_before + 1
  );

  -- Non-creator, non-admin cannot add.
  PERFORM set_config('request.jwt.claim.sub', v_x::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_x::text)::text, true);
  v_res := public.host_add_session_guest(v_s, 'Should Not Land', NULL, NULL);
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE session_id = v_s AND status = 'confirmed';
  INSERT INTO rehearsal_results VALUES (
    'non_creator_cannot_add',
    format('error=%s confirmed_now=%s', v_res->>'error', v_cnt),
    'error=forbidden and count unchanged',
    (v_res->>'error') = 'forbidden' AND v_cnt = v_before + 1
  );

  -- Empty / whitespace name rejected (as creator, to isolate the name check).
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  v_res := public.host_add_session_guest(v_s, '   ', NULL, NULL);
  INSERT INTO rehearsal_results VALUES (
    'empty_name_rejected', v_res->>'error', 'guest_name_required', (v_res->>'error') = 'guest_name_required'
  );

  -- Non-creator cannot remove the guest row.
  PERFORM set_config('request.jwt.claim.sub', v_x::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_x::text)::text, true);
  v_res := public.host_remove_session_guest(v_s, v_pid);
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'non_creator_cannot_remove',
    format('error=%s row_still_present=%s', v_res->>'error', v_cnt),
    'error=forbidden and row still present (1)',
    (v_res->>'error') = 'forbidden' AND v_cnt = 1
  );

  -- Creator can remove; count returns to baseline.
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  v_res := public.host_remove_session_guest(v_s, v_pid);
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  SELECT current_participants INTO v_cp FROM public.sessions WHERE id = v_s;
  INSERT INTO rehearsal_results VALUES (
    'creator_can_remove',
    format('success=%s row_gone=%s current_participants=%s', v_res->>'success', (v_cnt = 0), v_cp),
    'success=true, row gone, count back to baseline',
    (v_res->>'success') = 'true' AND v_cnt = 0 AND v_cp = v_before
  );

  -- Clear the simulated identity.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Grants (role-based, not auth.uid()): anon has no EXECUTE, authenticated does, on BOTH RPCs.
INSERT INTO rehearsal_results
SELECT 'anon_no_execute_grant',
       (has_function_privilege('anon', 'public.host_add_session_guest(uuid, text, text, text)', 'EXECUTE') OR
        has_function_privilege('anon', 'public.host_remove_session_guest(uuid, uuid)', 'EXECUTE'))::text,
       'false',
       has_function_privilege('anon', 'public.host_add_session_guest(uuid, text, text, text)', 'EXECUTE') = false
       AND has_function_privilege('anon', 'public.host_remove_session_guest(uuid, uuid)', 'EXECUTE') = false;

INSERT INTO rehearsal_results
SELECT 'authenticated_has_execute_grant',
       (has_function_privilege('authenticated', 'public.host_add_session_guest(uuid, text, text, text)', 'EXECUTE') AND
        has_function_privilege('authenticated', 'public.host_remove_session_guest(uuid, uuid)', 'EXECUTE'))::text,
       'true',
       has_function_privilege('authenticated', 'public.host_add_session_guest(uuid, text, text, text)', 'EXECUTE') = true
       AND has_function_privilege('authenticated', 'public.host_remove_session_guest(uuid, uuid)', 'EXECUTE') = true;

-- ── SINGLE FINAL RESULT SET ─────────────────────────────────────────────────
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord, check_name, actual, expected, pass FROM rehearsal_results
  UNION ALL
  SELECT 1 AS ord, 'ALL_CHECKS' AS check_name, NULL AS actual, NULL AS expected, bool_and(pass) AS pass FROM rehearsal_results
) q
ORDER BY ord, check_name;

ROLLBACK;

-- ============================================================================
-- 154_close_guest_delete_policy_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Sets up the post-153 world
-- (recreates 153's host RPCs; guest_leave_session from 128 is assumed live and is
-- precheck-verified), applies 154's drops verbatim, proves the surviving paths
-- still work AND the hole is closed, returns a SINGLE final result set, and ROLLS
-- BACK. ZERO changes persist.
--
-- No RAISE NOTICE. Columns: check_name | actual | expected | pass.
--
-- SIMULATING auth.uid(): set_config on the request JWT claim GUCs. The direct-
-- delete proofs additionally SET LOCAL ROLE authenticated so real RLS applies.
-- auth.uid() reads the GUC regardless of the current role, so under
-- (role authenticated + GUC = some uid) the DELETE policies evaluate for that uid.
--
-- What it proves after the change:
--   * both_guest_delete_policies_gone
--   * sp_delete_by_instructor_still_present
--   * non_delete_policies_unchanged (SELECT + UPDATE sets byte-identical)
--   * check_guest_identity_dropped
--   * guest_leave_valid_token_works / wrong_token_cannot_delete
--   * host_remove_works_for_creator
--   * creator_direct_delete_allowed (sp_delete_by_instructor still lets a creator
--     directly delete a guest row)
--   * non_creator_direct_delete_denied (a token-less DELETE as authenticated by a
--     stranger removes ZERO rows; the guest row survives)
--   * real_account_self_unjoin_works (a real user deletes their own row as
--     authenticated via the self-delete policy)
--
-- FIXTURE DEPENDENCY: a non-cancelled session (for its creator), a non-admin
-- stranger, one existing real-user participant row (any session), and
-- guest_leave_session present (128). Missing -> guard checks fail, ALL_CHECKS
-- fails, nothing faked. Everything rolls back.
-- ============================================================================

BEGIN;

-- ── PRE-REQ: migration 153 host RPCs (so the removal proofs are self-contained). ──
CREATE OR REPLACE FUNCTION public.host_add_session_guest(
  p_session_id uuid, p_guest_name text, p_guest_phone text DEFAULT NULL, p_guest_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_creator uuid; v_status text; v_participant_id uuid;
BEGIN
  IF COALESCE(btrim(p_guest_name), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'guest_name_required');
  END IF;
  SELECT creator_id, status INTO v_creator, v_status FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
  IF (auth.uid() IS NULL OR v_creator IS DISTINCT FROM auth.uid()) AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_status = 'cancelled' THEN RETURN jsonb_build_object('success', false, 'error', 'session_cancelled'); END IF;
  INSERT INTO session_participants (session_id, user_id, is_guest, guest_name, guest_phone, guest_email, status)
    VALUES (p_session_id, NULL, true, btrim(p_guest_name),
            NULLIF(btrim(COALESCE(p_guest_phone, '')), ''), NULLIF(btrim(COALESCE(p_guest_email, '')), ''), 'confirmed')
    RETURNING id INTO v_participant_id;
  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id, 'status', 'confirmed');
END $$;
REVOKE ALL ON FUNCTION public.host_add_session_guest(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_add_session_guest(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_remove_session_guest(
  p_session_id uuid, p_participant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_creator uuid; v_deleted int;
BEGIN
  SELECT creator_id INTO v_creator FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
  IF (auth.uid() IS NULL OR v_creator IS DISTINCT FROM auth.uid()) AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  DELETE FROM session_participants
   WHERE id = p_participant_id AND session_id = p_session_id AND is_guest = true AND user_id IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'not_removed'); END IF;
  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'removed', v_deleted);
END $$;
REVOKE ALL ON FUNCTION public.host_remove_session_guest(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_remove_session_guest(uuid, uuid) TO authenticated;

-- Snapshot ALL policies BEFORE the 154 drop.
CREATE TEMP TABLE policy_before ON COMMIT DROP AS
  SELECT policyname, cmd FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'session_participants';

-- ── MIGRATION 154 BODY (verbatim) ───────────────────────────────────────────
DROP POLICY IF EXISTS "Guests can leave sessions" ON public.session_participants;
DROP POLICY IF EXISTS "Allow guests to delete their own participation" ON public.session_participants;
DROP FUNCTION IF EXISTS public.check_guest_identity();
DROP FUNCTION IF EXISTS public.check_guest_identity(text, text);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
CREATE TEMP TABLE rehearsal_results (check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;
CREATE TEMP TABLE t_ctx (s uuid, c uuid, x uuid, g_creator_del uuid, g_stranger_del uuid, r1_id uuid, u uuid) ON COMMIT DROP;

DO $$
DECLARE
  v_s uuid; v_c uuid; v_x uuid; v_r1 uuid; v_u uuid;
  v_res jsonb; v_pid uuid; v_token uuid; v_cnt int; v_bool boolean;
  v_g_creator uuid; v_g_stranger uuid;
  v_leave_exists boolean;
BEGIN
  v_leave_exists := to_regprocedure('public.guest_leave_session(uuid, uuid)') IS NOT NULL;
  INSERT INTO rehearsal_results VALUES (
    'guest_leave_session_present', v_leave_exists::text, 'true (migration 128 applied)', v_leave_exists);

  SELECT id, creator_id INTO v_s, v_c FROM public.sessions
   WHERE COALESCE(status, '') <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_x FROM public.users WHERE COALESCE(is_admin, false) = false AND id <> v_c LIMIT 1;
  SELECT id, user_id INTO v_r1, v_u FROM public.session_participants WHERE user_id IS NOT NULL LIMIT 1;

  INSERT INTO rehearsal_results VALUES (
    'fixture_found',
    format('S=%s C=%s X=%s R1=%s U=%s', v_s, v_c, v_x, v_r1, v_u),
    'session, creator, stranger, real participant all present',
    v_s IS NOT NULL AND v_c IS NOT NULL AND v_x IS NOT NULL AND v_r1 IS NOT NULL AND v_u IS NOT NULL AND v_leave_exists
  );
  IF v_s IS NULL OR v_c IS NULL OR v_x IS NULL OR v_r1 IS NULL OR v_u IS NULL OR NOT v_leave_exists THEN
    RETURN;
  END IF;

  -- Act as the creator for the RPC-based scenarios.
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);

  -- guest_leave_session with a VALID token still works.
  v_res := public.host_add_session_guest(v_s, 'Leave Me', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  SELECT guest_token INTO v_token FROM public.session_participants WHERE id = v_pid;
  v_bool := public.guest_leave_session(v_s, v_token);
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'guest_leave_valid_token_works', format('rpc=%s row_gone=%s', v_bool, (v_cnt = 0)),
    'true and row removed', v_bool = true AND v_cnt = 0);

  -- Wrong token deletes nothing.
  v_res := public.host_add_session_guest(v_s, 'Wrong Token Keep', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  v_bool := public.guest_leave_session(v_s, gen_random_uuid());
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'wrong_token_cannot_delete', format('rpc=%s row_present=%s', v_bool, v_cnt),
    'false and row still present (1)', v_bool = false AND v_cnt = 1);
  -- Clean it up via the RPC so it does not pollute later counts.
  v_res := public.host_remove_session_guest(v_s, v_pid);

  -- host_remove_session_guest still works for the creator.
  v_res := public.host_add_session_guest(v_s, 'Host Remove Me', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  v_res := public.host_remove_session_guest(v_s, v_pid);
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'host_remove_works_for_creator', format('success=%s row_gone=%s', v_res->>'success', (v_cnt = 0)),
    'true and row removed', (v_res->>'success') = 'true' AND v_cnt = 0);

  -- Create two guest rows for the direct-delete role tests below.
  v_res := public.host_add_session_guest(v_s, 'Creator Deletes Me', NULL, NULL);
  v_g_creator := (v_res->>'participant_id')::uuid;
  v_res := public.host_add_session_guest(v_s, 'Stranger Cannot Delete Me', NULL, NULL);
  v_g_stranger := (v_res->>'participant_id')::uuid;

  INSERT INTO t_ctx VALUES (v_s, v_c, v_x, v_g_creator, v_g_stranger, v_r1, v_u);

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- sp_delete_by_instructor: the creator can DIRECTLY delete a guest row (role
-- authenticated so RLS applies; auth.uid() = creator).
DO $$
DECLARE v_s uuid; v_c uuid; v_pid uuid; v_cnt int;
BEGIN
  SELECT s, c, g_creator_del INTO v_s, v_c, v_pid FROM t_ctx;
  IF v_pid IS NULL THEN
    INSERT INTO rehearsal_results VALUES ('creator_direct_delete_allowed', 'no fixture', 'skipped', false); RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.session_participants WHERE id = v_pid;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE; v_cnt := -1;
  END;
  INSERT INTO rehearsal_results VALUES (
    'creator_direct_delete_allowed', format('rows_deleted=%s', v_cnt),
    '1 (sp_delete_by_instructor)', v_cnt = 1);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- A stranger (non-creator, not the row owner) cannot delete a guest row now that
-- both guest policies are gone. Direct DELETE as authenticated removes ZERO rows.
DO $$
DECLARE v_x uuid; v_pid uuid; v_cnt int;
BEGIN
  SELECT x, g_stranger_del INTO v_x, v_pid FROM t_ctx;
  IF v_pid IS NULL THEN
    INSERT INTO rehearsal_results VALUES ('non_creator_direct_delete_denied', 'no fixture', 'skipped', false); RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_x::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_x::text)::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.session_participants WHERE id = v_pid;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RESET ROLE;
    INSERT INTO rehearsal_results VALUES (
      'non_creator_direct_delete_denied', format('rows_deleted=%s', v_cnt),
      '0 (no guest delete policy)', v_cnt = 0);
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    INSERT INTO rehearsal_results VALUES (
      'non_creator_direct_delete_denied', 'permission denied for table', 'denied', true);
  END;
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES ('guest_row_survived_stranger_delete', v_cnt::text, '1', v_cnt = 1);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Real-account self-unjoin still works: a real user deletes their own row as
-- authenticated via the self-delete policy (auth.uid() = user_id).
DO $$
DECLARE v_u uuid; v_r1 uuid; v_cnt int;
BEGIN
  SELECT u, r1_id INTO v_u, v_r1 FROM t_ctx;
  IF v_r1 IS NULL THEN
    INSERT INTO rehearsal_results VALUES ('real_account_self_unjoin_works', 'no fixture', 'skipped', false); RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u::text)::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.session_participants WHERE id = v_r1;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE; v_cnt := -1;
  END;
  INSERT INTO rehearsal_results VALUES (
    'real_account_self_unjoin_works', format('rows_deleted=%s', v_cnt),
    '1 (self-delete policy)', v_cnt = 1);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Structural checks.
INSERT INTO rehearsal_results
SELECT 'both_guest_delete_policies_gone',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants'
          AND policyname IN ('Guests can leave sessions', 'Allow guests to delete their own participation'))::text,
       '0',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants'
          AND policyname IN ('Guests can leave sessions', 'Allow guests to delete their own participation')) = 0;

INSERT INTO rehearsal_results
SELECT 'sp_delete_by_instructor_still_present',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants'
          AND policyname='sp_delete_by_instructor')::text,
       '1',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants'
          AND policyname='sp_delete_by_instructor') = 1;

INSERT INTO rehearsal_results
SELECT 'non_delete_policies_unchanged',
       (SELECT string_agg(policyname||':'||cmd, ',' ORDER BY policyname)
          FROM pg_policies WHERE schemaname='public' AND tablename='session_participants' AND cmd<>'DELETE'),
       (SELECT string_agg(policyname||':'||cmd, ',' ORDER BY policyname) FROM policy_before WHERE cmd<>'DELETE'),
       (SELECT string_agg(policyname||':'||cmd, ',' ORDER BY policyname)
          FROM pg_policies WHERE schemaname='public' AND tablename='session_participants' AND cmd<>'DELETE')
       IS NOT DISTINCT FROM
       (SELECT string_agg(policyname||':'||cmd, ',' ORDER BY policyname) FROM policy_before WHERE cmd<>'DELETE');

INSERT INTO rehearsal_results
SELECT 'check_guest_identity_dropped',
       COALESCE(to_regprocedure('public.check_guest_identity()')::text, 'gone'),
       'gone',
       to_regprocedure('public.check_guest_identity()') IS NULL;

-- ── SINGLE FINAL RESULT SET ─────────────────────────────────────────────────
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord, check_name, actual, expected, pass FROM rehearsal_results
  UNION ALL
  SELECT 1 AS ord, 'ALL_CHECKS' AS check_name, NULL AS actual, NULL AS expected, bool_and(pass) AS pass FROM rehearsal_results
) q
ORDER BY ord, check_name;

ROLLBACK;

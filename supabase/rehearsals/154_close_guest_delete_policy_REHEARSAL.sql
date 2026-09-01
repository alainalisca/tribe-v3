-- ============================================================================
-- 154_close_guest_delete_policy_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, sets up
-- the world that exists AFTER 153 ships (recreates 153's host RPCs; guest_leave_
-- session from 128 is assumed already live and is precheck-verified), applies
-- 154's drops verbatim, proves the surviving paths still work AND the hole is
-- closed, returns a SINGLE final result set, and ROLLS BACK. ZERO changes persist.
--
-- No RAISE NOTICE: every scenario writes a row into a temp table; the final SELECT
-- renders them plus an ALL_CHECKS rollup.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- SIMULATING auth.uid(): same technique as the 152/153 rehearsals (set_config on
-- the request JWT claim GUCs). The role-deny proof additionally uses SET LOCAL
-- ROLE authenticated so real RLS applies to a direct DELETE.
--
-- GROUND TRUTH before applying (run separately, this rehearsal does NOT need it):
--   -- live DELETE policy USING clause:
--   SELECT policyname, cmd, qual FROM pg_policies
--     WHERE schemaname='public' AND tablename='session_participants' AND cmd='DELETE';
--   -- live check_guest_identity bodies (both overloads):
--   SELECT oid::regprocedure, prosrc FROM pg_proc WHERE proname='check_guest_identity';
--
-- What it proves:
--   * permissive_delete_policy_gone: the named policy no longer exists.
--   * no_delete_policy_remains: session_participants has zero DELETE policies.
--   * non_delete_policies_unchanged: the SELECT/UPDATE policy set is byte-identical
--     before and after (the REVOKE did not disturb read/update paths).
--   * check_guest_identity_dropped: both function overloads are gone.
--   * guest_leave_valid_token_works: a guest with the correct guest_token is still
--     removed by guest_leave_session.
--   * wrong_token_cannot_delete: guest_leave_session with a wrong token deletes
--     nothing.
--   * authenticated_direct_delete_denied: a direct DELETE as role authenticated
--     removes 0 rows (RLS default-deny) or errors on privilege; the guest row
--     survives.
--   * host_remove_works_for_creator: host_remove_session_guest still removes a
--     guest for the session creator.
--
-- FIXTURE DEPENDENCY: needs any one non-cancelled session (for its creator) and
-- guest_leave_session present (migration 128). Missing -> the guard checks fail and
-- ALL_CHECKS fails; nothing is faked. All writes roll back.
-- ============================================================================

BEGIN;

-- ── PRE-REQ: migration 153 host RPCs (recreated so the removal proof is self-
--    contained; 153 ships before 154 in the same sequence). guest_leave_session
--    (128) is assumed live and precheck-verified below. ──────────────────────────
CREATE OR REPLACE FUNCTION public.host_add_session_guest(
  p_session_id uuid,
  p_guest_name text,
  p_guest_phone text DEFAULT NULL,
  p_guest_email text DEFAULT NULL
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
  p_session_id uuid,
  p_participant_id uuid
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

-- Snapshot ALL policies on session_participants BEFORE the 154 drop.
CREATE TEMP TABLE policy_before ON COMMIT DROP AS
  SELECT policyname, cmd FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'session_participants';

-- ── MIGRATION 154 BODY (verbatim) ───────────────────────────────────────────
DROP POLICY IF EXISTS "Allow guests to delete their own participation" ON public.session_participants;
DROP FUNCTION IF EXISTS public.check_guest_identity();
DROP FUNCTION IF EXISTS public.check_guest_identity(text, text);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
CREATE TEMP TABLE rehearsal_results (check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;
CREATE TEMP TABLE t_ctx (s uuid, c uuid, direct_del_pid uuid) ON COMMIT DROP;

DO $$
DECLARE
  v_s uuid; v_c uuid;
  v_res jsonb; v_pid uuid; v_token uuid; v_cnt int; v_bool boolean;
  v_leave_exists boolean;
BEGIN
  v_leave_exists := to_regprocedure('public.guest_leave_session(uuid, uuid)') IS NOT NULL;
  INSERT INTO rehearsal_results VALUES (
    'guest_leave_session_present', v_leave_exists::text, 'true (migration 128 applied)', v_leave_exists
  );

  SELECT id, creator_id INTO v_s, v_c
    FROM public.sessions
   WHERE COALESCE(status, '') <> 'cancelled'
   ORDER BY created_at DESC LIMIT 1;
  INSERT INTO rehearsal_results VALUES (
    'fixture_found', format('S=%s C=%s', v_s, v_c), 'S, C present', v_s IS NOT NULL AND v_c IS NOT NULL
  );
  IF v_s IS NULL OR v_c IS NULL OR NOT v_leave_exists THEN RETURN; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);

  -- (A) guest_leave_session with the VALID token still works.
  v_res := public.host_add_session_guest(v_s, 'Leave Me', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  SELECT guest_token INTO v_token FROM public.session_participants WHERE id = v_pid;
  v_bool := public.guest_leave_session(v_s, v_token);
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'guest_leave_valid_token_works',
    format('rpc=%s row_gone=%s', v_bool, (v_cnt = 0)),
    'true and row removed',
    v_bool = true AND v_cnt = 0
  );

  -- (B) A wrong token deletes nothing. Leave this row in place for the role test.
  v_res := public.host_add_session_guest(v_s, 'Keep Me', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  INSERT INTO t_ctx VALUES (v_s, v_c, v_pid);
  v_bool := public.guest_leave_session(v_s, gen_random_uuid());
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'wrong_token_cannot_delete',
    format('rpc=%s row_present=%s', v_bool, v_cnt),
    'false and row still present (1)',
    v_bool = false AND v_cnt = 1
  );

  -- (C) host_remove_session_guest still works for the creator.
  v_res := public.host_add_session_guest(v_s, 'Host Remove Me', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  v_res := public.host_remove_session_guest(v_s, v_pid);
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'host_remove_works_for_creator',
    format('success=%s row_gone=%s', v_res->>'success', (v_cnt = 0)),
    'true and row removed',
    (v_res->>'success') = 'true' AND v_cnt = 0
  );

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- (D) A token-less DIRECT delete as role authenticated is denied (RLS default-deny
-- now that there is no DELETE policy). Isolated so role handling is clean; catches
-- a missing table privilege as an equally-valid deny.
DO $$
DECLARE v_pid uuid; v_cnt int;
BEGIN
  SELECT direct_del_pid INTO v_pid FROM t_ctx;
  IF v_pid IS NULL THEN
    INSERT INTO rehearsal_results VALUES ('authenticated_direct_delete_denied', 'no fixture', 'skipped', false);
    RETURN;
  END IF;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.session_participants WHERE id = v_pid;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RESET ROLE;
    INSERT INTO rehearsal_results VALUES (
      'authenticated_direct_delete_denied', format('rows_deleted=%s', v_cnt),
      '0 (RLS default-deny, no DELETE policy)', v_cnt = 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    INSERT INTO rehearsal_results VALUES (
      'authenticated_direct_delete_denied', 'permission denied for table', 'denied (no table privilege)', true
    );
  END;
  SELECT count(*) INTO v_cnt FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES ('guest_row_survived_direct_delete', v_cnt::text, '1', v_cnt = 1);
END $$;

-- Structural checks.
INSERT INTO rehearsal_results
SELECT 'permissive_delete_policy_gone',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants'
          AND policyname='Allow guests to delete their own participation')::text,
       '0',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants'
          AND policyname='Allow guests to delete their own participation') = 0;

INSERT INTO rehearsal_results
SELECT 'no_delete_policy_remains',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants' AND cmd='DELETE')::text,
       '0',
       (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='session_participants' AND cmd='DELETE') = 0;

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
       COALESCE(to_regprocedure('public.check_guest_identity()')::text, 'gone') || '/' ||
       COALESCE(to_regprocedure('public.check_guest_identity(text, text)')::text, 'gone'),
       'gone/gone',
       to_regprocedure('public.check_guest_identity()') IS NULL
       AND to_regprocedure('public.check_guest_identity(text, text)') IS NULL;

-- ── SINGLE FINAL RESULT SET ─────────────────────────────────────────────────
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord, check_name, actual, expected, pass FROM rehearsal_results
  UNION ALL
  SELECT 1 AS ord, 'ALL_CHECKS' AS check_name, NULL AS actual, NULL AS expected, bool_and(pass) AS pass FROM rehearsal_results
) q
ORDER BY ord, check_name;

ROLLBACK;

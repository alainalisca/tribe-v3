-- ============================================================================
-- 155_door_guest_payment_not_required_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Applies 155's
-- host_add_session_guest verbatim, exercises the paid/free and self-serve paths
-- against LIVE data (relying on the production BEFORE INSERT trigger
-- set_payment_status_on_join and the existing join RPCs), returns a SINGLE final
-- result set, and ROLLS BACK. ZERO changes persist.
--
-- No RAISE NOTICE. Columns: check_name | actual | expected | pass.
--
-- SIMULATING auth.uid(): set_config on the request JWT claim GUCs (same as the
-- 152/153/154 rehearsals). host_add_session_guest and join_session are
-- SECURITY DEFINER and read auth.uid() from the GUC.
--
-- SETUP: a test session S (its real creator C) is mutated IN-TRANSACTION to be a
-- paid, open, active session so the trigger and the join RPCs take their paid
-- branches; check 4 flips it to free. The ROLLBACK reverts all of it.
--
-- What it proves:
--   * door_guest_paid_not_required: host_add on a PAID session lands not_required
--     (the trigger forces pending on insert; the function's follow-up UPDATE wins).
--   * door_guest_free_not_required: host_add on a FREE session lands not_required.
--   * self_serve_guest_paid_pending: join_session_as_guest on a PAID session still
--     lands pending, proving the trigger is untouched for the self-serve door.
--   * athlete_join_paid_pending: join_session (real athlete) on a PAID session
--     still lands pending payment_status.
--   * 153 invariants still hold: creator can add, non-creator forbidden, empty
--     name rejected, confirmed count increments by 1 on a door add.
--
-- FIXTURE DEPENDENCY: a non-cancelled session (for its creator), a non-admin
-- stranger, one user who is not the creator and not already in that session, and
-- the production trigger + join_session + join_session_as_guest. Missing -> guard
-- checks fail, ALL_CHECKS fails, nothing faked.
-- ============================================================================

BEGIN;

-- ── MIGRATION 155 BODY (verbatim) ───────────────────────────────────────────
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

  UPDATE session_participants
     SET payment_status = 'not_required'
   WHERE id = v_participant_id;

  UPDATE sessions SET current_participants = (
    SELECT count(*) FROM session_participants WHERE session_id = p_session_id AND status = 'confirmed'
  ) WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id, 'status', 'confirmed');
END $$;

REVOKE ALL ON FUNCTION public.host_add_session_guest(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_add_session_guest(uuid, text, text, text) TO authenticated;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
CREATE TEMP TABLE rehearsal_results (check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

DO $$
DECLARE
  v_s uuid; v_c uuid; v_x uuid; v_u uuid;
  v_res jsonb; v_pid uuid; v_ps text; v_before int; v_cp int;
  v_trigger_present boolean;
  v_join_present boolean;
  v_guest_join_present boolean;
BEGIN
  v_trigger_present := EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'session_participants' AND t.tgname = 'on_participant_join_set_payment'
  );
  v_join_present := to_regprocedure('public.join_session(uuid, uuid, text, text)') IS NOT NULL;
  v_guest_join_present := to_regprocedure('public.join_session_as_guest(uuid, text, text, text, text)') IS NOT NULL;

  SELECT id, creator_id INTO v_s, v_c FROM public.sessions
   WHERE COALESCE(status, '') <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_x FROM public.users WHERE COALESCE(is_admin, false) = false AND id <> v_c LIMIT 1;
  SELECT id INTO v_u FROM public.users u
   WHERE u.id <> v_c
     AND NOT EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id = v_s AND sp.user_id = u.id)
   LIMIT 1;

  INSERT INTO rehearsal_results VALUES (
    'fixture_found',
    format('S=%s C=%s X=%s U=%s trigger=%s join=%s guest_join=%s',
           v_s, v_c, v_x, v_u, v_trigger_present, v_join_present, v_guest_join_present),
    'session, creator, stranger, joinable user, trigger + both join RPCs present',
    v_s IS NOT NULL AND v_c IS NOT NULL AND v_x IS NOT NULL AND v_u IS NOT NULL
      AND v_trigger_present AND v_join_present AND v_guest_join_present
  );
  IF v_s IS NULL OR v_c IS NULL OR v_x IS NULL OR v_u IS NULL
     OR NOT v_trigger_present OR NOT v_join_present OR NOT v_guest_join_present THEN
    RETURN;
  END IF;

  -- Make S paid, open, active, with headroom so the paid branches all fire.
  UPDATE public.sessions
     SET is_paid = true, price_cents = 10000, join_policy = 'open', status = 'active', max_participants = 100
   WHERE id = v_s;

  -- 1. Door guest on a PAID session -> not_required (trigger set pending on insert,
  --    the function's follow-up UPDATE overrides it). Also the count-increments check.
  SELECT count(*) INTO v_before FROM public.session_participants WHERE session_id = v_s AND status = 'confirmed';
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  v_res := public.host_add_session_guest(v_s, 'Paid Door Guest', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  SELECT payment_status INTO v_ps FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES ('door_guest_paid_not_required', v_ps, 'not_required', v_ps = 'not_required');
  INSERT INTO rehearsal_results VALUES ('creator_can_add', v_res->>'success', 'true', (v_res->>'success') = 'true');
  SELECT current_participants INTO v_cp FROM public.sessions WHERE id = v_s;
  INSERT INTO rehearsal_results VALUES ('count_increments', v_cp::text, (v_before + 1)::text, v_cp = v_before + 1);

  -- 2. Self-serve guest (join_session_as_guest) on the PAID session -> pending,
  --    proving the trigger still fires and is untouched for the self-serve door.
  v_res := public.join_session_as_guest(v_s, NULL, 'Self Serve Guest', '3001234567', NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  SELECT payment_status INTO v_ps FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'self_serve_guest_paid_pending',
    format('rpc_status=%s payment_status=%s', v_res->>'status', v_ps),
    'payment_status pending',
    v_ps = 'pending');

  -- 3. Real athlete join on the PAID session -> pending payment_status.
  PERFORM set_config('request.jwt.claim.sub', v_u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u::text)::text, true);
  v_res := public.join_session(v_s, v_u, NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  SELECT payment_status INTO v_ps FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES (
    'athlete_join_paid_pending',
    format('rpc_status=%s payment_status=%s', v_res->>'status', v_ps),
    'payment_status pending',
    v_ps = 'pending');

  -- 4. Door guest on a FREE session -> not_required.
  UPDATE public.sessions SET is_paid = false, price_cents = 0 WHERE id = v_s;
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  v_res := public.host_add_session_guest(v_s, 'Free Door Guest', NULL, NULL);
  v_pid := (v_res->>'participant_id')::uuid;
  SELECT payment_status INTO v_ps FROM public.session_participants WHERE id = v_pid;
  INSERT INTO rehearsal_results VALUES ('door_guest_free_not_required', v_ps, 'not_required', v_ps = 'not_required');

  -- 153 invariants: non-creator forbidden, empty name rejected.
  PERFORM set_config('request.jwt.claim.sub', v_x::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_x::text)::text, true);
  v_res := public.host_add_session_guest(v_s, 'Should Not Land', NULL, NULL);
  INSERT INTO rehearsal_results VALUES ('non_creator_forbidden', v_res->>'error', 'forbidden', (v_res->>'error') = 'forbidden');

  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  v_res := public.host_add_session_guest(v_s, '   ', NULL, NULL);
  INSERT INTO rehearsal_results VALUES ('empty_name_rejected', v_res->>'error', 'guest_name_required', (v_res->>'error') = 'guest_name_required');

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ── SINGLE FINAL RESULT SET ─────────────────────────────────────────────────
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord, check_name, actual, expected, pass FROM rehearsal_results
  UNION ALL
  SELECT 1 AS ord, 'ALL_CHECKS' AS check_name, NULL AS actual, NULL AS expected, bool_and(pass) AS pass FROM rehearsal_results
) q
ORDER BY ord, check_name;

ROLLBACK;

-- ============================================================================
-- 152_scope_participant_roster_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 152's body verbatim, proves the row scoping against LIVE data, returns a
-- SINGLE final result set, and ROLLS BACK. ZERO changes persist.
--
-- The SQL Editor shows only the last statement's result and has no Notices panel,
-- so there is NO RAISE NOTICE: every scenario writes a row into a temp table and
-- the final SELECT renders them plus an ALL_CHECKS rollup.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- SIMULATING auth.uid(): this rehearsal does NOT create auth.users rows (that FK
-- chain is fragile). It picks real ids from live data and simulates the viewer by
-- setting the request JWT claims with set_config(..., is_local => true), the same
-- GUCs Supabase's auth.uid() and is_app_admin() read. Because 152's view is
-- owner-executed (security_invoker = false) and the SQL Editor runs as the table
-- owner, the view is readable and its WHERE evaluates auth.uid() from the GUC we
-- set. Both request.jwt.claim.sub and request.jwt.claims are set for version
-- robustness. This is a real simulation of auth.uid(), not a stubbed check.
--
-- What it proves:
--   * host_sees_full_roster: viewer = session creator sees every roster row of S.
--   * confirmed_participant_sees_full_roster: viewer = a confirmed participant of
--     S sees every roster row of S.
--   * stranger_sees_zero: a logged in user who is neither creator nor a confirmed
--     participant of S (and not an admin) sees 0 rows.
--   * admin_sees_full_roster: informational, proves the flagged is_app_admin()
--     branch (skipped with pass=true if no admin fixture exists).
--   * column_set_unchanged: the view exposes exactly 128's 11 columns.
--   * anon_select_revoked / authenticated_select_granted: grants unchanged.
--
-- FIXTURE DEPENDENCY: needs one session that has a confirmed participant whose
-- user_id differs from the creator, plus one unrelated non-admin user. Both exist
-- in prod. If a fixture is missing, fixture_found = false and ALL_CHECKS fails
-- (it does not fake a pass).
-- ============================================================================

BEGIN;

-- ── MIGRATION 152 BODY (verbatim) ───────────────────────────────────────────
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
LEFT JOIN public.users u ON u.id = sp.user_id
WHERE
  public.is_app_admin()
  OR EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = sp.session_id
      AND s.creator_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.session_participants me
    WHERE me.session_id = sp.session_id
      AND me.user_id = auth.uid()
      AND me.status = 'confirmed'
  );

REVOKE ALL ON public.session_participants_roster FROM PUBLIC, anon;
GRANT SELECT ON public.session_participants_roster TO authenticated;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
CREATE TEMP TABLE rehearsal_results (check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

DO $$
DECLARE
  v_s uuid; v_c uuid; v_p uuid; v_x uuid; v_a uuid;
  v_total int; v_cnt int; v_cols text;
  v_expected_cols text :=
    'id,session_id,user_id,status,is_guest,guest_name,joined_at,user_profile_id,user_name,user_avatar_url,user_preferred_language';
BEGIN
  -- Fixture: a session S, its creator C, and a confirmed participant P (P <> C).
  SELECT sp.session_id, s.creator_id, sp.user_id
    INTO v_s, v_c, v_p
  FROM public.session_participants sp
  JOIN public.sessions s ON s.id = sp.session_id
  WHERE sp.status = 'confirmed'
    AND sp.user_id IS NOT NULL
    AND sp.user_id <> s.creator_id
  LIMIT 1;

  -- Stranger X: non-admin, not the creator, not a confirmed participant of S.
  SELECT u.id INTO v_x
  FROM public.users u
  WHERE COALESCE(u.is_admin, false) = false
    AND u.id <> v_c
    AND NOT EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = v_s AND sp.user_id = u.id AND sp.status = 'confirmed'
    )
  LIMIT 1;

  -- Admin A (best effort): is_admin, not the creator, not a confirmed participant of S.
  SELECT u.id INTO v_a
  FROM public.users u
  WHERE COALESCE(u.is_admin, false) = true
    AND u.id <> v_c
    AND NOT EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = v_s AND sp.user_id = u.id AND sp.status = 'confirmed'
    )
  LIMIT 1;

  -- Ground truth: rows the view must return for S when the viewer is authorized.
  SELECT count(*) INTO v_total FROM public.session_participants WHERE session_id = v_s;

  INSERT INTO rehearsal_results VALUES (
    'fixture_found',
    format('S=%s C=%s P=%s X=%s total=%s', v_s, v_c, v_p, v_x, v_total),
    'S, C, P, X all present with total > 0',
    v_s IS NOT NULL AND v_c IS NOT NULL AND v_p IS NOT NULL AND v_x IS NOT NULL AND v_total > 0
  );

  -- Host (creator) sees the full roster.
  PERFORM set_config('request.jwt.claim.sub', v_c::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c::text)::text, true);
  SELECT count(*) INTO v_cnt FROM public.session_participants_roster WHERE session_id = v_s;
  INSERT INTO rehearsal_results VALUES ('host_sees_full_roster', v_cnt::text, v_total::text, v_cnt = v_total AND v_total > 0);

  -- Confirmed participant sees the full roster.
  PERFORM set_config('request.jwt.claim.sub', v_p::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_p::text)::text, true);
  SELECT count(*) INTO v_cnt FROM public.session_participants_roster WHERE session_id = v_s;
  INSERT INTO rehearsal_results VALUES ('confirmed_participant_sees_full_roster', v_cnt::text, v_total::text, v_cnt = v_total AND v_total > 0);

  -- Stranger (logged in, neither) sees zero rows.
  PERFORM set_config('request.jwt.claim.sub', v_x::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_x::text)::text, true);
  SELECT count(*) INTO v_cnt FROM public.session_participants_roster WHERE session_id = v_s;
  INSERT INTO rehearsal_results VALUES ('stranger_sees_zero', v_cnt::text, '0', v_cnt = 0);

  -- App admin sees the full roster (proves the flagged branch; skipped if none).
  IF v_a IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text)::text, true);
    SELECT count(*) INTO v_cnt FROM public.session_participants_roster WHERE session_id = v_s;
    INSERT INTO rehearsal_results VALUES ('admin_sees_full_roster', v_cnt::text, v_total::text, v_cnt = v_total AND v_total > 0);
  ELSE
    INSERT INTO rehearsal_results VALUES ('admin_sees_full_roster', 'no admin fixture available', 'skipped', true);
  END IF;

  -- Clear the simulated identity.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- Column set unchanged (exactly 128's 11 columns, in order).
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'session_participants_roster';
  INSERT INTO rehearsal_results VALUES ('column_set_unchanged', v_cols, v_expected_cols, v_cols = v_expected_cols);
END $$;

-- Grants unchanged: anon revoked, authenticated retained (role-based, not auth.uid()).
INSERT INTO rehearsal_results
SELECT 'anon_select_revoked',
       has_table_privilege('anon', 'public.session_participants_roster', 'SELECT')::text,
       'false',
       has_table_privilege('anon', 'public.session_participants_roster', 'SELECT') = false;

INSERT INTO rehearsal_results
SELECT 'authenticated_select_granted',
       has_table_privilege('authenticated', 'public.session_participants_roster', 'SELECT')::text,
       'true',
       has_table_privilege('authenticated', 'public.session_participants_roster', 'SELECT') = true;

-- ── SINGLE FINAL RESULT SET ─────────────────────────────────────────────────
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord, check_name, actual, expected, pass FROM rehearsal_results
  UNION ALL
  SELECT 1 AS ord, 'ALL_CHECKS' AS check_name, NULL AS actual, NULL AS expected, bool_and(pass) AS pass FROM rehearsal_results
) q
ORDER BY ord, check_name;

ROLLBACK;

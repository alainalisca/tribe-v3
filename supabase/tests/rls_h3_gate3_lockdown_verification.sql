-- RLS-H3 Gate 3 verification for migration 129. Run in the SQL editor AFTER
-- applying 129. BEGIN ... ROLLBACK — nothing persists. Proves all SIX.
--
-- Auth simulated the sprint-standard way: SET LOCAL ROLE + request.jwt.claims.sub.
-- SET LOCAL ROLE persists past a DO block, so each role-switching block RESETs ROLE
-- at its end, and the fixture temp table is granted to anon+authenticated.

BEGIN;

-- Show the surviving policies by name (the only SELECT policy must be sp_select_own).
SELECT cmd, polname, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace,
LATERAL (SELECT CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                                WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd) x
WHERE n.nspname='public' AND c.relname='session_participants'
ORDER BY cmd, polname;

-- Fixture: host H + participants A/B/C + one guest. (as owner; RLS bypassed)
CREATE TEMP TABLE _g3 (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO _g3 SELECT 'h', id FROM public.users ORDER BY created_at LIMIT 1;
INSERT INTO _g3 SELECT 'a', id FROM public.users WHERE id NOT IN (SELECT v FROM _g3) ORDER BY created_at LIMIT 1;
INSERT INTO _g3 SELECT 'b', id FROM public.users WHERE id NOT IN (SELECT v FROM _g3) ORDER BY created_at LIMIT 1;
INSERT INTO _g3 SELECT 'c', id FROM public.users WHERE id NOT IN (SELECT v FROM _g3) ORDER BY created_at LIMIT 1;
WITH s AS (
  INSERT INTO public.sessions (creator_id, date, duration, location, max_participants, sport, start_time)
  SELECT (SELECT v FROM _g3 WHERE k='h'), '2030-01-01', 60, 'g3probe', 20, 'running', '08:00' RETURNING id
)
INSERT INTO _g3 SELECT 'sess', id FROM s;
INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
  SELECT (SELECT v FROM _g3 WHERE k='sess'), (SELECT v FROM _g3 WHERE k='a'), 'confirmed', false;
WITH ins AS (
  INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
  SELECT (SELECT v FROM _g3 WHERE k='sess'), (SELECT v FROM _g3 WHERE k='b'), 'confirmed', false RETURNING id
)
INSERT INTO _g3 SELECT 'b_row', id FROM ins;
WITH ins AS (
  INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
  SELECT (SELECT v FROM _g3 WHERE k='sess'), (SELECT v FROM _g3 WHERE k='c'), 'pending', false RETURNING id
)
INSERT INTO _g3 SELECT 'c_row', id FROM ins;
INSERT INTO public.session_participants (session_id, is_guest, guest_name, guest_phone, guest_email, guest_token, status)
  SELECT (SELECT v FROM _g3 WHERE k='sess'), true, 'Probe Guest', '3001112222', 'g@example.com', gen_random_uuid(), 'confirmed';

GRANT SELECT ON _g3 TO anon, authenticated;

-- ── Checks 1 & 2: A reads own row (yes) but NOT B's row (no) ───────────────────
DO $$
DECLARE v_a uuid := (SELECT v FROM _g3 WHERE k='a'); v_b uuid := (SELECT v FROM _g3 WHERE k='b');
        v_sess uuid := (SELECT v FROM _g3 WHERE k='sess'); v_own int; v_other int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_own   FROM public.session_participants WHERE session_id=v_sess AND user_id=v_a;
  SELECT count(*) INTO v_other FROM public.session_participants WHERE session_id=v_sess AND user_id=v_b;
  IF v_own <> 1 THEN RAISE EXCEPTION 'FAIL(1): A cannot read its OWN row (got %)', v_own; END IF;
  IF v_other <> 0 THEN RAISE EXCEPTION 'FAIL(2): A CAN read B''s row (got % rows)', v_other; END IF;
  RAISE NOTICE 'PASS(1): A reads its own row; PASS(2): A cannot read another user''s row';
  RESET ROLE;
END$$;

-- ── Check 3: anon gets ZERO rows from the raw table ───────────────────────────
DO $$
DECLARE v_sess uuid := (SELECT v FROM _g3 WHERE k='sess'); n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.session_participants WHERE session_id=v_sess;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL(3): anon read % rows (expected 0)', n; END IF;
  RAISE NOTICE 'PASS(3): anon gets zero rows from the raw table';
  RESET ROLE;
END$$;

-- ── Check 4: guest_phone/email/token SELECT revoked from BOTH roles ────────────
DO $$
BEGIN
  IF has_column_privilege('anon','public.session_participants','guest_phone','SELECT')
  OR has_column_privilege('anon','public.session_participants','guest_email','SELECT')
  OR has_column_privilege('anon','public.session_participants','guest_token','SELECT')
  THEN RAISE EXCEPTION 'FAIL(4): anon still has SELECT on a guest-PII column'; END IF;
  IF has_column_privilege('authenticated','public.session_participants','guest_phone','SELECT')
  OR has_column_privilege('authenticated','public.session_participants','guest_email','SELECT')
  OR has_column_privilege('authenticated','public.session_participants','guest_token','SELECT')
  THEN RAISE EXCEPTION 'FAIL(4): authenticated still has SELECT on a guest-PII column'; END IF;
  RAISE NOTICE 'PASS(4): guest_phone/guest_email/guest_token SELECT revoked from anon AND authenticated';
END$$;

-- ── Check 5: host APPROVE (UPDATE, affected-row count, no RETURNING) works ─────
DO $$
DECLARE v_h uuid := (SELECT v FROM _g3 WHERE k='h'); v_crow uuid := (SELECT v FROM _g3 WHERE k='c_row'); n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_h::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.session_participants SET status='confirmed' WHERE id=v_crow;   -- no RETURNING
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL(5): host approve affected % rows (expected 1)', n; END IF;
  RAISE NOTICE 'PASS(5): host approve works under sp_select_own (affected=1, no RETURNING)';
  RESET ROLE;
END$$;

-- ── Check 6: host KICK (DELETE, affected-row count, no RETURNING) works ────────
DO $$
DECLARE v_h uuid := (SELECT v FROM _g3 WHERE k='h'); v_brow uuid := (SELECT v FROM _g3 WHERE k='b_row'); n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_h::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.session_participants WHERE id=v_brow;                     -- no RETURNING
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL(6): host kick affected % rows (expected 1)', n; END IF;
  RAISE NOTICE 'PASS(6): host kick works under sp_select_own (affected=1, no RETURNING)';
  RESET ROLE;
END$$;

ROLLBACK;

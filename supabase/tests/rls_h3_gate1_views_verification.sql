-- RLS-H3 Gate 1 verification for migration 127. Run in the Supabase SQL editor
-- AFTER applying 127. Wrapped in BEGIN ... ROLLBACK so NOTHING persists (the
-- throwaway session + participants are rolled back). Each check RAISEs PASS/FAIL.
--
-- Proves the two additive views are correctly shaped and access-scoped:
--   (1) session_participants_public exposes ONLY aggregate counts — no identities.
--   (2) its counts are correct.
--   (3) session_participants_roster exposes identities + guest DISPLAY name only —
--       NO guest_phone / guest_email / guest_token / payment_*.
--   (4) anon may read the public view but NOT the roster view.
--   (5) authenticated may read both.
-- Gate 1 is additive: the raw table is still readable here (that hole closes in
-- Gate 3's revoke) — not asserted.

BEGIN;

-- Throwaway fixture (as owner; RLS bypassed). One confirmed user, one confirmed
-- guest (with full PII + token), one pending guest -> confirmed=2, total=3.
CREATE TEMP TABLE _h3 (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO _h3 SELECT 'u', id FROM public.users ORDER BY created_at LIMIT 1;

WITH s AS (
  INSERT INTO public.sessions (creator_id, date, duration, location, max_participants, sport, start_time)
  SELECT (SELECT v FROM _h3 WHERE k='u'), '2030-01-01', 60, 'h3probe', 10, 'running', '08:00'
  RETURNING id
)
INSERT INTO _h3 SELECT 'sess', id FROM s;

INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
  SELECT (SELECT v FROM _h3 WHERE k='sess'), (SELECT v FROM _h3 WHERE k='u'), 'confirmed', false;
INSERT INTO public.session_participants (session_id, is_guest, guest_name, guest_phone, guest_email, guest_token, status)
  SELECT (SELECT v FROM _h3 WHERE k='sess'), true, 'Probe Guest', '3001234567', 'g@example.com', gen_random_uuid(), 'confirmed';
INSERT INTO public.session_participants (session_id, is_guest, guest_name, guest_token, status)
  SELECT (SELECT v FROM _h3 WHERE k='sess'), true, 'Pending Guest', gen_random_uuid(), 'pending';

-- Harness fix: SET LOCAL ROLE inside a DO block persists past the block (it does
-- NOT revert at block exit), so later blocks read _h3 while still 'anon'. Grant
-- the temp fixture table to both roles so those reads never hit "permission
-- denied for table _h3". (Each role-switching block also RESETs ROLE at its end.)
GRANT SELECT ON _h3 TO anon, authenticated;

-- ── Check 1: public view exposes ONLY aggregate count columns ──────────────────
DO $$
DECLARE cols text[];
BEGIN
  SELECT array_agg(column_name ORDER BY column_name) INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='session_participants_public';
  IF cols <> ARRAY['confirmed_count','participant_count','session_id'] THEN
    RAISE EXCEPTION 'FAIL(1): public view columns are % (expected only session_id + counts)', cols;
  END IF;
  RAISE NOTICE 'PASS(1): public view exposes only %', cols;
END$$;

-- ── Check 2: public view counts are correct ───────────────────────────────────
DO $$
DECLARE v_sess uuid := (SELECT v FROM _h3 WHERE k='sess'); c int; p int;
BEGIN
  SELECT confirmed_count, participant_count INTO c, p
  FROM public.session_participants_public WHERE session_id = v_sess;
  IF c <> 2 OR p <> 3 THEN
    RAISE EXCEPTION 'FAIL(2): counts confirmed=% participant=% (expected 2 / 3)', c, p;
  END IF;
  RAISE NOTICE 'PASS(2): counts confirmed=2 participant=3';
END$$;

-- ── Check 3: roster view HIDES guest PII + token + payment_*, KEEPS identities ─
DO $$
DECLARE cols text[];
BEGIN
  SELECT array_agg(column_name) INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='session_participants_roster';
  IF cols && ARRAY['guest_phone','guest_email','guest_token',
                   'payment_status','payment_id','payment_gateway','paid_at','payment_confirmed_by'] THEN
    RAISE EXCEPTION 'FAIL(3): roster view leaks a sensitive column: %', cols;
  END IF;
  IF NOT (cols @> ARRAY['user_name','guest_name','status','user_id']) THEN
    RAISE EXCEPTION 'FAIL(3): roster view missing a needed identity column: %', cols;
  END IF;
  RAISE NOTICE 'PASS(3): roster exposes identities + guest_name, no PII/token/payment';
END$$;

-- ── Check 4: anon can read the public view, NOT the roster view ────────────────
DO $$
DECLARE v_sess uuid := (SELECT v FROM _h3 WHERE k='sess'); c int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  SELECT confirmed_count INTO c FROM public.session_participants_public WHERE session_id = v_sess;
  IF c <> 2 THEN RAISE EXCEPTION 'FAIL(4a): anon count = % (expected 2)', c; END IF;
  RAISE NOTICE 'PASS(4a): anon reads public counts (=2)';
  BEGIN
    PERFORM 1 FROM public.session_participants_roster WHERE session_id = v_sess;
    RAISE EXCEPTION 'FAIL(4b): anon was ALLOWED to read the roster view';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS(4b): anon blocked from roster view (permission denied)';
  END;
  RESET ROLE;   -- SET LOCAL ROLE persists past this block otherwise
END$$;

-- ── Check 5: authenticated can read BOTH views ────────────────────────────────
DO $$
DECLARE v_sess uuid := (SELECT v FROM _h3 WHERE k='sess'); c int; r int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT participant_count INTO c FROM public.session_participants_public WHERE session_id = v_sess;
  SELECT count(*) INTO r FROM public.session_participants_roster WHERE session_id = v_sess;
  IF c <> 3 OR r <> 3 THEN RAISE EXCEPTION 'FAIL(5): authenticated public=% roster=% (expected 3 / 3)', c, r; END IF;
  RAISE NOTICE 'PASS(5): authenticated reads both views (public=3, roster=3 rows)';
  RESET ROLE;   -- restore superuser before the grant-introspection check
END$$;

-- ── Check 6: grant state directly (the Supabase anon-default-grant trap) ──────
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.session_participants_roster', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL(6): anon STILL has SELECT on session_participants_roster (revoke missed)';
  END IF;
  IF NOT has_table_privilege('anon', 'public.session_participants_public', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL(6): anon LOST SELECT on session_participants_public (should keep it)';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.session_participants_roster', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL(6): authenticated missing SELECT on session_participants_roster';
  END IF;
  RAISE NOTICE 'PASS(6): grants correct — anon: public YES / roster NO; authenticated: roster YES';
END$$;

ROLLBACK;

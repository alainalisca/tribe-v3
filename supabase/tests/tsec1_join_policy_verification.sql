-- T-SEC1 verification: join_session RPC enforces join_policy server-side.
--
-- Run this in the Supabase SQL editor AFTER deploying migration
-- 107_join_session_enforce_policy.sql. It calls the RPC directly, bypassing
-- the client, exactly as an attacker would. Everything runs inside a
-- transaction that ROLLS BACK, so it leaves no rows behind.
--
-- Each check RAISEs NOTICE 'PASS ...' or WARNING 'FAIL ...'. Zero FAILs expected.

BEGIN;

DO $$
DECLARE
  v_creator uuid;
  v_joiner  uuid;
  v_open    uuid := gen_random_uuid();
  v_curated uuid := gen_random_uuid();
  v_paid    uuid := gen_random_uuid();
  v_invite  uuid := gen_random_uuid();
  v_token   text := 'tsec1-verify-token';
  v_res     jsonb;
BEGIN
  -- Two distinct real users (creator must differ from joiner).
  SELECT id INTO v_creator FROM users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_joiner  FROM users WHERE id <> v_creator ORDER BY created_at LIMIT 1;
  IF v_creator IS NULL OR v_joiner IS NULL THEN
    RAISE EXCEPTION 'Need at least two users to run this verification';
  END IF;

  INSERT INTO sessions (id, creator_id, sport, date, start_time, duration, location, max_participants, join_policy, is_paid, price_cents, status)
  VALUES
    (v_open,    v_creator, 'Running', current_date, '08:00', 60, 'Test', 10, 'open',        false, 0,       'active'),
    (v_curated, v_creator, 'Running', current_date, '08:00', 60, 'Test', 10, 'curated',     false, 0,       'active'),
    (v_paid,    v_creator, 'Running', current_date, '08:00', 60, 'Test', 10, 'open',        true,  2000000, 'active'),
    (v_invite,  v_creator, 'Running', current_date, '08:00', 60, 'Test', 10, 'invite_only', false, 0,       'active');

  INSERT INTO invite_tokens (session_id, token, created_by, expires_at)
  VALUES (v_invite, v_token, v_creator, now() + interval '7 days');

  -- 1. Open, no token -> confirmed.
  v_res := join_session(v_open, v_joiner);
  IF v_res->>'success' = 'true' AND v_res->>'status' = 'confirmed'
    THEN RAISE NOTICE 'PASS  open -> confirmed  (%)', v_res;
    ELSE RAISE WARNING 'FAIL  open -> confirmed  (%)', v_res; END IF;

  -- 2. Curated -> forced pending (the p_status escape hatch is gone entirely).
  v_res := join_session(v_curated, v_joiner);
  IF v_res->>'success' = 'true' AND v_res->>'status' = 'pending'
    THEN RAISE NOTICE 'PASS  curated forced pending  (%)', v_res;
    ELSE RAISE WARNING 'FAIL  curated forced pending  (%)', v_res; END IF;

  -- 3. Paid (price > 0) -> forced pending.
  v_res := join_session(v_paid, v_joiner);
  IF v_res->>'success' = 'true' AND v_res->>'status' = 'pending'
    THEN RAISE NOTICE 'PASS  paid forced pending  (%)', v_res;
    ELSE RAISE WARNING 'FAIL  paid forced pending  (%)', v_res; END IF;

  -- 4. Invite-only, NO token -> rejected.
  v_res := join_session(v_invite, v_joiner);
  IF v_res->>'success' = 'false' AND v_res->>'error' = 'invite_only'
    THEN RAISE NOTICE 'PASS  invite-only no token rejected  (%)', v_res;
    ELSE RAISE WARNING 'FAIL  invite-only no token rejected  (%)', v_res; END IF;

  -- 5. Invite-only, unknown token -> rejected.
  v_res := join_session(v_invite, v_joiner, 'tsec1-verify-token-wrong');
  IF v_res->>'success' = 'false' AND v_res->>'error' = 'invite_invalid'
    THEN RAISE NOTICE 'PASS  invite-only bad token rejected  (%)', v_res;
    ELSE RAISE WARNING 'FAIL  invite-only bad token rejected  (%)', v_res; END IF;

  -- 6. Invite-only, valid token -> confirmed (not paid).
  v_res := join_session(v_invite, v_joiner, v_token);
  IF v_res->>'success' = 'true' AND v_res->>'status' = 'confirmed'
    THEN RAISE NOTICE 'PASS  invite-only valid token confirmed  (%)', v_res;
    ELSE RAISE WARNING 'FAIL  invite-only valid token confirmed  (%)', v_res; END IF;

  -- 7. Expired token -> rejected. Clear the prior confirmed row and expire it.
  DELETE FROM session_participants WHERE session_id = v_invite AND user_id = v_joiner;
  UPDATE invite_tokens SET expires_at = now() - interval '1 hour' WHERE token = v_token;
  v_res := join_session(v_invite, v_joiner, v_token);
  IF v_res->>'success' = 'false' AND v_res->>'error' = 'invite_expired'
    THEN RAISE NOTICE 'PASS  invite-only expired token rejected  (%)', v_res;
    ELSE RAISE WARNING 'FAIL  invite-only expired token rejected  (%)', v_res; END IF;
END $$;

ROLLBACK;

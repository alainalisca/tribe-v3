-- T-COUNT1 verification: sessions.current_participants stays correct across
-- insert / confirm / leave, and never goes negative.
--
-- Run in the Supabase SQL editor AFTER deploying migration 109. Exercises the
-- session_participants triggers directly (raw writes, no RPC / no app), which
-- is exactly the path that produced -1 before the fix. Everything runs inside
-- a transaction that ROLLS BACK, so it leaves no rows behind.
--
-- Each check RAISEs NOTICE 'PASS ...' or WARNING 'FAIL ...'. Zero FAILs expected.

BEGIN;

DO $$
DECLARE
  v_creator uuid;
  v_athlete uuid;
  v_session uuid := gen_random_uuid();
  v_count   int;
BEGIN
  SELECT id INTO v_creator FROM users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_athlete FROM users WHERE id <> v_creator ORDER BY created_at LIMIT 1;
  IF v_creator IS NULL OR v_athlete IS NULL THEN
    RAISE EXCEPTION 'Need at least two users to run this verification';
  END IF;

  INSERT INTO sessions (id, creator_id, sport, date, start_time, duration, location, max_participants, status, current_participants)
  VALUES (v_session, v_creator, 'Running', current_date, '08:00', 60, 'Test', 10, 'active', 0);

  -- 1. Insert a CONFIRMED participant -> count should be exactly 1 (recompute),
  --    not 2 (would mean the legacy delta trigger still stacks on top).
  INSERT INTO session_participants (session_id, user_id, status) VALUES (v_session, v_athlete, 'confirmed');
  SELECT current_participants INTO v_count FROM sessions WHERE id = v_session;
  IF v_count = 1 THEN RAISE NOTICE 'PASS  confirmed insert -> 1 (got %)', v_count;
  ELSE RAISE WARNING 'FAIL  confirmed insert should be 1, got %', v_count; END IF;

  -- 2. Delete the confirmed row -> count should be 0, NOT -1 (the bug).
  DELETE FROM session_participants WHERE session_id = v_session AND user_id = v_athlete;
  SELECT current_participants INTO v_count FROM sessions WHERE id = v_session;
  IF v_count = 0 THEN RAISE NOTICE 'PASS  confirmed delete -> 0 (got %)', v_count;
  ELSE RAISE WARNING 'FAIL  confirmed delete should be 0 (not -1), got %', v_count; END IF;

  -- 3. Insert a PENDING participant -> count should stay 0 (pending doesn't
  --    consume a seat).
  INSERT INTO session_participants (session_id, user_id, status) VALUES (v_session, v_athlete, 'pending');
  SELECT current_participants INTO v_count FROM sessions WHERE id = v_session;
  IF v_count = 0 THEN RAISE NOTICE 'PASS  pending insert keeps 0 (got %)', v_count;
  ELSE RAISE WARNING 'FAIL  pending insert should keep 0, got %', v_count; END IF;

  -- 4. Promote pending -> confirmed -> count should be 1.
  UPDATE session_participants SET status = 'confirmed' WHERE session_id = v_session AND user_id = v_athlete;
  SELECT current_participants INTO v_count FROM sessions WHERE id = v_session;
  IF v_count = 1 THEN RAISE NOTICE 'PASS  pending->confirmed -> 1 (got %)', v_count;
  ELSE RAISE WARNING 'FAIL  pending->confirmed should be 1, got %', v_count; END IF;

  -- 5. Sanity: exactly one count-maintenance trigger remains.
  SELECT count(*) INTO v_count
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'session_participants' AND NOT t.tgisinternal
    AND t.tgname IN ('trg_sync_session_participant_count', 'update_participant_count');
  IF v_count = 1 THEN RAISE NOTICE 'PASS  exactly one count trigger remains (got %)', v_count;
  ELSE RAISE WARNING 'FAIL  expected exactly one count trigger, got %', v_count; END IF;
END $$;

ROLLBACK;

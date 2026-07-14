-- Gate 3 verification for migration 126. Run in the Supabase SQL editor AFTER
-- applying 126. Wrapped in BEGIN ... ROLLBACK so NOTHING persists (the RPC's real
-- rows + the test message are rolled back). Every check RAISEs PASS or FAILs loud.
--
-- Auth is simulated the sprint-standard way: SET LOCAL ROLE authenticated so RLS
-- is enforced (superuser bypasses it), + request.jwt.claims.sub so auth.uid()
-- returns the acting user. SET LOCAL / set_config(...,true) inside a DO block
-- revert at block exit, so each block is isolated.
--
-- Proves: (1) direct participant INSERT blocked, (2) direct conversation INSERT
-- blocked, (3) RPC still creates conversation + both rows, (4) participant DM
-- send/read still works, (5) non-participant cannot read.

BEGIN;

-- Actors (chosen as owner/postgres; RLS bypassed here). Plus one empty
-- conversation for the blocked participant-insert test.
CREATE TEMP TABLE _g3 (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO _g3 SELECT 'a', id FROM public.users ORDER BY created_at LIMIT 1;
INSERT INTO _g3 SELECT 'b', id FROM public.users
  WHERE id <> (SELECT v FROM _g3 WHERE k='a') ORDER BY created_at LIMIT 1;
INSERT INTO _g3 SELECT 'c', id FROM public.users
  WHERE id NOT IN (SELECT v FROM _g3) ORDER BY created_at LIMIT 1;
INSERT INTO _g3 SELECT 'empty', id FROM (
  INSERT INTO public.conversations (type) VALUES ('direct') RETURNING id
) q;

-- ── Checks 1 & 2: direct INSERTs as authenticated A must be BLOCKED ────────────
DO $$
DECLARE
  v_a    uuid := (SELECT v FROM _g3 WHERE k='a');
  v_empt uuid := (SELECT v FROM _g3 WHERE k='empty');
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- (1) conversation_participants direct INSERT (self) -> must be denied
  BEGIN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_empt, v_a);
    RAISE EXCEPTION 'FAIL(1): conversation_participants INSERT was ALLOWED (still open)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS(1): direct conversation_participants INSERT blocked (42501)';
  END;

  -- (2) conversations direct INSERT -> must be denied
  BEGIN
    INSERT INTO public.conversations (type) VALUES ('direct');
    RAISE EXCEPTION 'FAIL(2): conversations INSERT was ALLOWED (still open)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS(2): direct conversations INSERT blocked (42501)';
  END;
END$$;

-- ── Checks 3, 4, 5: RPC works; participant send/read works; non-participant blind ─
DO $$
DECLARE
  v_a uuid := (SELECT v FROM _g3 WHERE k='a');
  v_b uuid := (SELECT v FROM _g3 WHERE k='b');
  v_c uuid := (SELECT v FROM _g3 WHERE k='c');
  v_conv uuid;
  v_cnt  int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- (3) RPC still creates the conversation + both participant rows
  v_conv := public.get_or_create_direct_conversation(v_b);
  IF v_conv IS NULL THEN RAISE EXCEPTION 'FAIL(3): RPC returned NULL'; END IF;
  SELECT count(*) INTO v_cnt FROM public.conversation_participants WHERE conversation_id = v_conv;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'FAIL(3): expected 2 participant rows, got %', v_cnt; END IF;
  RAISE NOTICE 'PASS(3): RPC created conversation % with both participant rows', v_conv;

  -- (4) participant A can send and read a DM
  INSERT INTO public.chat_messages (conversation_id, user_id, message)
  VALUES (v_conv, v_a, 'g3 verify hello');
  SELECT count(*) INTO v_cnt FROM public.chat_messages WHERE conversation_id = v_conv;
  IF v_cnt < 1 THEN RAISE EXCEPTION 'FAIL(4): participant A cannot read the DM it just sent'; END IF;
  RAISE NOTICE 'PASS(4): participant send + read works (A sees % message(s))', v_cnt;

  -- (5) non-participant C is blind to the thread
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_c::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt FROM public.chat_messages WHERE conversation_id = v_conv;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'FAIL(5): non-participant C can read the DM (% rows)', v_cnt; END IF;
  RAISE NOTICE 'PASS(5): non-participant C sees 0 messages';
END$$;

ROLLBACK;

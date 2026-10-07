-- ════════════════════════════════════════════════════════════════════════════
-- T-AV1, item 3. CAN AN AUTHENTICATED ATHLETE WRITE challenge_participants.progress?
--
-- LOCAL STACK ONLY. Never run this against production: it creates a fixture and
-- it REPLACES a policy inside the transaction. Both are undone by the ROLLBACK,
-- but a script that alters a policy has no business near a production editor.
--
--   psql "$SUPABASE_DB_URL_LOCAL" -f supabase/recon/t-av1-item3-progress-write.LOCAL.sql
--
-- The local database carries production's exact schema (schema-only dump, see
-- docs/AV_LOCAL_STACK.md), so every policy, grant and trigger read here is
-- production's. What is NOT production's is the data, which is why this file
-- builds its own fixture rather than reading a real challenge.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS NOT JUST `UPDATE ... ; SELECT`
-- ════════════════════════════════════════════════════════════════════════════
--
-- Through PostgREST, every request to this table -- read and write, anon and
-- authenticated -- fails with 42P17 infinite recursion, because
-- `challenge_participants_select` (migration 048) contains
-- `EXISTS (SELECT 1 FROM challenge_participants cp ...)` and so re-enters
-- itself. An UPDATE's WHERE clause is subject to the SELECT policy, so the
-- recursion swallows writes too.
--
-- That produces a "no, athletes cannot write progress" that is true today and
-- says NOTHING about the permission, because the request never reaches it. The
-- moment anyone fixes the recursion -- and they will, the feature is broken
-- until they do -- the permission underneath is what decides. So arm B2
-- replaces the recursive policy with a non-recursive equivalent INSIDE the
-- transaction and asks the question the fix will expose.
--
-- This is the CLAUDE.md rule about a check that cannot reach the thing it is
-- checking: a guard that is quiet because the request errored earlier is not a
-- guard reporting "denied".
--
-- ════════════════════════════════════════════════════════════════════════════
-- EVERY ARM PRINTS WHAT IT READ, AND BOTH DIRECTIONS ARE CONTROLLED
-- ════════════════════════════════════════════════════════════════════════════
--
-- A row saying DENIED is worthless unless the same harness is shown able to
-- say ALLOWED, and vice versa. So:
--   A1  proves auth.uid() actually resolves to ana -- otherwise every arm below
--       is a statement about a NULL uid, not about an athlete
--   B1  FAILURE CONTROL: the recursion, reproduced, so B2's result is visibly
--       not the same code path
--   B2  THE QUESTION: own row, recursion removed
--   B3  NEGATIVE: someone else's row, same session, must touch 0 rows
--   B4  POSITIVE CONTROL: the harness can observe a write landing at all
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP off
\pset pager off

BEGIN;

CREATE TEMP TABLE reh(seq int, arm text, question text, result text, detail text);
-- The arms below run as `authenticated`, and a temp table created by postgres
-- is not writable by it. Without this every arm dies on "permission denied for
-- table reh" -- which is a fact about the harness and would be read as a fact
-- about the permission under test.
GRANT ALL ON reh TO PUBLIC;

-- ─── fixture, built unconditionally so the arms start from a known 0 ────────
-- Not ON CONFLICT DO NOTHING: a leftover row from an earlier run would leave
-- progress at whatever that run set, and B2 would then be comparing against a
-- number it did not establish.
DELETE FROM public.challenge_participants WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001';
DELETE FROM public.challenges            WHERE id           = '00000000-0000-4000-8000-0000000cc001';

INSERT INTO public.challenges (id, title, description, challenge_type, target_value,
                               start_date, end_date, creator_id, is_public)
VALUES ('00000000-0000-4000-8000-0000000cc001', 'Reto de prueba T-AV1',
        'Fixture local T-AV1 item 3.', 'session_count', 4,
        now() - interval '1 day', now() + interval '14 days',
        '00000000-0000-4000-8000-000000000005', true);

INSERT INTO public.challenge_participants (challenge_id, user_id, progress) VALUES
  ('00000000-0000-4000-8000-0000000cc001','00000000-0000-4000-8000-000000000001',0),
  ('00000000-0000-4000-8000-0000000cc001','00000000-0000-4000-8000-000000000002',0);

-- ─── A1: the role and the uid this rehearsal actually runs as ───────────────
-- CLAUDE.md: a test asserting on current_user/session_user must first assert
-- what they are, or the assertion is silently about the harness.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

INSERT INTO reh VALUES (1, 'A1', 'does auth.uid() resolve to ana under this setup?',
  CASE WHEN auth.uid() = '00000000-0000-4000-8000-000000000001'::uuid
       THEN 'PASS' ELSE 'FAIL -- every arm below is about a NULL uid' END,
  format('current_user=%s session_user=%s auth.uid()=%s',
         current_user, session_user, coalesce(auth.uid()::text,'(null)')));

-- ─── B1: FAILURE CONTROL -- the recursion, as it stands on main today ───────
DO $$
DECLARE v_sqlstate text; v_msg text;
BEGIN
  BEGIN
    UPDATE public.challenge_participants SET progress = 9999
     WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001'
       AND user_id = '00000000-0000-4000-8000-000000000001';
    INSERT INTO reh VALUES (2,'B1','with the SHIPPED policy, does the write reach the permission?',
      'NO ERROR', 'the update ran -- recursion did not fire, re-read this file');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    INSERT INTO reh VALUES (2,'B1','with the SHIPPED policy, does the write reach the permission?',
      CASE WHEN v_sqlstate = '42P17' THEN 'BLOCKED BY RECURSION' ELSE 'OTHER ERROR' END,
      format('%s: %s', v_sqlstate, v_msg));
  END;
END $$;

-- ─── remove the recursion, exactly as a fix would ───────────────────────────
RESET ROLE;
DROP POLICY IF EXISTS challenge_participants_select ON public.challenge_participants;
CREATE POLICY challenge_participants_select ON public.challenge_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.challenges ch
                WHERE ch.id = challenge_participants.challenge_id
                  AND (ch.is_public = true OR ch.creator_id = auth.uid()))
  );
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ─── B2: THE QUESTION -- ana writes her OWN progress ────────────────────────
DO $$
DECLARE n int; v_after int; v_sqlstate text; v_msg text;
BEGIN
  BEGIN
    UPDATE public.challenge_participants SET progress = 9999
     WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001'
       AND user_id = '00000000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    SELECT progress INTO v_after FROM public.challenge_participants
     WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001'
       AND user_id = '00000000-0000-4000-8000-000000000001';
    INSERT INTO reh VALUES (3,'B2','CAN AN ATHLETE WRITE THEIR OWN progress?',
      CASE WHEN n > 0 AND v_after = 9999 THEN 'YES -- WRITE SUCCEEDED' ELSE 'NO' END,
      format('rows=%s progress now=%s (was 0, target 4)', n, v_after));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    INSERT INTO reh VALUES (3,'B2','CAN AN ATHLETE WRITE THEIR OWN progress?',
      'NO -- REFUSED', format('%s: %s', v_sqlstate, v_msg));
  END;
END $$;

-- ─── B3: NEGATIVE -- ana writes BETO's row, same session ────────────────────
DO $$
DECLARE n int; v_beto int; v_sqlstate text; v_msg text;
BEGIN
  BEGIN
    UPDATE public.challenge_participants SET progress = 9999
     WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001'
       AND user_id = '00000000-0000-4000-8000-000000000002';
    GET DIAGNOSTICS n = ROW_COUNT;
    RESET ROLE;
    SELECT progress INTO v_beto FROM public.challenge_participants
     WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001'
       AND user_id = '00000000-0000-4000-8000-000000000002';
    INSERT INTO reh VALUES (4,'B3','can she write SOMEONE ELSE''S row?',
      CASE WHEN n = 0 AND v_beto = 0 THEN 'NO -- correctly filtered' ELSE 'YES -- ESCALATION' END,
      format('rows=%s beto.progress=%s', n, v_beto));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    INSERT INTO reh VALUES (4,'B3','can she write SOMEONE ELSE''S row?',
      'NO -- REFUSED', format('%s: %s', v_sqlstate, v_msg));
  END;
END $$;

-- ─── B4: POSITIVE CONTROL -- can this harness see a write land at all? ──────
-- Without this, "0 rows" in B3 is indistinguishable from an UPDATE statement
-- that never ran. Same table, same column, same transaction, owner role.
RESET ROLE;
DO $$
DECLARE n int; v_after int;
BEGIN
  UPDATE public.challenge_participants SET progress = 1234
   WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001'
     AND user_id = '00000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT progress INTO v_after FROM public.challenge_participants
   WHERE challenge_id = '00000000-0000-4000-8000-0000000cc001'
     AND user_id = '00000000-0000-4000-8000-000000000002';
  INSERT INTO reh VALUES (5,'B4','can the harness observe a write landing (control)?',
    CASE WHEN n = 1 AND v_after = 1234 THEN 'YES -- harness is live' ELSE 'NO -- B3 IS VACUOUS' END,
    format('rows=%s progress now=%s', n, v_after));
END $$;

-- ─── C1: the three layers, named individually ───────────────────────────────
INSERT INTO reh
SELECT 6, 'C1', 'grant: does authenticated hold UPDATE on progress?',
       CASE WHEN has_column_privilege('authenticated','public.challenge_participants','progress','UPDATE')
            THEN 'YES' ELSE 'NO' END,
       'has_column_privilege -- the table-level form is wrong here, see CLAUDE.md';

INSERT INTO reh
SELECT 7, 'C2', 'policy: is there an UPDATE policy keyed on the caller?',
       CASE WHEN count(*) > 0 THEN 'YES' ELSE 'NO' END,
       coalesce(string_agg(format('%s USING(%s) WITH CHECK(%s)', policyname, qual,
                                  coalesce(with_check,'(omitted -> USING is reused)')), ' | '), '(none)')
  FROM pg_policies WHERE tablename = 'challenge_participants' AND cmd = 'UPDATE';

INSERT INTO reh
SELECT 8, 'C3', 'trigger: is there any BEFORE UPDATE guard on the table?',
       CASE WHEN count(*) = 0 THEN 'NONE' ELSE 'SOME' END,
       coalesce(string_agg(t.tgname, ', '), '(no non-internal triggers)')
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'challenge_participants' AND NOT t.tgisinternal;

-- ─── the one result set. Every row is evidence, not a verdict column. ───────
SELECT seq, arm, question, result, detail FROM reh ORDER BY seq;

ROLLBACK;

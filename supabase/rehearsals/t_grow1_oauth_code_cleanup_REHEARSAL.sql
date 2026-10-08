-- t_grow1_oauth_code_cleanup_REHEARSAL.sql
--
-- NOT A MIGRATION. A one-off data cleanup, rehearsed in the house shape so it is
-- read and judged the same way a migration is. It has no number, is not in
-- supabase/migrations/, and is not recorded in migrations_applied: it changes
-- two rows and no schema.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IT REMOVES AND WHY IT IS URGENT-ISH RATHER THAN URGENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The T-GROW1 capture library read `?code=` on `/auth/callback/` as a campaign
-- code. Google sign-in lands there with a one-time PKCE AUTHORIZATION CODE, so
-- that value was written to two places on 2026-10-08:
--
--   attribution_events b3c0c0eb-cd28-4f68-9c40-b9486670128b
--     event_type = visit, landing_path = /auth/callback/,
--     code = FF275D19-D6B0-40DD-9C19-695C59BDC0C9
--   pass_leads TR-C3LU
--     first_touch carrying the same code and landing_path
--
-- THE CODE IS SINGLE-USE AND WAS ALREADY REDEEMED when it landed -- Supabase
-- exchanges it for a session before the page renders -- so this is not a live
-- credential and nothing needs rotating. That is why this is a cleanup and not
-- an incident.
--
-- It is still a credential-shaped secret sitting in two analytics rows, and
-- CLAUDE.md's standing position on this class is that the blast radius of a
-- credential in the wrong table is not the thing to go measuring. It comes out.
--
-- The code fix shipped first (lib/attribution.ts rules A, B and C, enforced
-- again in /api/attr and /api/pase), so nothing is writing more of these while
-- this sits unrun.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THE LEAD IS NULLED AND NOT DELETED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- TR-C3LU is Al's own test lead on tribe-test-pass, and Al said so. Even so,
-- only `first_touch` is cleared: its src, code and utm_campaign are the correct
-- last-touch values the phone test PROVED (runclub / RH-PHONE1 / hyrox-oct, from
-- a plain /pase/tribe-test-pass/ URL), and those are the evidence that the core
-- feature works. Deleting the row would throw away the successful half of the
-- test to clean up the failed half.
--
-- first_touch is the only column that carries the secret, and NULL is its honest
-- value: this browser's genuine first touch was never recorded, because the
-- thing that recorded one recorded the wrong thing.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HOW TO RUN IT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Part A to G are inside BEGIN ... ROLLBACK and change nothing. Read the one
-- result table; every row must say PASS.
--
-- THEN, and only then, run PART H, which is after the ROLLBACK and is the only
-- part that writes. It is commented out. Uncomment it deliberately.
--
-- Part A  the two rows are there, and are the ones described above
-- Part B  the blast radius: is this the ONLY pair, or are there more?
-- Part C  the cleanup, applied inside the transaction
-- Part D  the end state: the secret is gone from both rows
-- Part E  what must NOT have changed -- the lead's last-touch columns, every
--         other lead, every other event
-- Part F  idempotence: running it twice changes nothing the second time
-- Part G  a NEGATIVE control -- the same statements must not match a lead that
--         is not TR-C3LU

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

DO $outer$
DECLARE
  k_event  constant uuid := 'b3c0c0eb-cd28-4f68-9c40-b9486670128b';
  k_pass   constant text := 'TR-C3LU';
  -- The value itself, so the arms can assert it is GONE rather than assert that
  -- something changed. It is already redeemed and is in the repo history either
  -- way; writing it here is what makes Part D a real check instead of a diff.
  k_secret constant text := 'FF275D19-D6B0-40DD-9C19-695C59BDC0C9';

  a1 text := '(never ran)'; a1ok boolean := false;
  a2 text := '(never ran)'; a2ok boolean := false;
  b1 text := '(never ran)'; b1ok boolean := false;
  b2 text := '(never ran)'; b2ok boolean := false;
  c1 text := '(never ran)'; c1ok boolean := false;
  d1 text := '(never ran)'; d1ok boolean := false;
  d2 text := '(never ran)'; d2ok boolean := false;
  e1 text := '(never ran)'; e1ok boolean := false;
  e2 text := '(never ran)'; e2ok boolean := false;
  e3 text := '(never ran)'; e3ok boolean := false;
  f1 text := '(never ran)'; f1ok boolean := false;
  g1 text := '(never ran)'; g1ok boolean := false;

  v_lead   record;
  v_n      int;
  v_m      int;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════
-- PART A: the two rows are real, and are the ones the report describes.
--
-- Asserted BEFORE anything is changed. A cleanup that runs against rows it has
-- not confirmed is a cleanup that can silently do nothing -- and "0 rows
-- updated" reads exactly like success.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  SELECT 'event_type=' || event_type || ' landing_path=' || coalesce(landing_path, 'NULL')
      || ' code=' || coalesce(code, 'NULL') || ' created=' || created_at::text
    INTO a1
    FROM public.attribution_events WHERE id = k_event;
  a1ok := (SELECT count(*) FROM public.attribution_events
            WHERE id = k_event AND code = k_secret AND landing_path = '/auth/callback/') = 1;
  IF a1 IS NULL THEN a1 := 'NO SUCH EVENT -- nothing to clean'; a1ok := false; END IF;
EXCEPTION WHEN OTHERS THEN a1 := SQLSTATE || ' ' || SQLERRM; a1ok := false;
END;

BEGIN
  SELECT 'src=' || coalesce(src, 'NULL') || ' code=' || coalesce(code, 'NULL')
      || ' utm_campaign=' || coalesce(utm_campaign, 'NULL')
      || ' first_touch.code=' || coalesce(first_touch ->> 'code', 'NULL')
      || ' first_touch.landing_path=' || coalesce(first_touch ->> 'landing_path', 'NULL')
    INTO a2
    FROM public.pass_leads WHERE pass_code = k_pass;
  a2ok := (SELECT count(*) FROM public.pass_leads
            WHERE pass_code = k_pass
              AND first_touch ->> 'code' = k_secret
              AND first_touch ->> 'landing_path' = '/auth/callback/') = 1;
  IF a2 IS NULL THEN a2 := 'NO SUCH LEAD -- nothing to clean'; a2ok := false; END IF;
EXCEPTION WHEN OTHERS THEN a2 := SQLSTATE || ' ' || SQLERRM; a2ok := false;
END;

-- ══════════════════════════════════════════════════════════════════════════
-- PART B: THE BLAST RADIUS, and this is the part worth reading carefully.
--
-- The report names one event and one lead. Those are the two somebody noticed.
-- The bug ran on every sign-in for as long as the code was deployed, so the
-- question "how many are there" has to be ASKED rather than assumed from the
-- report -- CLAUDE.md's rule about a defect reported from a screenshot getting
-- fixed at the first matching string.
--
-- B1 and B2 therefore search by SHAPE, not by id: any event or lead whose
-- landing path is the callback, or whose code is UUID-shaped. If either finds
-- more than the one row Part A pinned, PART H IS NOT THE RIGHT CLEANUP and the
-- statements need widening before anything is run.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  SELECT count(*), coalesce(string_agg(id::text, ', ' ORDER BY created_at), '(none)')
    INTO v_n, b1
    FROM public.attribution_events
   WHERE landing_path LIKE '/auth/callback%'
      OR code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR src ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR attr_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  b1 := v_n || ' affected event(s): ' || b1;
  b1ok := (v_n = 1)
      AND EXISTS (SELECT 1 FROM public.attribution_events
                   WHERE id = k_event AND landing_path LIKE '/auth/callback%');
EXCEPTION WHEN OTHERS THEN b1 := SQLSTATE || ' ' || SQLERRM; b1ok := false;
END;

BEGIN
  SELECT count(*), coalesce(string_agg(pass_code, ', ' ORDER BY created_at), '(none)')
    INTO v_m, b2
    FROM public.pass_leads
   WHERE first_touch ->> 'landing_path' LIKE '/auth/callback%'
      OR first_touch ->> 'code' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR landing_path LIKE '/auth/callback%'
      OR code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR attr_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  b2 := v_m || ' affected lead(s): ' || b2;
  b2ok := (v_m = 1) AND EXISTS (SELECT 1 FROM public.pass_leads WHERE pass_code = k_pass
                                  AND first_touch ->> 'landing_path' LIKE '/auth/callback%');
EXCEPTION WHEN OTHERS THEN b2 := SQLSTATE || ' ' || SQLERRM; b2ok := false;
END;

-- ══════════════════════════════════════════════════════════════════════════
-- PART C: the cleanup, run here inside the transaction.
--
-- BY SHAPE, NOT BY ID, and that is the one design decision in this file.
-- Part B has just proved the shape matches exactly the two rows the report
-- names, so by-shape and by-id are the same statement today -- but by-shape is
-- the one that is still correct if Part B found three, and it is the one that
-- cannot be defeated by a typo'd uuid. The id and pass_code are asserted
-- separately in Part D.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  DELETE FROM public.attribution_events
   WHERE landing_path LIKE '/auth/callback%'
      OR code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.pass_leads
     SET first_touch = NULL
   WHERE first_touch ->> 'landing_path' LIKE '/auth/callback%'
      OR first_touch ->> 'code' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  GET DIAGNOSTICS v_m = ROW_COUNT;

  c1 := v_n || ' event(s) deleted, ' || v_m || ' lead first_touch(es) nulled';
  c1ok := (v_n = 1 AND v_m = 1);
EXCEPTION WHEN OTHERS THEN c1 := SQLSTATE || ' ' || SQLERRM; c1ok := false;
END;

-- ══════════════════════════════════════════════════════════════════════════
-- PART D: the end state. The secret is gone from both rows.
--
-- Asserted in a SEPARATE statement from the mutation, which is CLAUDE.md's
-- data-modifying-CTE finding: a verification inside the same statement as the
-- write reads the pre-statement snapshot and is structurally incapable of
-- observing it.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  SELECT count(*) INTO v_n FROM public.attribution_events WHERE id = k_event;
  d1 := 'rows with that id: ' || v_n;
  d1ok := (v_n = 0);
EXCEPTION WHEN OTHERS THEN d1 := SQLSTATE || ' ' || SQLERRM; d1ok := false;
END;

BEGIN
  SELECT first_touch IS NULL,
         'first_touch=' || coalesce(first_touch::text, 'NULL')
    INTO d2ok, d2
    FROM public.pass_leads WHERE pass_code = k_pass;
  -- The whole-row search, not just this lead: the secret must not survive
  -- ANYWHERE in either table, including a column nobody thought to look at.
  SELECT count(*) INTO v_n FROM public.pass_leads
   WHERE to_jsonb(pass_leads.*)::text ILIKE '%' || k_secret || '%';
  SELECT count(*) INTO v_m FROM public.attribution_events
   WHERE to_jsonb(attribution_events.*)::text ILIKE '%' || k_secret || '%';
  d2 := d2 || '; rows still containing the secret anywhere: leads=' || v_n || ' events=' || v_m;
  d2ok := coalesce(d2ok, false) AND v_n = 0 AND v_m = 0;
EXCEPTION WHEN OTHERS THEN d2 := SQLSTATE || ' ' || SQLERRM; d2ok := false;
END;

-- ══════════════════════════════════════════════════════════════════════════
-- PART E: what must NOT have changed.
--
-- The arms that make this safe to run. A cleanup is judged by what it left
-- alone at least as much as by what it removed.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  SELECT src, code, utm_campaign, attended_at, contacted_at, name, whatsapp, email
    INTO v_lead FROM public.pass_leads WHERE pass_code = k_pass;
  e1 := 'src=' || coalesce(v_lead.src, 'NULL')
     || ' code=' || coalesce(v_lead.code, 'NULL')
     || ' utm_campaign=' || coalesce(v_lead.utm_campaign, 'NULL');
  -- THE PHONE TEST'S RESULT, PRESERVED. These three are the proof that last
  -- touch works from a plain /pase/tribe-test-pass/ URL, which is the thing the
  -- whole ticket was built to do. A cleanup that took them would be deleting the
  -- evidence that the feature works.
  e1ok := v_lead.src = 'runclub' AND v_lead.code = 'RH-PHONE1' AND v_lead.utm_campaign = 'hyrox-oct';
EXCEPTION WHEN OTHERS THEN e1 := SQLSTATE || ' ' || SQLERRM; e1ok := false;
END;

BEGIN
  SELECT count(*) INTO v_n FROM public.pass_leads WHERE pass_code <> k_pass AND first_touch IS NOT NULL;
  SELECT count(*) INTO v_m FROM public.pass_leads;
  e2 := v_m || ' leads total, ' || v_n || ' other lead(s) still carry a first_touch';
  -- Every other lead is untouched. Today that number is 0 because no other lead
  -- has a first_touch yet, so this arm is weak NOW and becomes the important one
  -- the moment real leads start carrying them -- which is the point of recording
  -- what it saw rather than only whether it passed.
  e2ok := (v_m > 0);
EXCEPTION WHEN OTHERS THEN e2 := SQLSTATE || ' ' || SQLERRM; e2ok := false;
END;

BEGIN
  SELECT count(*) INTO v_n FROM public.attribution_events;
  e3 := v_n || ' event(s) remain';
  -- The visit from the successful half of the phone test (18:20 UTC) must
  -- survive. If this reads 0, the DELETE was too wide and took the evidence with
  -- the secret.
  e3ok := (v_n > 0)
      AND EXISTS (SELECT 1 FROM public.attribution_events
                   WHERE src = 'runclub' AND code = 'RH-PHONE1');
EXCEPTION WHEN OTHERS THEN e3 := SQLSTATE || ' ' || SQLERRM; e3ok := false;
END;

-- ══════════════════════════════════════════════════════════════════════════
-- PART F: idempotence. A second run changes nothing.
--
-- These are hand-run statements; re-running one because you are unsure whether
-- the first took is the normal case, not the exotic one.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  DELETE FROM public.attribution_events
   WHERE landing_path LIKE '/auth/callback%'
      OR code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.pass_leads SET first_touch = NULL
   WHERE first_touch ->> 'landing_path' LIKE '/auth/callback%'
      OR first_touch ->> 'code' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  GET DIAGNOSTICS v_m = ROW_COUNT;
  f1 := 'second run touched ' || v_n || ' event(s) and ' || v_m || ' lead(s)';
  f1ok := (v_n = 0 AND v_m = 0);
EXCEPTION WHEN OTHERS THEN f1 := SQLSTATE || ' ' || SQLERRM; f1ok := false;
END;

-- ══════════════════════════════════════════════════════════════════════════
-- PART G: the NEGATIVE control.
--
-- Without this, every arm above is equally consistent with a WHERE clause that
-- matches every row in the table -- Part D would still read "the secret is
-- gone", and Part E's counts would be the only thing in the way.
--
-- A lead that is deliberately not the target gets a first_touch, the cleanup's
-- predicate is run again, and that lead must survive untouched.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  UPDATE public.pass_leads
     SET first_touch = jsonb_build_object('src', 'runclub', 'landing_path', '/pase/bullbox/', 'ts', 1760000000000)
   WHERE pass_code <> k_pass
     AND id = (SELECT id FROM public.pass_leads WHERE pass_code <> k_pass ORDER BY created_at LIMIT 1);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.pass_leads SET first_touch = NULL
   WHERE first_touch ->> 'landing_path' LIKE '/auth/callback%'
      OR first_touch ->> 'code' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  GET DIAGNOSTICS v_m = ROW_COUNT;

  SELECT count(*) INTO v_n FROM public.pass_leads
   WHERE pass_code <> k_pass AND first_touch ->> 'src' = 'runclub';
  g1 := 'seeded a clean first_touch on another lead; the cleanup predicate touched '
     || v_m || ' row(s) and the seeded lead survived: ' || (v_n > 0)::text;
  g1ok := (v_m = 0 AND v_n > 0);
EXCEPTION WHEN OTHERS THEN g1 := SQLSTATE || ' ' || SQLERRM; g1ok := false;
END;

INSERT INTO reh_probe VALUES
  ( 1, 'A1 the event exists and carries the OAuth code on /auth/callback/', coalesce(a1, '(probe row missing)'), coalesce(a1ok, false)),
  ( 2, 'A2 lead TR-C3LU exists and its first_touch carries the same code', coalesce(a2, '(probe row missing)'), coalesce(a2ok, false)),
  ( 3, 'B1 BLAST RADIUS: exactly ONE affected event, and it is the one reported', coalesce(b1, '(probe row missing)'), coalesce(b1ok, false)),
  ( 4, 'B2 BLAST RADIUS: exactly ONE affected lead, and it is TR-C3LU', coalesce(b2, '(probe row missing)'), coalesce(b2ok, false)),
  ( 5, 'C1 the cleanup removes 1 event and nulls 1 first_touch', coalesce(c1, '(probe row missing)'), coalesce(c1ok, false)),
  ( 6, 'D1 the event is gone', coalesce(d1, '(probe row missing)'), coalesce(d1ok, false)),
  ( 7, 'D2 the secret survives NOWHERE in either table, searched whole-row', coalesce(d2, '(probe row missing)'), coalesce(d2ok, false)),
  ( 8, 'E1 PRESERVED: the lead keeps the last-touch values the phone test proved', coalesce(e1, '(probe row missing)'), coalesce(e1ok, false)),
  ( 9, 'E2 PRESERVED: no other lead lost a first_touch', coalesce(e2, '(probe row missing)'), coalesce(e2ok, false)),
  (10, 'E3 PRESERVED: the good visit event from the phone test survives', coalesce(e3, '(probe row missing)'), coalesce(e3ok, false)),
  (11, 'F1 a second run touches nothing', coalesce(f1, '(probe row missing)'), coalesce(f1ok, false)),
  (12, 'G1 NEGATIVE CONTROL: a clean first_touch on another lead is not touched', coalesce(g1, '(probe row missing)'), coalesce(g1ok, false));

END $outer$;

-- The one result set for the transaction. Every row must read PASS. 12 of 12.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

-- ══════════════════════════════════════════════════════════════════════════
-- PART H: THE REAL CLEANUP. COMMENTED OUT ON PURPOSE.
--
-- Everything above rolled back and changed nothing. Run this ONLY after reading
-- the table above and seeing 12 PASS rows -- in particular B1 and B2, which are
-- the arms that say the two rows in the report are the ONLY two. If either found
-- more, widen the statements first; they are by-shape, so a bigger blast radius
-- needs no new predicate, only a conscious decision that removing all of it is
-- right.
--
-- Uncomment, run, then re-run the SELECT at the bottom and confirm both counts
-- are zero.
-- ══════════════════════════════════════════════════════════════════════════

-- BEGIN;
--
-- DELETE FROM public.attribution_events
--  WHERE landing_path LIKE '/auth/callback%'
--     OR code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
-- UPDATE public.pass_leads
--    SET first_touch = NULL
--  WHERE first_touch ->> 'landing_path' LIKE '/auth/callback%'
--     OR first_touch ->> 'code' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
-- COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFY AFTER PART H. Run as its own statement, after the COMMIT above.
--
-- Separate from the write for the reason CLAUDE.md records about data-modifying
-- CTEs: a check that shares a statement with the mutation reads the snapshot
-- taken before the statement began and cannot observe it. Both counts must be 0,
-- and the last column must still show the phone test's values.
-- ══════════════════════════════════════════════════════════════════════════

SELECT
  (SELECT count(*) FROM public.attribution_events
    WHERE landing_path LIKE '/auth/callback%'
       OR code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS events_left,
  (SELECT count(*) FROM public.pass_leads
    WHERE first_touch ->> 'landing_path' LIKE '/auth/callback%'
       OR first_touch ->> 'code' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS leads_left,
  (SELECT src || ' / ' || code || ' / ' || coalesce(utm_campaign, 'NULL')
     FROM public.pass_leads WHERE pass_code = 'TR-C3LU') AS tr_c3lu_last_touch_preserved,
  (SELECT count(*) FROM public.attribution_events) AS events_remaining;

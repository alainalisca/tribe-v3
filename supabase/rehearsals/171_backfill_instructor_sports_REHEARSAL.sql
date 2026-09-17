-- 171_rehearsal.sql
--
-- Rehearsal for 171_backfill_instructor_sports.sql. Run in the Supabase SQL
-- editor. Everything happens inside BEGIN ... ROLLBACK, so production is not
-- modified. Returns ONE result set of PASS/FAIL rows.
--
-- WHAT THIS PROVES THAT AN APPLY CANNOT.
-- 171's DO block is atomic and non-destructive, so simply applying it is
-- already safe: a syntax error or a failed guard rolls the whole thing back
-- and writes nothing. What an apply can NEVER tell you is whether the guard
-- would have fired if something HAD drifted -- a guard that passes proves only
-- that it did not raise, not that it can. That is the same vacuity question a
-- test answers by mutation, so this file mutates the data under the guard and
-- asserts it aborts. Parts B and C are the whole point of running this.
--
-- Part A  the migration body runs clean and updates exactly 3 rows
-- Part B  guard non-vacuity, DRIFT arm: change one target's specialties, the
--         guard must abort with the drift message
-- Part C  guard non-vacuity, COUNT arm: give one target a sports array, the
--         guard must abort with the count message
-- Part D  idempotence: a second run takes the no-op branch, not the abort
-- Part E  specialties untouched on all four, and Walter White still empty
--
-- Per feedback-rehearsal-scaffolding-must-outlive: every finding is captured
-- into a plpgsql variable declared OUTSIDE the subtransaction that produces it,
-- and written to the probe table only after that subtransaction has unwound.
-- Every probe read is COALESCEd, so a missing row reads as a named failure
-- rather than a blank that looks like a wrong value.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq    integer,
  check_name text,
  detail text,
  passed boolean
) ON COMMIT DROP;

DO $outer$
DECLARE
  k_salomon constant uuid := '307cf7fa-a12e-468d-83f5-1a1cb82226e7';
  k_bullbox constant uuid := '7c4e29a2-7689-4e83-8787-113ebd2c6a42';
  k_dennis  constant uuid := '804f2c28-9851-4f7f-95ce-4bf5ce85caca';
  k_walter  constant uuid := '673834b4-d9be-4782-86c9-ff27376233a7';

  -- Declared out here so they survive the subtransactions that set them.
  a_ran_clean      boolean := false;
  a_error          text    := '(never ran)';
  a_salomon        text    := '(not captured)';
  a_bullbox        text    := '(not captured)';
  a_dennis         text    := '(not captured)';
  a_walter_count   integer := -1;
  a_spec_salomon   text    := '(not captured)';
  a_spec_dennis    text    := '(not captured)';

  b_raised         boolean := false;
  b_sqlstate       text    := '(none)';
  b_message        text    := '(none)';

  c_raised         boolean := false;
  c_sqlstate       text    := '(none)';
  c_message        text    := '(none)';

  d_second_noop    boolean := false;
  d_error          text    := '(never ran)';
  d_sports_after   text    := '(not captured)';

  v_expected constant integer := 3;
  v_found    integer;
  v_drifted  integer;
  v_updated  integer;
BEGIN

  -- ── Part A: the migration body, verbatim in behaviour, then unwind ──────
  BEGIN
    SELECT count(*) INTO v_found
    FROM public.users u
    WHERE u.id IN (k_salomon, k_bullbox, k_dennis)
      AND coalesce(array_length(u.sports, 1), 0) = 0;

    IF v_found <> v_expected THEN
      RAISE EXCEPTION '171 ABORTED: expected % but found %', v_expected, v_found;
    END IF;

    SELECT count(*) INTO v_drifted
    FROM public.users u
    WHERE (u.id = k_salomon AND u.specialties IS DISTINCT FROM
            ARRAY['Boxeo','Muay Thai & kickboxing','fitness & funcional - Entrenamiento deportivo & Recreativo.']::text[])
       OR (u.id = k_bullbox AND u.specialties IS DISTINCT FROM ARRAY['CrossFit','HYROX']::text[])
       OR (u.id = k_dennis  AND u.specialties IS DISTINCT FROM ARRAY['Boxing','Dior']::text[]);

    IF v_drifted <> 0 THEN
      RAISE EXCEPTION '171 ABORTED: % targets drifted', v_drifted;
    END IF;

    UPDATE public.users SET sports = ARRAY['Boxing','Muay Thai','Kickboxing']::text[] WHERE id = k_salomon;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN RAISE EXCEPTION 'salomon rowcount %', v_updated; END IF;

    UPDATE public.users SET sports = ARRAY['CrossFit','HYROX']::text[] WHERE id = k_bullbox;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN RAISE EXCEPTION 'bullbox rowcount %', v_updated; END IF;

    UPDATE public.users SET sports = ARRAY['Boxing']::text[] WHERE id = k_dennis;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN RAISE EXCEPTION 'dennis rowcount %', v_updated; END IF;

    -- Capture the post-state into variables BEFORE unwinding. A probe INSERT
    -- here would roll back with the UPDATEs and the finding would vanish.
    SELECT array_to_string(sports, ',') INTO a_salomon FROM public.users WHERE id = k_salomon;
    SELECT array_to_string(sports, ',') INTO a_bullbox FROM public.users WHERE id = k_bullbox;
    SELECT array_to_string(sports, ',') INTO a_dennis  FROM public.users WHERE id = k_dennis;
    SELECT coalesce(array_length(sports, 1), 0) INTO a_walter_count FROM public.users WHERE id = k_walter;
    SELECT array_to_string(specialties, ' | ') INTO a_spec_salomon FROM public.users WHERE id = k_salomon;
    SELECT array_to_string(specialties, ' | ') INTO a_spec_dennis  FROM public.users WHERE id = k_dennis;

    a_ran_clean := true;
    a_error := '(none)';

    RAISE EXCEPTION 'REHEARSAL_UNWIND_A';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND_A' THEN
      a_ran_clean := false;
      a_error := SQLSTATE || ' ' || SQLERRM;
    END IF;
  END;

  INSERT INTO reh_probe VALUES
    (1, 'A1 migration body runs clean', coalesce(a_error, '(null)'), coalesce(a_ran_clean, false)),
    (2, 'A2 Salomon gets the three canonical sports', coalesce(a_salomon, '(probe row missing)'),
        coalesce(a_salomon, '') = 'Boxing,Muay Thai,Kickboxing'),
    (3, 'A3 BullBox gets CrossFit,HYROX (was a NULL column, not an empty array)', coalesce(a_bullbox, '(probe row missing)'),
        coalesce(a_bullbox, '') = 'CrossFit,HYROX'),
    (4, 'A4 Dennis gets Boxing only; Dior maps to nothing', coalesce(a_dennis, '(probe row missing)'),
        coalesce(a_dennis, '') = 'Boxing'),
    (5, 'A5 Walter White is NOT updated (the control)', 'sports length = ' || coalesce(a_walter_count, -1)::text,
        coalesce(a_walter_count, -1) = 0),
    (6, 'A6 Salomon specialties untouched', coalesce(a_spec_salomon, '(probe row missing)'),
        coalesce(a_spec_salomon, '') = 'Boxeo | Muay Thai & kickboxing | fitness & funcional - Entrenamiento deportivo & Recreativo.'),
    (7, 'A7 Dennis specialties untouched, Dior still present', coalesce(a_spec_dennis, '(probe row missing)'),
        coalesce(a_spec_dennis, '') = 'Boxing | Dior');

  -- ── Part B: guard non-vacuity, DRIFT arm ────────────────────────────────
  -- Change Salomon's free text, then run the guard. It must abort. If it does
  -- not, the drift check is decorative and a stale mapping would be applied.
  BEGIN
    UPDATE public.users SET specialties = ARRAY['Something else entirely']::text[] WHERE id = k_salomon;

    SELECT count(*) INTO v_found
    FROM public.users u
    WHERE u.id IN (k_salomon, k_bullbox, k_dennis)
      AND coalesce(array_length(u.sports, 1), 0) = 0;

    IF v_found <> v_expected THEN
      RAISE EXCEPTION 'wrong arm: count guard fired, not the drift guard';
    END IF;

    SELECT count(*) INTO v_drifted
    FROM public.users u
    WHERE (u.id = k_salomon AND u.specialties IS DISTINCT FROM
            ARRAY['Boxeo','Muay Thai & kickboxing','fitness & funcional - Entrenamiento deportivo & Recreativo.']::text[])
       OR (u.id = k_bullbox AND u.specialties IS DISTINCT FROM ARRAY['CrossFit','HYROX']::text[])
       OR (u.id = k_dennis  AND u.specialties IS DISTINCT FROM ARRAY['Boxing','Dior']::text[]);

    IF v_drifted <> 0 THEN
      RAISE EXCEPTION '171 ABORTED: % of the 3 targets has specialties that differ from what was measured', v_drifted;
    END IF;

    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    b_sqlstate := SQLSTATE;
    b_message  := SQLERRM;
    b_raised   := SQLERRM LIKE '171 ABORTED:%differ from what was measured%';
  END;

  INSERT INTO reh_probe VALUES
    (8, 'B1 drift arm aborts when a target''s specialties change',
        coalesce(b_message, '(probe row missing)'), coalesce(b_raised, false));

  -- ── Part C: guard non-vacuity, COUNT arm ────────────────────────────────
  -- Give Dennis a sports array so only 2 targets need the backfill. The count
  -- guard must abort rather than quietly backfilling the other two.
  BEGIN
    UPDATE public.users SET sports = ARRAY['Yoga']::text[] WHERE id = k_dennis;

    SELECT count(*) INTO v_found
    FROM public.users u
    WHERE u.id IN (k_salomon, k_bullbox, k_dennis)
      AND coalesce(array_length(u.sports, 1), 0) = 0;

    IF v_found = 0 THEN
      RAISE EXCEPTION 'wrong arm: took the no-op branch';
    END IF;

    IF v_found <> v_expected THEN
      RAISE EXCEPTION
        '171 ABORTED: expected % instructor rows still needing a sports backfill but found %',
        v_expected, v_found;
    END IF;

    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    c_sqlstate := SQLSTATE;
    c_message  := SQLERRM;
    c_raised   := SQLERRM LIKE '171 ABORTED: expected 3 instructor rows%but found 2%';
  END;

  INSERT INTO reh_probe VALUES
    (9, 'C1 count arm aborts at 2 of 3 rather than partially backfilling',
        coalesce(c_message, '(probe row missing)'), coalesce(c_raised, false));

  -- ── Part D: idempotence ─────────────────────────────────────────────────
  -- Apply, then apply again. The second run must take the no-op branch, which
  -- is what makes a rerun and a from-scratch rebuild both succeed.
  BEGIN
    UPDATE public.users SET sports = ARRAY['Boxing','Muay Thai','Kickboxing']::text[] WHERE id = k_salomon;
    UPDATE public.users SET sports = ARRAY['CrossFit','HYROX']::text[] WHERE id = k_bullbox;
    UPDATE public.users SET sports = ARRAY['Boxing']::text[] WHERE id = k_dennis;

    SELECT count(*) INTO v_found
    FROM public.users u
    WHERE u.id IN (k_salomon, k_bullbox, k_dennis)
      AND coalesce(array_length(u.sports, 1), 0) = 0;

    d_second_noop := (v_found = 0);
    d_error := '(none)';
    SELECT array_to_string(sports, ',') INTO d_sports_after FROM public.users WHERE id = k_salomon;

    RAISE EXCEPTION 'REHEARSAL_UNWIND_D';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND_D' THEN
      d_error := SQLSTATE || ' ' || SQLERRM;
      d_second_noop := false;
    END IF;
  END;

  INSERT INTO reh_probe VALUES
    (10, 'D1 a second run finds 0 targets and takes the no-op branch',
         coalesce(d_error, '(null)'), coalesce(d_second_noop, false)),
    (11, 'D2 a rerun does not change what the first run wrote',
         coalesce(d_sports_after, '(probe row missing)'),
         coalesce(d_sports_after, '') = 'Boxing,Muay Thai,Kickboxing');

END $outer$;

-- ── Part E: nothing above escaped its subtransaction ──────────────────────
-- Every mutation was unwound, so production state must read exactly as
-- measured. If any of these fail, the rehearsal itself leaked.
-- Driven off a VALUES list with a LEFT JOIN, not off `FROM users WHERE id=...`.
-- A bare INSERT..SELECT inserts ZERO rows when the target row is missing, so
-- the check would silently disappear from the output rather than fail, and a
-- 15-row result set would still look like a clean run to anyone not counting.
INSERT INTO reh_probe
SELECT
  t.seq,
  t.check_name,
  coalesce(
    CASE WHEN u.id IS NULL THEN '(USER ROW NOT FOUND)'
         ELSE 'sports=' || coalesce(u.sports::text, 'NULL')
              || '  specialties=' || coalesce(array_to_string(u.specialties, ' | '), 'NULL')
    END, '(probe row missing)'),
  coalesce(
    CASE
      WHEN u.id IS NULL THEN false
      WHEN t.seq = 12 THEN coalesce(array_length(u.sports, 1), 0) = 0
      WHEN t.seq = 13 THEN coalesce(u.specialties, '{}'::text[])
             = ARRAY['Boxeo','Muay Thai & kickboxing','fitness & funcional - Entrenamiento deportivo & Recreativo.']::text[]
      WHEN t.seq = 14 THEN u.sports IS NULL
      WHEN t.seq = 15 THEN coalesce(u.specialties, '{}'::text[]) = ARRAY['Boxing','Dior']::text[]
      WHEN t.seq = 16 THEN coalesce(array_length(u.sports, 1), 0) = 0
             AND coalesce(u.specialties, '{}'::text[]) = ARRAY['Meditation']::text[]
    END, false)
FROM (VALUES
  (12, '307cf7fa-a12e-468d-83f5-1a1cb82226e7'::uuid, 'E1 Salomon sports still empty on the live row'),
  (13, '307cf7fa-a12e-468d-83f5-1a1cb82226e7'::uuid, 'E2 Salomon specialties still as measured'),
  (14, '7c4e29a2-7689-4e83-8787-113ebd2c6a42'::uuid, 'E3 BullBox sports still NULL, not an empty array'),
  (15, '804f2c28-9851-4f7f-95ce-4bf5ce85caca'::uuid, 'E4 Dennis specialties still hold Dior'),
  (16, '673834b4-d9be-4782-86c9-ff27376233a7'::uuid, 'E5 Walter White untouched: Meditation, no sports')
) AS t(seq, user_id, check_name)
LEFT JOIN public.users u ON u.id = t.user_id;

-- The one result set. Every row must read PASS. 16 of 16.
SELECT
  seq,
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result,
  check_name,
  detail
FROM reh_probe
ORDER BY seq;

ROLLBACK;

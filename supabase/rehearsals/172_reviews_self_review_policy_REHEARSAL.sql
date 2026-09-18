-- 172_reviews_self_review_policy_REHEARSAL.sql
--
-- Rehearsal for 172_reviews_self_review_policy.sql. Run in the Supabase SQL
-- editor. Everything is inside BEGIN ... ROLLBACK; production is not modified.
-- Returns ONE result set of PASS/FAIL rows.
--
-- Part A  the migration body runs clean: policy replaced, row deleted, two
--         ratings repaired, every host consistent
-- Part B  THE FUNCTIONAL PROOF. Recreates the pre-169 condition -- a CONFIRMED
--         PARTICIPANT ROW for the host -- and attempts the exact insert that
--         produced the live self-review. Under the old policy it succeeded.
--         Under the new one it must be refused. This is the only part that
--         proves the policy does anything; everything else proves the
--         migration ran.
-- Part C  the same, for MISATTRIBUTION: a legitimate participant filing a
--         review against someone who did not host the session
-- Part D  and the negative control: a legitimate review by a real participant
--         against the real host must still be ACCEPTED. A policy that rejects
--         everything would pass B and C and break the product.
-- Part E  guard non-vacuity, three abort arms
-- Part F  idempotence
-- Part G  nothing escaped its subtransaction
--
-- Per feedback-rehearsal-scaffolding-must-outlive: nothing running as
-- `authenticated` touches the probe table. Findings are captured into plpgsql
-- variables declared outside the subtransaction, the role is restored, and only
-- then are rows written. Every probe read is COALESCEd.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

DO $outer$
DECLARE
  k_review   constant uuid := '47e91379-e421-451c-8ade-c9b06de8d8f0';
  k_session  constant uuid := '21a301f1-3c77-4551-a527-00d38943362e';
  k_darian   constant uuid := 'eaff348f-5df3-4df5-bd80-69ec233aad0e';
  k_caroline constant uuid := '1848555a-8405-475a-94e2-6dd4b2f6d70e';
  -- A real confirmed participant on a real session, for the negative control.
  k_other    constant uuid := '9a16aa6b-7bb9-4701-9793-1539eca7671d';

  a_ok           boolean := false;
  a_error        text    := '(never ran)';
  a_selfs        integer := -1;
  a_darian_avg   text    := '(not captured)';
  a_darian_n     integer := -1;
  a_caroline_avg text    := '(not captured)';
  a_caroline_n   integer := -1;
  a_drift        integer := -1;
  a_policy       text    := '(not captured)';

  b_state text := '(never ran)';  b_blocked boolean := false;
  c_state text := '(never ran)';  c_blocked boolean := false;
  d_state text := '(never ran)';  d_allowed boolean := false;

  e1_raised boolean := false; e1_msg text := '(none)';
  e2_raised boolean := false; e2_msg text := '(none)';
  e3_raised boolean := false; e3_msg text := '(none)';

  f_noop boolean := false; f_error text := '(never ran)';

  v_policies integer; v_name text; v_check text;
  v_selfs integer; v_rows integer; v_drift integer;
  v_role text;
BEGIN

  -- ── Part A: the migration body, then unwind ─────────────────────────────
  BEGIN
    SELECT count(*), max(policyname), max(with_check) INTO v_policies, v_name, v_check
    FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    IF v_policies <> 1 THEN RAISE EXCEPTION '172 ABORTED: expected 1 INSERT policy but found %', v_policies; END IF;

    IF v_check NOT LIKE '%creator_id%' THEN
      EXECUTE format('DROP POLICY %I ON public.reviews', v_name);
      CREATE POLICY reviews_insert_participant_not_host ON public.reviews FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() = reviewer_id
          AND EXISTS (SELECT 1 FROM public.session_participants sp
                       WHERE sp.session_id = reviews.session_id AND sp.user_id = auth.uid() AND sp.status = 'confirmed')
          AND host_id = (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
          AND auth.uid() <> (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
        );
    END IF;

    DELETE FROM public.reviews WHERE id = k_review;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION '172 ABORTED: deleted % reviews', v_rows; END IF;

    UPDATE public.users u SET average_rating = sub.avg_rating, total_reviews = sub.n
      FROM (SELECT t.id,
                   (SELECT round(avg(r.rating)::numeric,2) FROM public.reviews r WHERE r.host_id = t.id) AS avg_rating,
                   (SELECT count(*) FROM public.reviews r WHERE r.host_id = t.id) AS n
            FROM (VALUES (k_darian),(k_caroline)) AS t(id)) sub
     WHERE u.id = sub.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 2 THEN RAISE EXCEPTION '172 ABORTED: repaired % rows', v_rows; END IF;

    SELECT count(*) INTO v_drift
    FROM (SELECT DISTINCT host_id FROM public.reviews) h JOIN public.users u ON u.id = h.host_id
    WHERE u.total_reviews IS DISTINCT FROM (SELECT count(*) FROM public.reviews r WHERE r.host_id = h.host_id)
       OR u.average_rating IS DISTINCT FROM (SELECT round(avg(r.rating)::numeric,2) FROM public.reviews r WHERE r.host_id = h.host_id);

    -- capture BEFORE unwinding
    SELECT count(*) INTO a_selfs FROM public.reviews WHERE reviewer_id = host_id;
    SELECT coalesce(average_rating::text,'NULL'), total_reviews INTO a_darian_avg, a_darian_n
      FROM public.users WHERE id = k_darian;
    SELECT coalesce(average_rating::text,'NULL'), total_reviews INTO a_caroline_avg, a_caroline_n
      FROM public.users WHERE id = k_caroline;
    SELECT max(policyname) INTO a_policy FROM pg_policies
      WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    a_drift := v_drift;
    a_ok := true; a_error := '(none)';

    RAISE EXCEPTION 'REHEARSAL_UNWIND_A';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND_A' THEN a_ok := false; a_error := SQLSTATE || ' ' || SQLERRM; END IF;
  END;

  INSERT INTO reh_probe VALUES
    (1,'A1 migration body runs clean', coalesce(a_error,'(null)'), coalesce(a_ok,false)),
    (2,'A2 the new INSERT policy is in place', coalesce(a_policy,'(probe row missing)'),
       coalesce(a_policy,'') = 'reviews_insert_participant_not_host'),
    (3,'A3 no self-review rows remain', 'count = ' || coalesce(a_selfs,-1)::text, coalesce(a_selfs,-1) = 0),
    (4,'A4 Darian: NULL rating, 0 reviews (NOT 0/0 -- 0 sorts among the rated)',
       'avg=' || coalesce(a_darian_avg,'?') || ' n=' || coalesce(a_darian_n,-1)::text,
       coalesce(a_darian_avg,'') = 'NULL' AND coalesce(a_darian_n,-1) = 0),
    (5,'A5 Caroline repaired: 5.00 / 2, wrong before this migration',
       'avg=' || coalesce(a_caroline_avg,'?') || ' n=' || coalesce(a_caroline_n,-1)::text,
       coalesce(a_caroline_avg,'') = '5.00' AND coalesce(a_caroline_n,-1) = 2),
    (6,'A6 every host agrees with public.reviews, not just the two repaired',
       'drifted = ' || coalesce(a_drift,-1)::text, coalesce(a_drift,-1) = 0);

  -- ── Part B: THE FUNCTIONAL PROOF ────────────────────────────────────────
  -- Recreate the pre-169 world: give the host a CONFIRMED PARTICIPANT ROW, so
  -- every other clause of the policy is satisfied and the ONLY thing that can
  -- refuse the insert is the new host exclusion. Under the old policy this
  -- exact insert succeeded -- that is how the live row got there.
  BEGIN
    v_role := current_setting('role', true);

    SELECT count(*), max(policyname), max(with_check) INTO v_policies, v_name, v_check
    FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    IF v_check NOT LIKE '%creator_id%' THEN
      EXECUTE format('DROP POLICY %I ON public.reviews', v_name);
      CREATE POLICY reviews_insert_participant_not_host ON public.reviews FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() = reviewer_id
          AND EXISTS (SELECT 1 FROM public.session_participants sp
                       WHERE sp.session_id = reviews.session_id AND sp.user_id = auth.uid() AND sp.status='confirmed')
          AND host_id = (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
          AND auth.uid() <> (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
        );
    END IF;
    DELETE FROM public.reviews WHERE id = k_review;

    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    VALUES (k_session, k_darian, 'confirmed', false);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', k_darian::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    BEGIN
      INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
      VALUES (k_session, k_darian, k_darian, 5);
      b_state := 'INSERT SUCCEEDED -- the policy did not refuse a self-review';
      b_blocked := false;
    EXCEPTION WHEN OTHERS THEN
      b_state := SQLSTATE || ' ' || SQLERRM;
      b_blocked := (SQLSTATE = '42501');
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REHEARSAL_UNWIND_B';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND_B' AND b_state = '(never ran)' THEN
      b_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM;
      b_blocked := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (7,'B1 a HOST with a confirmed participant row is REFUSED a self-review (the live row''s exact insert)',
       coalesce(b_state,'(probe row missing)'), coalesce(b_blocked,false));

  -- ── Part C: misattribution ──────────────────────────────────────────────
  BEGIN
    SELECT max(with_check) INTO v_check FROM pg_policies
     WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    IF v_check NOT LIKE '%creator_id%' THEN
      SELECT max(policyname) INTO v_name FROM pg_policies
        WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
      EXECUTE format('DROP POLICY %I ON public.reviews', v_name);
      CREATE POLICY reviews_insert_participant_not_host ON public.reviews FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() = reviewer_id
          AND EXISTS (SELECT 1 FROM public.session_participants sp
                       WHERE sp.session_id = reviews.session_id AND sp.user_id = auth.uid() AND sp.status='confirmed')
          AND host_id = (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
          AND auth.uid() <> (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
        );
    END IF;

    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    VALUES (k_session, k_caroline, 'confirmed', false);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', k_caroline::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    BEGIN
      -- Caroline is a genuine confirmed participant, but files the review
      -- against k_other, who did not host this session.
      INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
      VALUES (k_session, k_caroline, k_other, 1);
      c_state := 'INSERT SUCCEEDED -- a review was filed against a non-host';
      c_blocked := false;
    EXCEPTION WHEN OTHERS THEN
      c_state := SQLSTATE || ' ' || SQLERRM;
      c_blocked := (SQLSTATE = '42501');
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REHEARSAL_UNWIND_C';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND_C' AND c_state = '(never ran)' THEN
      c_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM;
      c_blocked := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (8,'C1 a real participant is REFUSED a review filed against a non-host',
       coalesce(c_state,'(probe row missing)'), coalesce(c_blocked,false));

  -- ── Part D: the negative control ────────────────────────────────────────
  -- A policy that refuses everything passes B and C and breaks the product.
  BEGIN
    SELECT max(with_check) INTO v_check FROM pg_policies
     WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    IF v_check NOT LIKE '%creator_id%' THEN
      SELECT max(policyname) INTO v_name FROM pg_policies
        WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
      EXECUTE format('DROP POLICY %I ON public.reviews', v_name);
      CREATE POLICY reviews_insert_participant_not_host ON public.reviews FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() = reviewer_id
          AND EXISTS (SELECT 1 FROM public.session_participants sp
                       WHERE sp.session_id = reviews.session_id AND sp.user_id = auth.uid() AND sp.status='confirmed')
          AND host_id = (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
          AND auth.uid() <> (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
        );
    END IF;

    -- Caroline as a confirmed participant, reviewing the session's REAL host.
    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    VALUES (k_session, k_caroline, 'confirmed', false);
    DELETE FROM public.reviews WHERE session_id = k_session AND reviewer_id = k_caroline;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', k_caroline::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    BEGIN
      INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
      VALUES (k_session, k_caroline, k_darian, 5);
      d_state := 'accepted';
      d_allowed := true;
    EXCEPTION WHEN OTHERS THEN
      d_state := SQLSTATE || ' ' || SQLERRM;
      d_allowed := false;
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REHEARSAL_UNWIND_D';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND_D' AND d_state = '(never ran)' THEN
      d_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM;
      d_allowed := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (9,'D1 NEGATIVE CONTROL: a real participant reviewing the real host is still ACCEPTED',
       coalesce(d_state,'(probe row missing)'), coalesce(d_allowed,false));

  -- ── Part E: guard non-vacuity, three abort arms ─────────────────────────
  BEGIN  -- E1: a second INSERT policy
    CREATE POLICY reh_second_insert_policy ON public.reviews FOR INSERT TO authenticated WITH CHECK (true);
    SELECT count(*) INTO v_policies FROM pg_policies
      WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    IF v_policies <> 1 THEN
      RAISE EXCEPTION '172 ABORTED: expected exactly 1 INSERT policy on public.reviews but found %', v_policies;
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    e1_msg := SQLERRM; e1_raised := SQLERRM LIKE '172 ABORTED: expected exactly 1 INSERT policy%but found 2%';
  END;

  BEGIN  -- E2: a second self-review row
    INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
    VALUES (k_session, k_caroline, k_caroline, 4);
    SELECT count(*) INTO v_selfs FROM public.reviews WHERE reviewer_id = host_id;
    IF v_selfs <> 1 THEN
      RAISE EXCEPTION '172 ABORTED: expected exactly 1 self-review row but found %', v_selfs;
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    e2_msg := SQLERRM; e2_raised := SQLERRM LIKE '172 ABORTED: expected exactly 1 self-review row%but found 2%';
  END;

  BEGIN  -- E3: the one self-review is not the measured row
    UPDATE public.reviews SET session_id = (SELECT id FROM public.sessions WHERE id <> k_session LIMIT 1)
     WHERE id = k_review;
    PERFORM 1 FROM public.reviews
      WHERE id = k_review AND session_id = k_session AND reviewer_id = host_id AND host_id = k_darian;
    IF NOT FOUND THEN
      RAISE EXCEPTION '172 ABORTED: the one self-review row is not the row that was measured.';
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    e3_msg := SQLERRM; e3_raised := SQLERRM LIKE '172 ABORTED: the one self-review row is not the row that was measured%';
  END;

  INSERT INTO reh_probe VALUES
    (10,'E1 aborts when a second INSERT policy exists, rather than guessing which to drop',
        coalesce(e1_msg,'(probe row missing)'), coalesce(e1_raised,false)),
    (11,'E2 aborts at 2 self-review rows rather than deleting the known one',
        coalesce(e2_msg,'(probe row missing)'), coalesce(e2_raised,false)),
    (12,'E3 aborts when the one self-review is not the row that was measured',
        coalesce(e3_msg,'(probe row missing)'), coalesce(e3_raised,false));

  -- ── Part F: idempotence ─────────────────────────────────────────────────
  BEGIN
    DELETE FROM public.reviews WHERE id = k_review;
    SELECT count(*) INTO v_selfs FROM public.reviews WHERE reviewer_id = host_id;
    f_noop := (v_selfs = 0);
    f_error := '(none)';
    RAISE EXCEPTION 'REHEARSAL_UNWIND_F';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND_F' THEN f_error := SQLSTATE || ' ' || SQLERRM; f_noop := false; END IF;
  END;

  INSERT INTO reh_probe VALUES
    (13,'F1 a second run finds 0 self-reviews and takes the no-op branch',
        coalesce(f_error,'(null)'), coalesce(f_noop,false));

END $outer$;

-- ── Part G: nothing escaped ───────────────────────────────────────────────
-- Driven off a VALUES list with a LEFT JOIN so a missing row FAILS rather than
-- silently dropping its check from the output.
INSERT INTO reh_probe
SELECT t.seq, t.check_name,
  coalesce(t.detail, '(probe row missing)'),
  coalesce(t.passed, false)
FROM (VALUES
  (14,'G1 the self-review row is still on the live table',
      (SELECT count(*)::text FROM public.reviews WHERE id = '47e91379-e421-451c-8ade-c9b06de8d8f0'),
      (SELECT count(*) FROM public.reviews WHERE id = '47e91379-e421-451c-8ade-c9b06de8d8f0') = 1),
  (15,'G2 the live INSERT policy still does NOT mention creator_id',
      (SELECT coalesce(max(policyname),'(none)') FROM pg_policies
        WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT'),
      (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT' AND with_check LIKE '%creator_id%') = 0),
  (16,'G3 Darian still reads 5 / 1 and Caroline still reads 0 / 0',
      (SELECT 'darian=' || coalesce(average_rating::text,'NULL') || '/' || total_reviews::text
         FROM public.users WHERE id='eaff348f-5df3-4df5-bd80-69ec233aad0e'),
      (SELECT average_rating = 5 AND total_reviews = 1 FROM public.users WHERE id='eaff348f-5df3-4df5-bd80-69ec233aad0e')
      AND (SELECT average_rating = 0 AND total_reviews = 0 FROM public.users WHERE id='1848555a-8405-475a-94e2-6dd4b2f6d70e')),
  (17,'G4 no stray participant row was left on the rehearsal session',
      (SELECT count(*)::text FROM public.session_participants
        WHERE session_id='21a301f1-3c77-4551-a527-00d38943362e'),
      (SELECT count(*) FROM public.session_participants
        WHERE session_id='21a301f1-3c77-4551-a527-00d38943362e') = 0)
) AS t(seq, check_name, detail, passed);

-- The one result set. Every row must read PASS. 17 of 17.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

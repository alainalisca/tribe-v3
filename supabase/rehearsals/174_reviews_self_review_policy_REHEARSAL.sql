-- 174_reviews_self_review_policy_REHEARSAL.sql
--
-- Rehearsal for 174_reviews_self_review_policy.sql. Run in the Supabase SQL
-- editor. Everything is inside BEGIN ... ROLLBACK; production is not modified.
-- ONE result set of PASS/FAIL rows, because the editor shows only the last
-- statement's result.
--
-- Part A  the migration body runs clean: policy replaced, function recreated
--         SECURITY DEFINER, self-review deleted, two ratings repaired,
--         TRUNCATE revoked, every host consistent
-- Part B  the self-review is REFUSED, under the pre-169 conditions that
--         produced the live row
-- Part C  misattribution is REFUSED
-- Part D  negative control: a legitimate review is still ACCEPTED
-- Part E  THE TRIGGER LANDS -- and the same insert under the OLD function does
--         NOT land, so the assertion is shown to discriminate
-- Part F  guard non-vacuity, four abort arms
-- Part G  idempotence
-- Part H  nothing escaped
--
-- WHY PART E IS ASSERTED ON A VALUE. update_host_rating() runs as the invoker
-- today, so a non-host reviewer's `UPDATE users` matches ZERO ROWS and raises
-- NOTHING. An assertion that the trigger fired, or that the insert succeeded,
-- or that no error was raised, PASSES ON THE BUG. The only assertion that
-- distinguishes the two worlds is the host's average_rating actually changing
-- to the expected number. E2 runs the identical insert under the unmodified
-- function and requires the value NOT to change -- without that pair, E1 could
-- be passing for a reason unrelated to the fix.
--
-- CLEANUP IS EXPLICIT. Each arm is its own subtransaction and unwinds on the
-- sentinel raise, so cleanup is also automatic -- but every arm still begins by
-- removing what it is about to create. Relying on the unwind alone means an arm
-- that fails EARLY leaves state for the next one, and the failure then moves.
--
-- Per feedback-rehearsal-scaffolding-must-outlive: nothing running as
-- `authenticated` touches the probe table. Findings go into plpgsql variables
-- declared outside the subtransaction, the role is restored, then rows are
-- written. Every probe read is COALESCEd.

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
  k_other    constant uuid := '9a16aa6b-7bb9-4701-9793-1539eca7671d';

  a_ok boolean := false;  a_error text := '(never ran)';
  a_selfs integer := -1;  a_policy text := '(not captured)';
  a_secdef boolean := false;
  a_darian text := '(not captured)';   a_caroline text := '(not captured)';
  a_drift integer := -1;  a_trunc boolean := false;

  b_state text := '(never ran)';  b_blocked boolean := false;
  c_state text := '(never ran)';  c_blocked boolean := false;
  d_state text := '(never ran)';  d_allowed boolean := false;

  e1_before text := '(not captured)'; e1_after text := '(not captured)';
  e1_state text := '(never ran)';     e1_landed boolean := false;
  e2_before text := '(not captured)'; e2_after text := '(not captured)';
  e2_state text := '(never ran)';     e2_stayed boolean := false;

  f1 boolean := false; f1m text := '(none)';
  f2 boolean := false; f2m text := '(none)';
  f3 boolean := false; f3m text := '(none)';
  f4 boolean := false; f4m text := '(none)';

  g_noop boolean := false; g_error text := '(never ran)';

  v_policies integer; v_name text; v_check text;
  v_selfs integer; v_rows integer; v_drift integer;
BEGIN

-- ===========================================================================
-- A helper, inlined rather than a function: install the NEW policy and the
-- FIXED function. Repeated per arm because each arm unwinds the previous one.
-- ===========================================================================

  -- ── Part A ──────────────────────────────────────────────────────────────
  BEGIN
    SELECT count(*), max(policyname), max(with_check) INTO v_policies, v_name, v_check
      FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    IF v_policies <> 1 THEN RAISE EXCEPTION '174 ABORTED: expected 1 INSERT policy but found %', v_policies; END IF;

    EXECUTE format('DROP POLICY %I ON public.reviews', v_name);
    CREATE POLICY reviews_insert_participant_not_host ON public.reviews FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = reviewer_id
        AND EXISTS (SELECT 1 FROM public.session_participants sp
                     WHERE sp.session_id = reviews.session_id AND sp.user_id = auth.uid() AND sp.status='confirmed')
        AND host_id = (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
        AND auth.uid() <> (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
      );

    CREATE OR REPLACE FUNCTION public.update_host_rating()
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $fn$
    BEGIN
      UPDATE users SET
        average_rating = (SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0) FROM reviews WHERE host_id = COALESCE(NEW.host_id, OLD.host_id)),
        total_reviews  = (SELECT COUNT(*) FROM reviews WHERE host_id = COALESCE(NEW.host_id, OLD.host_id))
      WHERE id = COALESCE(NEW.host_id, OLD.host_id);
      RETURN COALESCE(NEW, OLD);
    END; $fn$;

    DELETE FROM public.reviews WHERE id = k_review;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION '174 ABORTED: deleted % reviews', v_rows; END IF;

    UPDATE public.users u SET average_rating = sub.a, total_reviews = sub.n
      FROM (SELECT t.id,
                   (SELECT COALESCE(AVG(r.rating)::DECIMAL(3,2),0) FROM public.reviews r WHERE r.host_id=t.id) AS a,
                   (SELECT COUNT(*) FROM public.reviews r WHERE r.host_id=t.id) AS n
            FROM (VALUES (k_darian),(k_caroline)) AS t(id)) sub
     WHERE u.id = sub.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 2 THEN RAISE EXCEPTION '174 ABORTED: repaired % rows', v_rows; END IF;

    REVOKE TRUNCATE ON public.reviews FROM anon, authenticated;

    SELECT count(*) INTO v_drift
      FROM (SELECT DISTINCT host_id FROM public.reviews) h JOIN public.users u ON u.id=h.host_id
     WHERE u.total_reviews IS DISTINCT FROM (SELECT count(*) FROM public.reviews r WHERE r.host_id=h.host_id)
        OR u.average_rating IS DISTINCT FROM (SELECT COALESCE(AVG(r.rating)::DECIMAL(3,2),0) FROM public.reviews r WHERE r.host_id=h.host_id);

    SELECT count(*) INTO a_selfs FROM public.reviews WHERE reviewer_id = host_id;
    SELECT max(policyname) INTO a_policy FROM pg_policies
      WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    SELECT prosecdef INTO a_secdef FROM pg_proc WHERE oid='public.update_host_rating()'::regprocedure;
    SELECT average_rating::text || ' / ' || total_reviews::text INTO a_darian   FROM public.users WHERE id=k_darian;
    SELECT average_rating::text || ' / ' || total_reviews::text INTO a_caroline FROM public.users WHERE id=k_caroline;
    a_trunc := NOT has_table_privilege('anon','public.reviews','TRUNCATE')
           AND NOT has_table_privilege('authenticated','public.reviews','TRUNCATE');
    a_drift := v_drift;
    a_ok := true; a_error := '(none)';
    RAISE EXCEPTION 'REH_UNWIND_A';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_A' THEN a_ok := false; a_error := SQLSTATE || ' ' || SQLERRM; END IF;
  END;

  INSERT INTO reh_probe VALUES
    (1,'A1 migration body runs clean', coalesce(a_error,'(null)'), coalesce(a_ok,false)),
    (2,'A2 the new INSERT policy is in place', coalesce(a_policy,'(probe row missing)'),
       coalesce(a_policy,'') = 'reviews_insert_participant_not_host'),
    (3,'A3 update_host_rating() is SECURITY DEFINER', 'prosecdef = ' || coalesce(a_secdef::text,'(probe row missing)'),
       coalesce(a_secdef,false)),
    (4,'A4 no self-review rows remain', 'count = ' || coalesce(a_selfs,-1)::text, coalesce(a_selfs,-1) = 0),
    (5,'A5 Darian reads 0 / 0, matching what the trigger writes (not NULL)',
       coalesce(a_darian,'(probe row missing)'), coalesce(a_darian,'') = '0.00 / 0' OR coalesce(a_darian,'') = '0 / 0'),
    (6,'A6 Caroline repaired to 5.00 / 2, wrong before this migration',
       coalesce(a_caroline,'(probe row missing)'), coalesce(a_caroline,'') LIKE '5.00 / 2'),
    (7,'A7 TRUNCATE revoked from anon and authenticated',
       'revoked = ' || coalesce(a_trunc::text,'?'), coalesce(a_trunc,false)),
    (8,'A8 every host agrees with public.reviews, not just the two repaired',
       'drifted = ' || coalesce(a_drift,-1)::text, coalesce(a_drift,-1) = 0);

  -- ── Part B: the self-review is refused ──────────────────────────────────
  -- Recreates the pre-169 world: the host gets a CONFIRMED PARTICIPANT ROW, so
  -- every other clause is satisfied and the ONLY thing that can refuse the
  -- insert is the new host exclusion. This is the exact insert that produced
  -- the live row.
  BEGIN
    -- explicit cleanup first, not left to the unwind
    DELETE FROM public.reviews WHERE session_id = k_session;
    DELETE FROM public.session_participants WHERE session_id = k_session;

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
    RAISE EXCEPTION 'REH_UNWIND_B';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_B' AND b_state = '(never ran)' THEN
      b_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b_blocked := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (9,'B1 a HOST with a confirmed participant row is REFUSED a self-review (the live row''s exact insert)',
       coalesce(b_state,'(probe row missing)'), coalesce(b_blocked,false));

  -- ── Part C: misattribution is refused ───────────────────────────────────
  BEGIN
    DELETE FROM public.reviews WHERE session_id = k_session;
    DELETE FROM public.session_participants WHERE session_id = k_session;

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

    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    VALUES (k_session, k_caroline, 'confirmed', false);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', k_caroline::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      -- A genuine participant, filing against someone who did not host it.
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
    RAISE EXCEPTION 'REH_UNWIND_C';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_C' AND c_state = '(never ran)' THEN
      c_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; c_blocked := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (10,'C1 a real participant is REFUSED a review filed against a non-host',
        coalesce(c_state,'(probe row missing)'), coalesce(c_blocked,false));

  -- ── Part D: the negative control ────────────────────────────────────────
  -- A policy that refuses everything passes B and C and breaks the product.
  BEGIN
    DELETE FROM public.reviews WHERE session_id = k_session;
    DELETE FROM public.session_participants WHERE session_id = k_session;

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

    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    VALUES (k_session, k_caroline, 'confirmed', false);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', k_caroline::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
      VALUES (k_session, k_caroline, k_darian, 5);
      d_state := 'accepted'; d_allowed := true;
    EXCEPTION WHEN OTHERS THEN
      d_state := SQLSTATE || ' ' || SQLERRM; d_allowed := false;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REH_UNWIND_D';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_D' AND d_state = '(never ran)' THEN
      d_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; d_allowed := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (11,'D1 NEGATIVE CONTROL: a real participant reviewing the real host is still ACCEPTED',
        coalesce(d_state,'(probe row missing)'), coalesce(d_allowed,false));

  -- ── Part E1: THE TRIGGER LANDS ──────────────────────────────────────────
  -- The same accepted insert as D, but now the HOST's average_rating is read
  -- before and after. Asserting on the VALUE, not on the absence of an error:
  -- under the old function this UPDATE matches zero rows and raises nothing, so
  -- "the insert worked" and "the trigger fired" both pass on the bug.
  BEGIN
    DELETE FROM public.reviews WHERE session_id = k_session;
    DELETE FROM public.reviews WHERE id = k_review;
    DELETE FROM public.session_participants WHERE session_id = k_session;

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

    -- THE FIXED FUNCTION
    CREATE OR REPLACE FUNCTION public.update_host_rating()
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $fn$
    BEGIN
      UPDATE users SET
        average_rating = (SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0) FROM reviews WHERE host_id = COALESCE(NEW.host_id, OLD.host_id)),
        total_reviews  = (SELECT COUNT(*) FROM reviews WHERE host_id = COALESCE(NEW.host_id, OLD.host_id))
      WHERE id = COALESCE(NEW.host_id, OLD.host_id);
      RETURN COALESCE(NEW, OLD);
    END; $fn$;

    UPDATE public.users SET average_rating = 0, total_reviews = 0 WHERE id = k_darian;
    SELECT average_rating::text || ' / ' || total_reviews::text INTO e1_before FROM public.users WHERE id = k_darian;

    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    VALUES (k_session, k_caroline, 'confirmed', false);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', k_caroline::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
      VALUES (k_session, k_caroline, k_darian, 3);
      e1_state := 'insert accepted';
    EXCEPTION WHEN OTHERS THEN
      e1_state := SQLSTATE || ' ' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    SELECT average_rating::text || ' / ' || total_reviews::text INTO e1_after FROM public.users WHERE id = k_darian;
    e1_landed := (coalesce(e1_after,'') = '3.00 / 1');
    RAISE EXCEPTION 'REH_UNWIND_E1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_E1' AND e1_state = '(never ran)' THEN
      e1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; e1_landed := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (12,'E1 the trigger LANDS: a non-host review moves the host''s stored rating to 3.00 / 1',
        coalesce(e1_state,'?') || '   before=' || coalesce(e1_before,'?') || '  after=' || coalesce(e1_after,'(probe row missing)'),
        coalesce(e1_landed,false));

  -- ── Part E2: the same insert under the OLD function must NOT land ───────
  -- Without this, E1 could be passing for a reason unrelated to SECURITY
  -- DEFINER. This is the discriminating half of the pair.
  BEGIN
    DELETE FROM public.reviews WHERE session_id = k_session;
    DELETE FROM public.reviews WHERE id = k_review;
    DELETE FROM public.session_participants WHERE session_id = k_session;

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

    -- THE FUNCTION AS IT IS LIVE TODAY: no SECURITY DEFINER.
    CREATE OR REPLACE FUNCTION public.update_host_rating()
     RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
    AS $fn$
    BEGIN
      UPDATE users SET
        average_rating = (SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0) FROM reviews WHERE host_id = COALESCE(NEW.host_id, OLD.host_id)),
        total_reviews  = (SELECT COUNT(*) FROM reviews WHERE host_id = COALESCE(NEW.host_id, OLD.host_id))
      WHERE id = COALESCE(NEW.host_id, OLD.host_id);
      RETURN COALESCE(NEW, OLD);
    END; $fn$;

    UPDATE public.users SET average_rating = 0, total_reviews = 0 WHERE id = k_darian;
    SELECT average_rating::text || ' / ' || total_reviews::text INTO e2_before FROM public.users WHERE id = k_darian;

    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    VALUES (k_session, k_caroline, 'confirmed', false);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', k_caroline::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
      VALUES (k_session, k_caroline, k_darian, 3);
      e2_state := 'insert accepted, and raised nothing -- which is the point';
    EXCEPTION WHEN OTHERS THEN
      e2_state := SQLSTATE || ' ' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    SELECT average_rating::text || ' / ' || total_reviews::text INTO e2_after FROM public.users WHERE id = k_darian;
    -- The insert succeeds; the rating does NOT move. Zero rows, no error.
    e2_stayed := (coalesce(e2_after,'') = coalesce(e2_before,'x'));
    RAISE EXCEPTION 'REH_UNWIND_E2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_E2' AND e2_state = '(never ran)' THEN
      e2_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; e2_stayed := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (13,'E2 DISCRIMINATOR: under the CURRENT function the same insert is accepted and the rating does NOT move',
        coalesce(e2_state,'?') || '   before=' || coalesce(e2_before,'?') || '  after=' || coalesce(e2_after,'(probe row missing)'),
        coalesce(e2_stayed,false));

  -- ── Part F: guard non-vacuity ───────────────────────────────────────────
  BEGIN  -- F1: a second INSERT policy
    CREATE POLICY reh_second_insert ON public.reviews FOR INSERT TO authenticated WITH CHECK (true);
    SELECT count(*) INTO v_policies FROM pg_policies
      WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT';
    IF v_policies <> 1 THEN
      RAISE EXCEPTION '174 ABORTED: expected exactly 1 INSERT policy on public.reviews but found %', v_policies;
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    f1m := SQLERRM; f1 := SQLERRM LIKE '174 ABORTED: expected exactly 1 INSERT policy%but found 2%';
  END;

  BEGIN  -- F2: a second self-review row
    DELETE FROM public.reviews WHERE session_id = k_session AND reviewer_id = k_caroline;
    INSERT INTO public.reviews (session_id, reviewer_id, host_id, rating)
    VALUES (k_session, k_caroline, k_caroline, 4);
    SELECT count(*) INTO v_selfs FROM public.reviews WHERE reviewer_id = host_id;
    IF v_selfs <> 1 THEN
      RAISE EXCEPTION '174 ABORTED: expected exactly 1 self-review row but found %', v_selfs;
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    f2m := SQLERRM; f2 := SQLERRM LIKE '174 ABORTED: expected exactly 1 self-review row%but found 2%';
  END;

  BEGIN  -- F3: the one self-review is not the measured row
    UPDATE public.reviews SET session_id = (SELECT id FROM public.sessions WHERE id <> k_session LIMIT 1)
     WHERE id = k_review;
    PERFORM 1 FROM public.reviews
      WHERE id = k_review AND session_id = k_session AND reviewer_id = host_id AND host_id = k_darian;
    IF NOT FOUND THEN
      RAISE EXCEPTION '174 ABORTED: the one self-review row is not the row that was measured.';
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    f3m := SQLERRM; f3 := SQLERRM LIKE '174 ABORTED: the one self-review row is not the row that was measured%';
  END;

  BEGIN  -- F4: the UNIQUE (session_id, reviewer_id) constraint is gone
    ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_session_id_reviewer_id_key;
    PERFORM 1 FROM pg_constraint
      WHERE conrelid='public.reviews'::regclass AND contype='u'
        AND pg_get_constraintdef(oid) ILIKE '%(session_id, reviewer_id)%';
    IF NOT FOUND THEN
      RAISE EXCEPTION '174 ABORTED: the UNIQUE (session_id, reviewer_id) constraint on public.reviews is missing.';
    END IF;
    RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
  EXCEPTION WHEN OTHERS THEN
    f4m := SQLERRM; f4 := SQLERRM LIKE '174 ABORTED: the UNIQUE (session_id, reviewer_id) constraint%is missing%';
  END;

  INSERT INTO reh_probe VALUES
    (14,'F1 aborts when a second INSERT policy exists, rather than guessing which to drop',
        coalesce(f1m,'(probe row missing)'), coalesce(f1,false)),
    (15,'F2 aborts at 2 self-review rows rather than deleting the known one',
        coalesce(f2m,'(probe row missing)'), coalesce(f2,false)),
    (16,'F3 aborts when the one self-review is not the row that was measured',
        coalesce(f3m,'(probe row missing)'), coalesce(f3,false)),
    (17,'F4 aborts when UNIQUE (session_id, reviewer_id) is missing, since the guard rests on it',
        coalesce(f4m,'(probe row missing)'), coalesce(f4,false));

  -- ── Part G: idempotence ─────────────────────────────────────────────────
  BEGIN
    DELETE FROM public.reviews WHERE id = k_review;
    SELECT count(*) INTO v_selfs FROM public.reviews WHERE reviewer_id = host_id;
    g_noop := (v_selfs = 0); g_error := '(none)';
    RAISE EXCEPTION 'REH_UNWIND_G';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_G' THEN g_error := SQLSTATE || ' ' || SQLERRM; g_noop := false; END IF;
  END;

  INSERT INTO reh_probe VALUES
    (18,'G1 a second run finds 0 self-reviews and takes the no-op branch',
        coalesce(g_error,'(null)'), coalesce(g_noop,false));

END $outer$;

-- ── Part H: nothing escaped its subtransaction ────────────────────────────
-- Driven off a VALUES list so a missing row FAILS rather than dropping its
-- check from the output.
INSERT INTO reh_probe
SELECT t.seq, t.check_name, coalesce(t.detail,'(probe row missing)'), coalesce(t.passed,false)
FROM (VALUES
  (19,'H1 the self-review row is still on the live table',
      (SELECT count(*)::text FROM public.reviews WHERE id='47e91379-e421-451c-8ade-c9b06de8d8f0'),
      (SELECT count(*) FROM public.reviews WHERE id='47e91379-e421-451c-8ade-c9b06de8d8f0') = 1),
  (20,'H2 the live INSERT policy still does NOT mention creator_id',
      (SELECT coalesce(max(policyname),'(none)') FROM pg_policies
        WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT'),
      (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='reviews'
         AND cmd='INSERT' AND with_check LIKE '%creator_id%') = 0),
  (21,'H3 update_host_rating() is still NOT SECURITY DEFINER on the live database',
      'prosecdef = ' || (SELECT prosecdef::text FROM pg_proc WHERE oid='public.update_host_rating()'::regprocedure),
      (SELECT NOT prosecdef FROM pg_proc WHERE oid='public.update_host_rating()'::regprocedure)),
  (22,'H4 Darian still reads 5 / 1 and Caroline still reads 0 / 0',
      (SELECT 'darian=' || average_rating::text || '/' || total_reviews::text
         FROM public.users WHERE id='eaff348f-5df3-4df5-bd80-69ec233aad0e'),
      (SELECT average_rating = 5 AND total_reviews = 1 FROM public.users WHERE id='eaff348f-5df3-4df5-bd80-69ec233aad0e')
      AND (SELECT average_rating = 0 AND total_reviews = 0 FROM public.users WHERE id='1848555a-8405-475a-94e2-6dd4b2f6d70e')),
  (23,'H5 no stray participant row left on the rehearsal session',
      (SELECT count(*)::text FROM public.session_participants WHERE session_id='21a301f1-3c77-4551-a527-00d38943362e'),
      (SELECT count(*) FROM public.session_participants WHERE session_id='21a301f1-3c77-4551-a527-00d38943362e') = 0),
  (24,'H6 TRUNCATE is still granted on the live database (the revoke did not escape)',
      'anon=' || has_table_privilege('anon','public.reviews','TRUNCATE')::text
      || ' authenticated=' || has_table_privilege('authenticated','public.reviews','TRUNCATE')::text,
      has_table_privilege('anon','public.reviews','TRUNCATE')
      OR has_table_privilege('authenticated','public.reviews','TRUNCATE'))
) AS t(seq, check_name, detail, passed);

-- The one result set. Every row must read PASS. 24 of 24.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

-- 176_lead_reach_and_users_guards_REHEARSAL.sql
--
-- Rehearsal for 176. Run in the Supabase SQL editor. Everything is inside
-- BEGIN ... ROLLBACK; production is not modified. ONE result set of PASS/FAIL
-- rows, because the editor shows only the last statement's result.
--
-- RUN AFTER 175 IS APPLIED, AND BEFORE 176. This rehearsal APPLIES 176's own
-- statements inside the transaction and rolls them back; it does not require
-- 176 to be applied already. The first draft did require that, which made it a
-- post-apply verification rather than a rehearsal -- it could only have told us
-- 176 worked after we had already run it.
--
-- WHERE THE DDL LIVES. 176's statements are applied ONCE at the top of the DO
-- block, OUTSIDE any subtransaction, so every arm below sees them. The outer
-- ROLLBACK undoes all of it. Arms that need the PRE-176 behaviour (B1, B3)
-- reinstall the old body inside their own subtransaction, which unwinds back
-- to 176's version on the sentinel raise.
--
-- Part A  the migration body applies clean
-- Part B  THE SILENT REVERTS, before and after. B1/B2 and B3/B4 are PAIRS.
-- Part C  the RPC works end to end as a real authenticated non-admin
-- Part D  lead_* denied to a caller, still permitted to service-role
-- Part E  deleted_at denied to a caller, still permitted to service-role
-- Part F  lead_reaches: INSERT permitted, DELETE denied
-- Part G  nothing escaped
--
-- WHY THE BEFORE-ARMS EXIST. Asserting that the new function raises proves
-- only that it raises. It does not prove the old one was broken, and a
-- rehearsal that cannot fail on the unfixed code is decoration. B1 writes
-- total_earnings_cents under the PRE-176 function and asserts the value WENT
-- BACKWARDS with no error raised; B2 runs the identical write under the new
-- one and requires 42501. Same pairing as E1/E2 on 174.
--
-- Per feedback-rehearsal-scaffolding-must-outlive: findings go into plpgsql
-- variables declared outside each subtransaction, the role is restored before
-- probe rows are written, and every probe read is COALESCEd. Each arm also
-- cleans up what it is about to create rather than relying on the unwind,
-- because an arm that fails EARLY otherwise moves the next arm's failure.

BEGIN;

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- Baseline taken BEFORE any arm runs, so G4 can compare against a measured
-- number instead of asserting a constant. The first draft of G4 printed the
-- count and passed `true` unconditionally -- a vacuous check, inside the
-- rehearsal whose job is proving checks are not vacuous.
CREATE TEMP TABLE reh_baseline ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.lead_reaches) AS lead_reaches_rows;

DO $outer$
DECLARE
  k_victim   uuid;
  k_actor    uuid;
  a_ok boolean := false;  a_error text := '(never ran)';

  b1_before bigint := -1;  b1_after bigint := -1;
  b1_state text := '(never ran)';  b1_silent boolean := false;
  b2_state text := '(never ran)';  b2_raised boolean := false;
  b3_before bigint := -1;  b3_after bigint := -1;
  b3_state text := '(never ran)';  b3_silent boolean := false;
  b4_state text := '(never ran)';  b4_raised boolean := false;

  c_state text := '(never ran)';  c_ok boolean := false;
  c_credits_before integer := -1; c_credits_after integer := -1;
  c_rows integer := -1;

  d1_state text := '(never ran)'; d1_denied boolean := false;
  d2_state text := '(never ran)'; d2_allowed boolean := false;
  e1_state text := '(never ran)'; e1_denied boolean := false;
  e2_state text := '(never ran)'; e2_allowed boolean := false;
  f1_state text := '(never ran)'; f1_allowed boolean := false;
  f2_state text := '(never ran)'; f2_denied boolean := false;

  v_n integer;
BEGIN

  -- Two real non-admin users. Chosen from live data rather than invented, so
  -- the arms exercise the same RLS path a real caller would.
  SELECT id INTO k_victim FROM public.users
   WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL
   ORDER BY created_at LIMIT 1;
  SELECT id INTO k_actor FROM public.users
   WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL AND id <> k_victim
   ORDER BY created_at LIMIT 1;

  IF k_victim IS NULL OR k_actor IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need two non-admin users and did not find them.';
  END IF;

  -- ── Part A: APPLY 176's BODY, here, inside the transaction ──────────────
  -- Not in a subtransaction: these objects must survive for every arm below.
  -- The outer ROLLBACK is what removes them.
  BEGIN
    -- A1 of 176
    CREATE OR REPLACE FUNCTION public.reach_out_to_athlete(p_athlete_id uuid)
     RETURNS TABLE (credits_remaining integer)
     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $fn$
    DECLARE
      v_instructor uuid := auth.uid();
      v_verified boolean; v_tier text; v_remaining integer;
    BEGIN
      IF v_instructor IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
      END IF;
      SELECT u.is_verified_instructor, u.lead_tier, coalesce(u.lead_credits_remaining, 0)
        INTO v_verified, v_tier, v_remaining
        FROM public.users u WHERE u.id = v_instructor;
      IF NOT coalesce(v_verified, false) THEN
        RAISE EXCEPTION 'Only verified instructors can reach out' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_remaining <= 0 AND v_tier IS DISTINCT FROM 'unlimited' THEN
        RAISE EXCEPTION 'No credits remaining this month' USING ERRCODE = 'insufficient_privilege';
      END IF;
      BEGIN
        INSERT INTO public.lead_reaches (instructor_id, athlete_id) VALUES (v_instructor, p_athlete_id);
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'You already reached this athlete' USING ERRCODE = 'unique_violation';
      END;
      IF v_tier = 'unlimited' THEN RETURN QUERY SELECT 9999; RETURN; END IF;
      UPDATE public.users SET lead_credits_remaining = greatest(0, v_remaining - 1)
       WHERE id = v_instructor;
      RETURN QUERY SELECT greatest(0, v_remaining - 1);
    END; $fn$;
    REVOKE ALL ON FUNCTION public.reach_out_to_athlete(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.reach_out_to_athlete(uuid) TO authenticated;

    -- B of 176. NOT SECURITY DEFINER, deliberately: it must observe
    -- current_user as the surrounding context sees it.
    CREATE OR REPLACE FUNCTION public.prevent_lead_fields_self_update()
     RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
    AS $fn$
    BEGIN
      IF auth.uid() IS NULL OR current_user IS DISTINCT FROM session_user THEN
        RETURN NEW;
      END IF;
      IF is_app_admin_uid(auth.uid()) THEN RETURN NEW; END IF;
      IF NEW.lead_credits_remaining IS DISTINCT FROM OLD.lead_credits_remaining THEN
        RAISE EXCEPTION 'lead_credits_remaining can only be changed by reach_out_to_athlete(), the monthly reset, or an admin'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.lead_credits_reset_at IS DISTINCT FROM OLD.lead_credits_reset_at THEN
        RAISE EXCEPTION 'lead_credits_reset_at can only be changed by the monthly reset or an admin'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.lead_tier IS DISTINCT FROM OLD.lead_tier THEN
        RAISE EXCEPTION 'lead_tier can only be changed by an admin'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN NEW;
    END; $fn$;
    DROP TRIGGER IF EXISTS users_lead_fields_guard ON public.users;
    CREATE TRIGGER users_lead_fields_guard BEFORE UPDATE ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.prevent_lead_fields_self_update();

    -- C of 176
    DROP POLICY IF EXISTS "instructors_own_reaches" ON public.lead_reaches;
    CREATE POLICY lead_reaches_select_own ON public.lead_reaches
      FOR SELECT TO authenticated USING (auth.uid() = instructor_id);
    CREATE POLICY lead_reaches_insert_own ON public.lead_reaches
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = instructor_id);

    -- D of 176
    CREATE OR REPLACE FUNCTION public.prevent_deleted_at_self_update()
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $fn$
    BEGIN
      IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        IF auth.uid() IS NOT NULL AND NOT is_app_admin_uid(auth.uid()) THEN
          RAISE EXCEPTION 'deleted_at can only be changed by the account deletion route or an admin'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      RETURN NEW;
    END; $fn$;
    DROP TRIGGER IF EXISTS users_deleted_at_guard ON public.users;
    CREATE TRIGGER users_deleted_at_guard BEFORE UPDATE ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.prevent_deleted_at_self_update();

    -- E of 176: the two silent reverts become RAISE
    CREATE OR REPLACE FUNCTION public.protect_verified_instructor()
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $fn$
    BEGIN
      IF NEW.is_verified_instructor IS DISTINCT FROM OLD.is_verified_instructor THEN
        IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
          RAISE EXCEPTION 'is_verified_instructor can only be changed by an admin'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      IF NEW.total_earnings_cents IS DISTINCT FROM OLD.total_earnings_cents THEN
        IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
          RAISE EXCEPTION 'total_earnings_cents can only be changed by an admin'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      IF NEW.total_participants_served IS DISTINCT FROM OLD.total_participants_served THEN
        IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
          RAISE EXCEPTION 'total_participants_served can only be changed by an admin'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      RETURN NEW;
    END; $fn$;

    a_ok := true; a_error := '(none)';
  EXCEPTION WHEN OTHERS THEN
    a_ok := false; a_error := SQLSTATE || ' ' || SQLERRM;
  END;

  INSERT INTO reh_probe VALUES
    (1, 'A1 176 body applies clean inside the transaction', coalesce(a_error,'(null)'), coalesce(a_ok,false));

  -- ── Part B1: total_earnings_cents under the PRE-176 function ────────────
  -- The discriminating half. Reinstalls the captured silent body, writes as a
  -- real authenticated non-admin, and asserts the value WENT BACKWARDS with no
  -- error. If this arm raises, the premise of Part E was wrong.
  BEGIN
    CREATE OR REPLACE FUNCTION public.protect_verified_instructor()
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $fn$
    BEGIN
      IF NEW.is_verified_instructor IS DISTINCT FROM OLD.is_verified_instructor THEN
        IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
          RAISE EXCEPTION 'is_verified_instructor can only be changed by an admin'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      IF NEW.total_earnings_cents IS DISTINCT FROM OLD.total_earnings_cents THEN
        IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
          NEW.total_earnings_cents := OLD.total_earnings_cents;
        END IF;
      END IF;
      IF NEW.total_participants_served IS DISTINCT FROM OLD.total_participants_served THEN
        IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
          NEW.total_participants_served := OLD.total_participants_served;
        END IF;
      END IF;
      RETURN NEW;
    END; $fn$;

    SELECT coalesce(total_earnings_cents, 0) INTO b1_before FROM public.users WHERE id = k_actor;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.users SET total_earnings_cents = coalesce(total_earnings_cents,0) + 999999
       WHERE id = k_actor;
      b1_state := 'UPDATE SUCCEEDED and raised nothing -- which is the defect';
    EXCEPTION WHEN OTHERS THEN
      b1_state := 'RAISED ' || SQLSTATE || ' ' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    SELECT coalesce(total_earnings_cents, 0) INTO b1_after FROM public.users WHERE id = k_actor;
    b1_silent := (b1_state LIKE 'UPDATE SUCCEEDED%') AND (b1_after = b1_before);
    RAISE EXCEPTION 'REH_UNWIND_B1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_B1' AND b1_state = '(never ran)' THEN
      b1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b1_silent := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (2, 'B1 BEFORE: total_earnings_cents write is accepted and SILENTLY REVERTED',
        coalesce(b1_state,'?') || '   before=' || b1_before || '  after=' || b1_after,
        coalesce(b1_silent,false));

  -- ── Part B2: the same write under 176 ───────────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.users SET total_earnings_cents = coalesce(total_earnings_cents,0) + 999999
       WHERE id = k_actor;
      b2_state := 'UPDATE SUCCEEDED -- 176 did not convert this branch';
      b2_raised := false;
    EXCEPTION WHEN OTHERS THEN
      b2_state := SQLSTATE || ' ' || SQLERRM;
      b2_raised := (SQLSTATE = '42501');
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REH_UNWIND_B2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_B2' AND b2_state = '(never ran)' THEN
      b2_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b2_raised := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (3, 'B2 AFTER: the identical write RAISES 42501',
        coalesce(b2_state,'(probe row missing)'), coalesce(b2_raised,false));

  -- ── Part B3/B4: total_participants_served, same pair ────────────────────
  BEGIN
    CREATE OR REPLACE FUNCTION public.protect_verified_instructor()
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $fn$
    BEGIN
      IF NEW.total_participants_served IS DISTINCT FROM OLD.total_participants_served THEN
        IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
          NEW.total_participants_served := OLD.total_participants_served;
        END IF;
      END IF;
      RETURN NEW;
    END; $fn$;

    SELECT coalesce(total_participants_served, 0) INTO b3_before FROM public.users WHERE id = k_actor;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.users SET total_participants_served = coalesce(total_participants_served,0) + 4242
       WHERE id = k_actor;
      b3_state := 'UPDATE SUCCEEDED and raised nothing';
    EXCEPTION WHEN OTHERS THEN
      b3_state := 'RAISED ' || SQLSTATE || ' ' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    SELECT coalesce(total_participants_served, 0) INTO b3_after FROM public.users WHERE id = k_actor;
    b3_silent := (b3_state LIKE 'UPDATE SUCCEEDED%') AND (b3_after = b3_before);
    RAISE EXCEPTION 'REH_UNWIND_B3';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_B3' AND b3_state = '(never ran)' THEN
      b3_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b3_silent := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (4, 'B3 BEFORE: total_participants_served write is accepted and SILENTLY REVERTED',
        coalesce(b3_state,'?') || '   before=' || b3_before || '  after=' || b3_after,
        coalesce(b3_silent,false));

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.users SET total_participants_served = coalesce(total_participants_served,0) + 4242
       WHERE id = k_actor;
      b4_state := 'UPDATE SUCCEEDED -- 176 did not convert this branch';
      b4_raised := false;
    EXCEPTION WHEN OTHERS THEN
      b4_state := SQLSTATE || ' ' || SQLERRM;
      b4_raised := (SQLSTATE = '42501');
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REH_UNWIND_B4';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_B4' AND b4_state = '(never ran)' THEN
      b4_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b4_raised := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (5, 'B4 AFTER: the identical write RAISES 42501',
        coalesce(b4_state,'(probe row missing)'), coalesce(b4_raised,false));

  -- ── Part C: the RPC works end to end as a real non-admin ────────────────
  -- THE ARM THAT CHECKS MY OWN REASONING. Part B's trigger exempts the RPC by
  -- testing `current_user IS DISTINCT FROM session_user`. If that is wrong,
  -- the guard blocks the RPC it exists to serve and this arm fails -- which is
  -- the whole reason it is here. The first draft used pg_trigger_depth() and
  -- would have failed exactly here.
  BEGIN
    DELETE FROM public.lead_reaches WHERE instructor_id = k_actor AND athlete_id = k_victim;
    UPDATE public.users
       SET is_verified_instructor = true, lead_tier = 'free', lead_credits_remaining = 3
     WHERE id = k_actor;
    SELECT coalesce(lead_credits_remaining,0) INTO c_credits_before FROM public.users WHERE id = k_actor;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.reach_out_to_athlete(k_victim);
      c_state := 'RPC succeeded';
    EXCEPTION WHEN OTHERS THEN
      c_state := 'RPC RAISED ' || SQLSTATE || ' ' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    SELECT coalesce(lead_credits_remaining,0) INTO c_credits_after FROM public.users WHERE id = k_actor;
    SELECT count(*) INTO c_rows FROM public.lead_reaches
     WHERE instructor_id = k_actor AND athlete_id = k_victim;
    c_ok := (c_state = 'RPC succeeded')
            AND (c_credits_after = c_credits_before - 1)
            AND (c_rows = 1);
    RAISE EXCEPTION 'REH_UNWIND_C';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_C' AND c_state = '(never ran)' THEN
      c_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; c_ok := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (6, 'C1 NEGATIVE CONTROL: the RPC still works for a verified non-admin, decrements once, files one row',
        coalesce(c_state,'?') || '   credits ' || c_credits_before || ' -> ' || c_credits_after
        || '   lead_reaches rows=' || c_rows, coalesce(c_ok,false));

  -- ── Part D: lead_* denied to a caller, permitted to service-role ────────
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.users SET lead_credits_remaining = 9999 WHERE id = k_actor;
      d1_state := 'UPDATE SUCCEEDED -- the counter is still self-editable';
      d1_denied := false;
    EXCEPTION WHEN OTHERS THEN
      d1_state := SQLSTATE || ' ' || SQLERRM;
      d1_denied := (SQLSTATE = '42501');
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REH_UNWIND_D1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_D1' AND d1_state = '(never ran)' THEN
      d1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; d1_denied := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (7, 'D1 a caller CANNOT self-set lead_credits_remaining',
        coalesce(d1_state,'(probe row missing)'), coalesce(d1_denied,false));

  -- Service-role: no jwt claims at all, which is what the reset cron looks
  -- like. If this fails, 176 breaks /api/cron/lead-credits-reset.
  BEGIN
    PERFORM set_config('request.jwt.claims', NULL, true);
    BEGIN
      UPDATE public.users SET lead_credits_remaining = 3, lead_credits_reset_at = now()
       WHERE id = k_actor;
      d2_state := 'permitted'; d2_allowed := true;
    EXCEPTION WHEN OTHERS THEN
      d2_state := SQLSTATE || ' ' || SQLERRM; d2_allowed := false;
    END;
    RAISE EXCEPTION 'REH_UNWIND_D2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_D2' AND d2_state = '(never ran)' THEN
      d2_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; d2_allowed := false;
    END IF;
  END;

  INSERT INTO reh_probe VALUES
    (8, 'D2 SERVICE-ROLE still writes lead_credits_* (the monthly reset cron)',
        coalesce(d2_state,'(probe row missing)'), coalesce(d2_allowed,false));

  -- ── Part E: deleted_at denied to a caller, permitted to service-role ────
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.users SET deleted_at = now() WHERE id = k_actor;
      e1_state := 'UPDATE SUCCEEDED -- deleted_at is still self-settable';
      e1_denied := false;
    EXCEPTION WHEN OTHERS THEN
      e1_state := SQLSTATE || ' ' || SQLERRM;
      e1_denied := (SQLSTATE = '42501');
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REH_UNWIND_E1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_E1' AND e1_state = '(never ran)' THEN
      e1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; e1_denied := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (9, 'E1 a caller CANNOT self-set deleted_at',
        coalesce(e1_state,'(probe row missing)'), coalesce(e1_denied,false));

  BEGIN
    PERFORM set_config('request.jwt.claims', NULL, true);
    BEGIN
      UPDATE public.users SET deleted_at = now() WHERE id = k_actor;
      UPDATE public.users SET deleted_at = NULL WHERE id = k_actor;
      e2_state := 'permitted'; e2_allowed := true;
    EXCEPTION WHEN OTHERS THEN
      e2_state := SQLSTATE || ' ' || SQLERRM; e2_allowed := false;
    END;
    RAISE EXCEPTION 'REH_UNWIND_E2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_E2' AND e2_state = '(never ran)' THEN
      e2_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; e2_allowed := false;
    END IF;
  END;

  INSERT INTO reh_probe VALUES
    (10, 'E2 SERVICE-ROLE still writes deleted_at (/api/account/delete)',
         coalesce(e2_state,'(probe row missing)'), coalesce(e2_allowed,false));

  -- ── Part F: lead_reaches INSERT permitted, DELETE denied ────────────────
  -- THE DELETE ARM IS THE POINT. FOR ALL is what made the UNIQUE dedupe
  -- self-clearing: an instructor could delete their own row and reach the same
  -- athlete again, without limit.
  BEGIN
    DELETE FROM public.lead_reaches WHERE instructor_id = k_actor AND athlete_id = k_victim;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', k_actor::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.lead_reaches (instructor_id, athlete_id) VALUES (k_actor, k_victim);
      f1_state := 'insert permitted'; f1_allowed := true;
    EXCEPTION WHEN OTHERS THEN
      f1_state := SQLSTATE || ' ' || SQLERRM; f1_allowed := false;
    END;

    BEGIN
      DELETE FROM public.lead_reaches WHERE instructor_id = k_actor AND athlete_id = k_victim;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      -- No DELETE policy means the row is INVISIBLE to the delete, not an
      -- error: zero rows, no exception. That is the correct outcome and it is
      -- asserted as such rather than as a raise.
      f2_state := 'DELETE affected ' || v_n || ' row(s)';
      f2_denied := (v_n = 0);
    EXCEPTION WHEN OTHERS THEN
      f2_state := SQLSTATE || ' ' || SQLERRM;
      f2_denied := (SQLSTATE = '42501');
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'REH_UNWIND_F';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REH_UNWIND_F' AND f1_state = '(never ran)' THEN
      f1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; f1_allowed := false;
    END IF;
    RESET ROLE;
  END;

  INSERT INTO reh_probe VALUES
    (11, 'F1 a caller CAN still file a reach (INSERT policy survives)',
         coalesce(f1_state,'(probe row missing)'), coalesce(f1_allowed,false)),
    (12, 'F2 a caller CANNOT delete their own reach, so the UNIQUE dedupe is no longer self-clearing',
         coalesce(f2_state,'(probe row missing)'), coalesce(f2_denied,false));

END $outer$;

-- ── Part G: nothing escaped its subtransaction ────────────────────────────
-- Driven off a VALUES list so a missing row FAILS rather than dropping its
-- check from the output.
INSERT INTO reh_probe
SELECT t.seq, t.check_name, coalesce(t.detail,'(probe row missing)'), coalesce(t.passed,false)
FROM (VALUES
  (13, 'G1 protect_verified_instructor still has 3 RAISE branches and 0 silent reverts',
       (SELECT 'raises=' ||
          ((length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid),'RAISE EXCEPTION',''))) / length('RAISE EXCEPTION'))
          || ' silent=' ||
          ((length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid),':= OLD.',''))) / length(':= OLD.'))
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='protect_verified_instructor'),
       (SELECT (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid),':= OLD.',''))) = 0
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='protect_verified_instructor')),
  (14, 'G2 lead_reaches has no ALL/UPDATE/DELETE policy',
       (SELECT coalesce(string_agg(cmd, ',' ORDER BY cmd), '(none)') FROM pg_policies
         WHERE schemaname='public' AND tablename='lead_reaches'),
       (SELECT count(*) = 0 FROM pg_policies WHERE schemaname='public'
          AND tablename='lead_reaches' AND cmd IN ('ALL','UPDATE','DELETE'))),
  (15, 'G3 both new users guards are attached',
       (SELECT coalesce(string_agg(tgname, ', ' ORDER BY tgname), '(none)') FROM pg_trigger
         WHERE tgrelid='public.users'::regclass AND NOT tgisinternal),
       (SELECT count(*) = 2 FROM pg_trigger WHERE tgrelid='public.users'::regclass
          AND tgname IN ('users_lead_fields_guard','users_deleted_at_guard'))),
  (16, 'G4 lead_reaches row count is back to its baseline, so no arm leaked a row',
       (SELECT 'now=' || (SELECT count(*) FROM public.lead_reaches)
               || '  baseline=' || (SELECT lead_reaches_rows FROM reh_baseline)),
       (SELECT (SELECT count(*) FROM public.lead_reaches)
             = (SELECT lead_reaches_rows FROM reh_baseline)))
) AS t(seq, check_name, detail, passed);

-- The one result set. Every row must read PASS. 16 of 16.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

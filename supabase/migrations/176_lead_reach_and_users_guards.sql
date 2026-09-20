-- 176_lead_reach_and_users_guards.sql
--
-- Closes the lead reach-out bypass, splits the lead_reaches policy, guards
-- users.deleted_at, and finishes a conversion someone else started in
-- protect_verified_instructor().
--
-- RUNS AFTER 175. 175 captures protect_verified_instructor() as it exists
-- TODAY, including two branches this migration converts. Applying 176 first
-- would leave 175 recording a state that no longer exists, and 175's
-- pre-flight would then refuse -- correctly, but after the fact. Order: 175,
-- then 176.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PART A: reachOutToAthlete becomes a SECURITY DEFINER RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The credit limit was decided in the BROWSER and written from the browser:
-- lib/dal/leadDiscovery.ts read lead_credits_remaining, compared it to zero,
-- inserted into lead_reaches, then UPDATEd the counter down. Every step of
-- that is something the caller controls.
--
-- TWO INDEPENDENT BYPASSES, both measured on 2026-09-19:
--   1. users.lead_credits_remaining carries an UPDATE grant to authenticated
--      and no trigger, so the counter is directly self-editable.
--   2. lead_reaches RLS is FOR ALL USING (auth.uid() = instructor_id), and
--      FOR ALL includes DELETE -- so the UNIQUE (instructor_id, athlete_id)
--      dedupe is self-clearing.
--
-- A limit the limited party can rewrite is not a limit. This moves the whole
-- decision into one definer function, in one transaction.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PART B: guard the lead_* columns
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A TRIGGER, NOT A REVOKE, and the reason is measured rather than stylistic.
-- resetMonthlyLeadCredits (/api/cron/lead-credits-reset, scheduled in
-- vercel.json) writes lead_credits_remaining and lead_credits_reset_at using
-- SUPABASE_SERVICE_ROLE_KEY. A column REVOKE from authenticated would not
-- touch it -- but a revoke also cannot express "the RPC may, the caller may
-- not", because both arrive as the same role. A trigger can: auth.uid() is
-- NULL under service-role, and the RPC below is SECURITY DEFINER.
--
-- It also matches the instrument that turned out to be doing the real work on
-- this table. Three of five probe writes were refused by BEFORE UPDATE
-- triggers, not by grants or policies.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PART C: lead_reaches FOR ALL -> SELECT + INSERT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- FOR ALL is four commands, and nobody needed the other two. An instructor
-- deleting their own lead_reaches row clears the UNIQUE constraint and may
-- reach the same athlete again; updating one can set resulted_in_booking on
-- their own record. Neither is a feature. The RPC writes under definer rights
-- regardless, so removing DELETE and UPDATE from the caller costs nothing.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PART D: users.deleted_at
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Self-setting deleted_at is NOT an alternate deletion path. The real one is
-- POST /api/account/delete, which runs service-role: it cancels future
-- sessions, anonymises PII, then calls auth.admin.deleteUser(). Nothing in
-- app/, lib/ or components/ writes users.deleted_at at all.
--
-- So the column is simply unscoped, and what it does is worse than deleting:
-- the row stays, the auth user stays, the session stays valid, but
-- users_discoverable drops them and every `deleted_at IS NULL` filter hides
-- them. A self-service shadowban, reversible only by someone who knows to
-- look at that column. Trigger again, so the service-role route keeps working.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PART E: finish the conversion in protect_verified_instructor()
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two of its three branches deny SILENTLY -- `NEW := OLD`, the UPDATE
-- succeeds, nothing is raised and nothing is logged. An attacker writing
-- someone else's earnings gets 200 and a row back with the old value, which
-- is indistinguishable from a no-op to them and to us. updateUser() does not
-- catch it either: it calls .select() to tell a real write from a zero-row
-- no-op, and here a row IS returned -- one column just went backwards.
--
-- THE DECISION WAS MADE ON EVIDENCE, NOT ON INTENT, BECAUSE THE INTENT IS
-- UNRECOVERABLE. Both silent branches carry the comment "UNCHANGED,
-- deliberately. See the second box above before touching this." There is no
-- box above: line 008 of the captured body is the first line after BEGIN, so
-- those boxes lived in a source file that is not in this repository. Whatever
-- reasoning they held is gone, and waiting for it is waiting for nothing.
--
-- WHAT AUTHORISES THE CHANGE, measured 2026-09-20:
--   * NOTHING WRITES EITHER COLUMN. Sixteen mentions of
--     total_earnings_cents / total_participants_served across app/, lib/ and
--     components/ -- all reads or type declarations. No .update(), no upsert,
--     no SQL writer in any migration. There is no caller to break.
--   * THE PRECEDENT IS IN THE FUNCTION. Line 008: "CHANGED: the non-null
--     caller test below was missing from this branch, and the revert became a
--     RAISE." The is_verified_instructor branch WAS a silent revert and the
--     same author converted it. This finishes that job rather than starting a
--     new one. Note the non-null caller test is ALREADY present in both
--     remaining branches, so only the RAISE conversion is missing.
--
-- Same shape as the branch already converted: the non-null caller test, RAISE
-- with ERRCODE insufficient_privilege, and a message naming the column.
--
-- ONE DEFINITION OF ADMIN. Every guard added here calls
-- is_app_admin_uid(auth.uid()), the helper 043 and 098 already use.
-- protect_verified_instructor inlines its own SELECT three times; Part E does
-- not add a fourth. The inlined ones are left as they are -- changing them is
-- not what this migration is for, and is recorded in T-SEC-EMAIL.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART A
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reach_out_to_athlete(p_athlete_id uuid)
 RETURNS TABLE (credits_remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_instructor uuid := auth.uid();
  v_verified   boolean;
  v_tier       text;
  v_remaining  integer;
BEGIN
  IF v_instructor IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT u.is_verified_instructor, u.lead_tier, coalesce(u.lead_credits_remaining, 0)
    INTO v_verified, v_tier, v_remaining
    FROM public.users u
   WHERE u.id = v_instructor;

  IF NOT coalesce(v_verified, false) THEN
    RAISE EXCEPTION 'Only verified instructors can reach out'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_remaining <= 0 AND v_tier IS DISTINCT FROM 'unlimited' THEN
    RAISE EXCEPTION 'No credits remaining this month'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The dedupe is the UNIQUE constraint, surfaced as a clean error rather
  -- than a raw 23505 the caller has to string-match on.
  BEGIN
    INSERT INTO public.lead_reaches (instructor_id, athlete_id)
    VALUES (v_instructor, p_athlete_id);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already reached this athlete'
      USING ERRCODE = 'unique_violation';
  END;

  IF v_tier = 'unlimited' THEN
    RETURN QUERY SELECT 9999;
    RETURN;
  END IF;

  -- SECURITY DEFINER does NOT change auth.uid() -- that reads the JWT, not the
  -- database role -- so the Part B trigger still sees a non-null caller here.
  -- What it does change is current_user, and that is the signal the trigger
  -- tests. See the note on prevent_lead_fields_self_update().
  UPDATE public.users
     SET lead_credits_remaining = greatest(0, v_remaining - 1)
   WHERE id = v_instructor;

  RETURN QUERY SELECT greatest(0, v_remaining - 1);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reach_out_to_athlete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reach_out_to_athlete(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART B
-- ═══════════════════════════════════════════════════════════════════════════

-- NOT SECURITY DEFINER, deliberately, and this is the subtle part of the file.
-- It needs to observe `current_user` as the SURROUNDING execution context sees
-- it, to tell "called inside reach_out_to_athlete()" from "called directly".
-- A SECURITY DEFINER trigger function would rewrite current_user to its own
-- owner and destroy exactly the signal it is testing. It does not need definer
-- rights anyway: is_app_admin_uid() is already SECURITY DEFINER and granted to
-- authenticated.
CREATE OR REPLACE FUNCTION public.prevent_lead_fields_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $fn$
BEGIN
  -- Two exemptions, and neither is forgeable by a caller.
  --
  -- 1. auth.uid() IS NULL -- service-role and migrations. This is how
  --    /api/cron/lead-credits-reset keeps working after this lands.
  --
  -- 2. current_user <> session_user -- we are executing inside a SECURITY
  --    DEFINER function owned by someone else, in practice
  --    reach_out_to_athlete(), which has already made this decision under
  --    rights the caller does not have. session_user stays as the caller's
  --    role for the whole transaction and cannot be changed by them.
  --
  --    NOT pg_trigger_depth(). The first draft used `pg_trigger_depth() > 1`
  --    and it was wrong: depth is 1 inside a trigger fired by an ordinary
  --    UPDATE, including the RPC's own, so the guard would have blocked the
  --    RPC it exists to serve. Caught before the rehearsal; arm C1 exists to
  --    catch it if the reasoning here is wrong too.
  --
  --    NOT a set_config() flag either. `set_config('app.x', '1', true)` is
  --    executable by the caller, so a flag the trigger trusts is a flag the
  --    attacker sets.
  IF auth.uid() IS NULL OR current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  IF is_app_admin_uid(auth.uid()) THEN
    RETURN NEW;
  END IF;

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
END;
$fn$;

DROP TRIGGER IF EXISTS users_lead_fields_guard ON public.users;
CREATE TRIGGER users_lead_fields_guard
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_lead_fields_self_update();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART C
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "instructors_own_reaches" ON public.lead_reaches;

CREATE POLICY lead_reaches_select_own ON public.lead_reaches
  FOR SELECT TO authenticated
  USING (auth.uid() = instructor_id);

-- INSERT stays available to the caller so the RPC is not the only possible
-- writer by accident; the UNIQUE constraint still dedupes, and nothing here
-- lets a caller insert a row naming someone else as the instructor.
CREATE POLICY lead_reaches_insert_own ON public.lead_reaches
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = instructor_id);

-- Deliberately NO update or delete policy. Their absence is the fix.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART D
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_deleted_at_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    IF auth.uid() IS NOT NULL AND NOT is_app_admin_uid(auth.uid()) THEN
      RAISE EXCEPTION 'deleted_at can only be changed by the account deletion route or an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS users_deleted_at_guard ON public.users;
CREATE TRIGGER users_deleted_at_guard
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_deleted_at_self_update();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART E
-- ═══════════════════════════════════════════════════════════════════════════
-- Identical to the body captured in 175 except that the two `NEW := OLD`
-- assignments become RAISE, in the same shape as the branch above them. The
-- "UNCHANGED, deliberately" comments are replaced with what actually happened,
-- so the next reader is not sent looking for a box that does not exist.

CREATE OR REPLACE FUNCTION public.protect_verified_instructor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CHANGED (pre-2026-09-20): the non-null caller test below was missing from
  -- this branch, and the revert became a RAISE.
  IF NEW.is_verified_instructor IS DISTINCT FROM OLD.is_verified_instructor THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'is_verified_instructor can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- CHANGED 2026-09-20 (migration 176): was `NEW := OLD`, a silent revert.
  -- The original comment said "UNCHANGED, deliberately. See the second box
  -- above before touching this." There is no box above -- this was the first
  -- statement after BEGIN -- so that reasoning lived in a source file that is
  -- not in this repo and is unrecoverable. Converted on the evidence instead:
  -- no caller anywhere writes this column, so there was nothing to break.
  IF NEW.total_earnings_cents IS DISTINCT FROM OLD.total_earnings_cents THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'total_earnings_cents can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- CHANGED 2026-09-20 (migration 176): was `NEW := OLD`. Same reasoning.
  IF NEW.total_participants_served IS DISTINCT FROM OLD.total_participants_served THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'total_participants_served can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDS
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_raises integer;
  v_silent integer;
  v_body   text;
  v_pol    integer;
BEGIN
  IF to_regprocedure('public.reach_out_to_athlete(uuid)') IS NULL THEN
    RAISE EXCEPTION '176 ABORTED: reach_out_to_athlete(uuid) does not exist.';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.reach_out_to_athlete(uuid)'::regprocedure) THEN
    RAISE EXCEPTION '176 ABORTED: reach_out_to_athlete is not SECURITY DEFINER, so it cannot '
      'write a counter the caller may not write. That is the entire point of Part A.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.reach_out_to_athlete(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '176 ABORTED: authenticated cannot EXECUTE reach_out_to_athlete, so the '
      'discover page would be dead.';
  END IF;

  IF has_function_privilege('anon', 'public.reach_out_to_athlete(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '176 ABORTED: anon can EXECUTE reach_out_to_athlete.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.users'::regclass
                   AND tgname='users_lead_fields_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '176 ABORTED: users_lead_fields_guard is not attached.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.users'::regclass
                   AND tgname='users_deleted_at_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '176 ABORTED: users_deleted_at_guard is not attached.';
  END IF;

  -- Part C: the absence of UPDATE and DELETE policies IS the fix, so it is
  -- asserted rather than assumed. A FOR ALL policy reappearing would restore
  -- the self-clearing dedupe silently.
  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname='public' AND tablename='lead_reaches' AND cmd IN ('ALL','UPDATE','DELETE');
  IF v_pol <> 0 THEN
    RAISE EXCEPTION '176 ABORTED: lead_reaches still has % policy(ies) granting ALL, UPDATE or '
      'DELETE. FOR ALL is what made the UNIQUE dedupe self-clearing.', v_pol;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='lead_reaches' AND cmd='INSERT') THEN
    RAISE EXCEPTION '176 ABORTED: lead_reaches has no INSERT policy, so no reach can be filed.';
  END IF;

  -- Part E: assert by SHAPE. Three RAISE branches and zero silent reverts.
  SELECT pg_get_functiondef(p.oid) INTO v_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='protect_verified_instructor';
  v_raises := (length(v_body) - length(replace(v_body,'RAISE EXCEPTION',''))) / length('RAISE EXCEPTION');
  v_silent := (length(v_body) - length(replace(v_body,':= OLD.',''))) / length(':= OLD.');
  IF v_raises <> 3 OR v_silent <> 0 THEN
    RAISE EXCEPTION '176 ABORTED: protect_verified_instructor has % RAISE branches and % silent '
      'reverts; expected 3 and 0.', v_raises, v_silent;
  END IF;

  RAISE NOTICE '176: RPC live, two users guards attached, lead_reaches split, two silent reverts converted.';
END $$;

-- ── Verification. Every *_ok must read true. ────────────────────────────────
SELECT
  (SELECT prosecdef FROM pg_proc WHERE oid='public.reach_out_to_athlete(uuid)'::regprocedure) AS rpc_secdef,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.users'::regclass AND NOT tgisinternal) AS users_triggers,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='lead_reaches')     AS lead_reaches_policies,
  (SELECT string_agg(cmd, ',' ORDER BY cmd) FROM pg_policies
    WHERE schemaname='public' AND tablename='lead_reaches')                                     AS lead_reaches_cmds,
  coalesce((SELECT prosecdef FROM pg_proc WHERE oid='public.reach_out_to_athlete(uuid)'::regprocedure), false) AS rpc_ok,
  coalesce((SELECT count(*)=0 FROM pg_policies WHERE schemaname='public' AND tablename='lead_reaches'
              AND cmd IN ('ALL','UPDATE','DELETE')), false)                                     AS no_delete_policy_ok,
  coalesce((SELECT count(*)=2 FROM pg_trigger WHERE tgrelid='public.users'::regclass
              AND tgname IN ('users_lead_fields_guard','users_deleted_at_guard')), false)       AS new_guards_ok,
  coalesce((SELECT (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid),':= OLD.',''))) = 0
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='protect_verified_instructor'), false)      AS no_silent_reverts_ok;

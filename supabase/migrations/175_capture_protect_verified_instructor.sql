-- 175_capture_protect_verified_instructor.sql
--
-- Captures public.protect_verified_instructor() and its trigger, which exist in
-- production and in NO file in this repository. Read from the live catalog via
-- pg_get_functiondef / pg_get_triggerdef on 2026-09-20 (see
-- supabase/captures/capture_users_guards_live.sql) and recorded VERBATIM,
-- including the parts that are wrong. This migration changes NOTHING on
-- production: the function and trigger already exist there, so applying it is a
-- CREATE OR REPLACE over an identical definition.
--
-- Same intent and shape as 143-147 and 166: capture is capture.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS IS WORSE THAN DB-02's USUAL SHAPE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DB-02 is normally a missing CREATE TABLE: a rebuild is incomplete in a way
-- that fails loudly the first time something queries the table. This is a
-- missing SECURITY CONTROL. `supabase db reset` from these migrations produced
-- a database where a signed-in user could self-set is_verified_instructor --
-- the only gate on the lead reach-out path -- and nothing anywhere would have
-- said so, because nothing in the repo knew the guard existed.
--
-- It was found by a BEHAVIOURAL PROBE, not by reading. The catalog said the
-- UPDATE grant was present on all 97 columns; three of five test writes were
-- refused anyway, by three different objects, one of which was this.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CAPTURED DEFECT 1: TWO OF THREE BRANCHES DENY SILENTLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The function guards THREE columns, and they do not behave alike:
--
--   is_verified_instructor      RAISE EXCEPTION, insufficient_privilege
--   total_earnings_cents        SILENT: NEW := OLD, the UPDATE succeeds
--   total_participants_served   SILENT: NEW := OLD, the UPDATE succeeds
--
-- A silent revert is not a denial the caller can observe. The row IS updated,
-- so:
--
--   * An attacker writing someone else's earnings gets HTTP 200 and a row
--     back, with that column unchanged. The attempt is indistinguishable from
--     a no-op, to them AND to us. Nothing is logged anywhere.
--
--   * A legitimate caller gets no error either. If any route ever tries to
--     write total_earnings_cents as `authenticated`, it does not fail -- the
--     value reverts and execution continues. The resulting bug reads as
--     "earnings never update" with no signal pointing at the cause.
--
--   * updateUser() DOES NOT CATCH IT. That function calls .select() precisely
--     to tell a real write from a zero-row no-op (the silent profile-save bug).
--     Here a row IS returned: the UPDATE did affect the row, one column simply
--     went backwards. The guard we already built against swallowed failures
--     passes cleanly.
--
-- This is the swallowed-failure pattern -- the one this repo has chased for a
-- year -- implemented ON PURPOSE, in the security layer.
--
-- IT IS CAPTURED AS-IS AND DELIBERATELY NOT FIXED HERE. Capturing is
-- capturing; a capture that "improves" what it records is not a record, and
-- 175 would then be a behaviour change disguised as documentation. The
-- question of whether those two branches should RAISE is T-SEC-SILENT-REVERT.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CAPTURED DEFECT 2: THE COMMENTS POINT AT AN EXPLANATION THAT NO LONGER EXISTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lines 017 and 024 of the captured body both read:
--
--     UNCHANGED, deliberately. See the second box above before touching this.
--
-- THERE IS NO BOX ABOVE. Line 008 is the first line after BEGIN, so nothing
-- precedes it inside the function. The boxes lived in whatever source file this
-- was authored in, and that file is not in this repository -- which is the same
-- gap this migration exists to close, showing up from the inside.
--
-- So the reason those two branches were left silent is UNRECOVERABLE from
-- source. Anyone changing them is deciding on the merits, not restoring an
-- intent, and should not wait to find a rationale that cannot be found.
--
-- THE PRECEDENT FOR CHANGING THEM IS ALSO IN THE BODY. Line 008 says:
--
--     CHANGED: the non-null caller test below was missing from this branch, and
--     the revert became a RAISE.
--
-- The is_verified_instructor branch WAS a silent revert once, and the same
-- author converted it. So converting the other two is not a new idea, it is the
-- unfinished half of one someone already started.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CAPTURED DEFECT 3: A SECOND DEFINITION OF "ADMIN"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This function inlines `SELECT is_admin FROM public.users WHERE id = auth.uid()`
-- THREE times. The other guards on this table (043_lock_is_admin,
-- 098_rls_self_escalation_guards) call is_app_admin_uid(auth.uid()).
--
-- Two definitions of admin across four guards on one table is how they drift:
-- the day is_app_admin_uid changes -- to exclude banned accounts, say -- three
-- guards follow the new rule and this one keeps the old, and nothing fails.
--
-- Recorded, not changed. Any NEW guard added to public.users must call
-- is_app_admin_uid(auth.uid()) so the count of conventions does not grow while
-- the count of guards does.
--
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Related: T-SEC-SILENT-REVERT (branches 2 and 3), T-SEC-USERS-RLS (the repo
-- declares 4 policies on users where production has at least 6),
-- T-SEC-EMAIL (9 policies keying access off a literal address).

-- ── PRE-FLIGHT: refuse to run if 176 has already superseded this ────────────
-- THIS BLOCK RUNS BEFORE ANYTHING IS WRITTEN, and that ordering is the point.
--
-- This migration is NOT atomic: it replaces the function, then checks. The
-- Supabase SQL editor autocommits statement by statement, so without this
-- block a re-run AFTER 176 would commit the two SILENT REVERTS back over
-- 176's RAISE branches, and only then abort in the guard below. The operator
-- would see an error and assume nothing happened, while the security fix had
-- just been quietly undone. That is the failure this whole session has been
-- about, so it does not get to live in the migration that documents it.
--
-- Checking first costs one query. Checking after costs the fix.
DO $preflight$
DECLARE
  v_body   text;
  v_raises integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'protect_verified_instructor';

  -- Absent is fine: that is a fresh rebuild, which is what this capture is for.
  IF v_body IS NULL THEN
    RAISE NOTICE '175 pre-flight: function absent (fresh rebuild). Proceeding.';
    RETURN;
  END IF;

  v_raises := (length(v_body) - length(replace(v_body, 'RAISE EXCEPTION', '')))
              / length('RAISE EXCEPTION');

  IF v_raises > 1 THEN
    RAISE EXCEPTION
      '175 REFUSED: the live protect_verified_instructor() has % RAISE branches, not 1. '
      'Migration 176 has already converted the silent reverts. Running 175 now would '
      'overwrite that fix with the captured pre-176 body. 175 is a CAPTURE of the state '
      'before 176 and must not be re-applied after it. If you need to re-record the '
      'function, re-read it from the live catalog into a NEW capture migration.', v_raises;
  END IF;
END $preflight$;

-- ── The function, VERBATIM from pg_get_functiondef ──────────────────────────
-- Do not reformat, do not "tidy", do not convert the two assignments to RAISE.
--
-- All 33 lines below are byte-identical to the capture output, verified by
-- diff rather than by eye. ONE character was added and it is worth naming
-- rather than glossing: a `;` after the closing $function$, because
-- pg_get_functiondef emits a definition and not a statement. Nothing else
-- differs -- no whitespace, no reflowed comment, no changed quoting.
CREATE OR REPLACE FUNCTION public.protect_verified_instructor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CHANGED: the non-null caller test below was missing from this branch, and
  -- the revert became a RAISE.
  IF NEW.is_verified_instructor IS DISTINCT FROM OLD.is_verified_instructor THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'is_verified_instructor can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- UNCHANGED, deliberately. See the second box above before touching this.
  IF NEW.total_earnings_cents IS DISTINCT FROM OLD.total_earnings_cents THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      NEW.total_earnings_cents := OLD.total_earnings_cents;
    END IF;
  END IF;

  -- UNCHANGED, deliberately. See the second box above before touching this.
  IF NEW.total_participants_served IS DISTINCT FROM OLD.total_participants_served THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      NEW.total_participants_served := OLD.total_participants_served;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── The trigger ─────────────────────────────────────────────────────────────
-- DROP + CREATE rather than CREATE OR REPLACE: Postgres has no
-- CREATE OR REPLACE TRIGGER before 14 and this repo does not assume a version.
-- Dropping and recreating a BEFORE UPDATE trigger inside a transaction leaves
-- no window where the guard is absent.
DROP TRIGGER IF EXISTS protect_verified_instructor_trigger ON public.users;
CREATE TRIGGER protect_verified_instructor_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_verified_instructor();

-- ── Guard: assert the capture matches what is live ──────────────────────────
-- Same shape as 169/171/174. A capture that silently diverges from production
-- is worse than no capture: it reads as authoritative, which is exactly how
-- add_reviews.sql and add_admin_rls.sql came to mislead.
DO $$
DECLARE
  v_secdef boolean;
  v_path   text;
  v_body   text;
  v_raises integer;
  v_silent integer;
BEGIN
  SELECT p.prosecdef,
         coalesce(array_to_string(p.proconfig, ' '), '(NOT PINNED)'),
         pg_get_functiondef(p.oid)
    INTO v_secdef, v_path, v_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'protect_verified_instructor';

  IF v_body IS NULL THEN
    RAISE EXCEPTION
      '175 ABORTED: protect_verified_instructor() does not exist after this migration ran.';
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION
      '175 ABORTED: protect_verified_instructor() is not SECURITY DEFINER. It reads '
      'public.users to decide who is an admin; as invoker that read is subject to RLS '
      'and the guard would silently stop guarding.';
  END IF;

  IF v_path NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION
      '175 ABORTED: protect_verified_instructor() has no pinned search_path (%). A '
      'SECURITY DEFINER function without one is a privilege escalation waiting for a '
      'schema shadow.', v_path;
  END IF;

  -- The three branches, asserted by BEHAVIOUR rather than by name. One RAISE
  -- and two assignments is the captured shape; if that ratio changes, either
  -- someone fixed T-SEC-SILENT-REVERT and this capture is now stale, or
  -- production drifted. Both need a human, and both are better than a silent
  -- mismatch.
  v_raises := (length(v_body) - length(replace(v_body, 'RAISE EXCEPTION', ''))) / length('RAISE EXCEPTION');
  v_silent := (length(v_body) - length(replace(v_body, ':= OLD.', ''))) / length(':= OLD.');

  IF v_raises <> 1 OR v_silent <> 2 THEN
    RAISE EXCEPTION
      '175 ABORTED: expected 1 RAISE branch and 2 silent-revert branches, found % and %. '
      'If the silent branches were converted to RAISE (T-SEC-SILENT-REVERT), this capture '
      'is stale and must be re-read from the live catalog rather than edited.',
      v_raises, v_silent;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.users'::regclass
       AND tgname = 'protect_verified_instructor_trigger'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '175 ABORTED: the trigger is not attached to public.users.';
  END IF;

  RAISE NOTICE
    '175: protect_verified_instructor captured. SECURITY DEFINER, search_path pinned, '
    '1 RAISE branch and 2 SILENT-REVERT branches (see T-SEC-SILENT-REVERT).';
END $$;

-- ── Verification ────────────────────────────────────────────────────────────
-- Per feedback-do-block-no-visible-output: the editor shows only "success, no
-- rows returned" for a DO block and discards RAISE NOTICE, so the migration
-- ends with a SELECT. Every *_ok column must read true.
SELECT
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'protect_verified_instructor')     AS security_definer,
  (SELECT coalesce(array_to_string(proconfig, ' '), '(NOT PINNED)') FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'protect_verified_instructor')     AS search_path,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.users'::regclass
     AND tgname = 'protect_verified_instructor_trigger' AND NOT tgisinternal)     AS trigger_attached,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.users'::regclass
     AND NOT tgisinternal)                                                        AS total_user_triggers,
  coalesce((SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'protect_verified_instructor'), false) AS secdef_ok,
  coalesce((SELECT count(*) = 1 FROM pg_trigger WHERE tgrelid = 'public.users'::regclass
     AND tgname = 'protect_verified_instructor_trigger' AND NOT tgisinternal), false) AS trigger_ok;

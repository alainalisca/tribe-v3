-- verify-140-gate3-dryrun.sql
--
-- BEGIN…ROLLBACK dry run for migration 140 (RLS-H4 Gate 3). It PROVISIONALLY
-- applies the anon revoke inside a transaction, asserts the resulting grant
-- state and role-scoped read behavior, then ABORTS — so production is left
-- exactly as it was. Nothing is committed.
--
-- Paste into the Supabase SQL editor against PRODUCTION. Safe to run any time,
-- BEFORE the real migration and before the reroute code is deployed: it only
-- reads and rolls back. It does NOT need the tribe.deploy_confirmed attestation
-- (that guards the real apply, not this dry run).
--
-- READING THE RESULT:
--   * "ALL CHECKS PASSED (A,B,C,D)" in the error output = the revoke behaves
--     correctly. The error is intentional — it's what forces the ROLLBACK.
--   * any "CHECK _ FAILED" message = a real problem; also rolled back, nothing
--     applied. Diagnose before touching the real 140.

BEGIN;

-- Provisional revoke — undone by the ROLLBACK below.
REVOKE SELECT ON public.sessions FROM anon;

DO $$
DECLARE v_orig text := current_user;
BEGIN
  -- A. anon must have LOST table-level SELECT on the base table.
  IF has_table_privilege('anon','public.sessions','SELECT') THEN
    RAISE EXCEPTION 'CHECK A FAILED: anon still holds table SELECT on public.sessions';
  END IF;

  -- B. authenticated must RETAIN base-table SELECT (host detail/edit depend on it).
  IF NOT has_table_privilege('authenticated','public.sessions','SELECT') THEN
    RAISE EXCEPTION 'CHECK B FAILED: authenticated lost SELECT on public.sessions';
  END IF;

  -- C. anon must STILL hold SELECT on the view (the sole anon read path).
  IF NOT has_table_privilege('anon','public.sessions_public','SELECT') THEN
    RAISE EXCEPTION 'CHECK C FAILED: anon lost SELECT on public.sessions_public';
  END IF;

  -- D. Role-scoped proof (a DO block runs as table owner — the trap behind 129's
  --    false PASS). Actually BECOME anon: the base table must be denied, and the
  --    view must still succeed.
  PERFORM set_config('role','anon', true);
  BEGIN
    EXECUTE 'SELECT id FROM public.sessions LIMIT 1';
    -- If we got here, the revoke did NOT take effect — reset role and fail.
    PERFORM set_config('role', v_orig, true);
    RAISE EXCEPTION 'CHECK D FAILED: anon can STILL read public.sessions base table';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected: base table denied for anon. Now confirm the view still works.
    BEGIN
      EXECUTE 'SELECT id FROM public.sessions_public LIMIT 1';
      PERFORM set_config('role', v_orig, true);
    EXCEPTION WHEN insufficient_privilege THEN
      PERFORM set_config('role', v_orig, true);
      RAISE EXCEPTION 'CHECK D FAILED: anon cannot read sessions_public — anon pages would 401';
    END;
  END;

  -- All good. Raising here forces the whole transaction to abort (the honest
  -- rollback: every exit path leaves production untouched).
  RAISE EXCEPTION 'ALL CHECKS PASSED (A,B,C,D) — 140 dry run OK, rolling back, nothing applied';
END $$;

ROLLBACK;

-- 197_revoke_anon_payment_venue_revenue_rpcs.sql
--
-- EMERGENCY FIX, APPLIED TO PRODUCTION BY HAND BEFORE MERGE.
--
-- Al applied the change in section 1 in the production Supabase SQL editor on
-- 2026-09-27, as an emergency, before this file existed on any branch, and
-- verified the result there:
--
--     anon_can_run      = false on all six functions
--     logged_in_can_run = false for finalize_payment, true for the other five
--     server_can_run    = true on all six
--
-- This file records that change in git after the fact, the same inversion of
-- "merge the branch, then paste" as 196 and for the same reason: each of these
-- was reachable with the public anon key. When this branch merges, paste the
-- WHOLE file: section 1 is idempotent, and sections 2 and 3 add the assertion
-- and the migrations_applied row that the hand-run did not write.
--
-- NUMBER: 197. Read 2026-09-27 immediately before writing, after `git fetch`:
-- origin/main ends at 193; 194 is on chore/194-scrub-push-send-bearer, 195 on
-- fix/s3-notification-forgery, 196 on this branch (admin_delete_user); no
-- branch or worktree carries 197 or higher. Re-check against origin/main
-- immediately before merge.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS WRONG (found 2026-09-27 by the T-AV19 sibling sweep)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The production schema dump pulled 2026-09-26 grants anon EXECUTE on all six.
-- Every one is SECURITY DEFINER. Each was proved on the LOCAL stack under
-- production's grants, inside a rolled-back transaction, as role anon with
-- auth.uid() NULL. Production itself was never called.
--
--   finalize_payment(text, bigint, text, text)
--     No caller check. Matches a payment by gateway id (and an optional
--     expected amount), sets its status, and on 'approved' confirms the
--     booking, fulfils product orders and approves tips. Its only callers are
--     the Stripe and Wompi webhooks, through the service role. So it goes to
--     service_role ONLY; authenticated is revoked too. Whether a payer can see
--     their own gateway id (Stripe Checkout URLs carry the session id) was
--     inferred, not measured.
--
--   set_session_partner(uuid, uuid), review_venue_request(uuid, text)
--     The caller check is `IF v_creator <> auth.uid() THEN RAISE` and
--     `IF v_owner <> auth.uid() AND NOT is_app_admin() THEN RAISE`. With
--     auth.uid() NULL both comparisons are NULL, IF NULL does not fire, and
--     the check passes. Proved: anon attached a seed session to a partner
--     venue and then approved it. That is the BullBox incident class
--     (CLAUDE.md), without a login.
--
--   instructor_revenue_totals(uuid, date, date, text),
--   instructor_revenue_buckets(uuid, date, date, text, text)
--     The check is `IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id`,
--     which is skipped entirely when there is no caller. Proved with a
--     control: a signed-in athlete reading another instructor's revenue is
--     refused (42501); anon reading the same is allowed.
--
--   list_gym_coaches(uuid)
--     Same `auth.uid() IS NOT NULL AND ...` shape. Proved: anon listing an
--     arbitrary gym's coaches is not refused.
--
-- The five that are not finalize_payment keep EXECUTE for authenticated: a
-- signed-in caller has a non-NULL auth.uid(), so their existing checks work
-- for exactly the people who use them. Their bodies are NOT changed here. The
-- NULL-caller shapes are still in them, harmless only while no NULL-uid role
-- can execute them; the probe in verify-migration-state.sql fails if anon or
-- PUBLIC ever holds EXECUTE again. Fixing the bodies is a separate migration.
--
-- EVERY OVERLOAD. Section 1 finds the functions by name through pg_proc, as
-- the hand-run did, so an overload production has and the dump did not show
-- is covered too. It refuses to run if any of the six names matches nothing,
-- so a misspelling cannot turn this file into a no-op.

-- ── 1. The change applied by hand in production on 2026-09-27 ───────────────
DO $$
DECLARE
  v_name text;
  v_fn   regprocedure;
  v_seen int;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['finalize_payment', 'set_session_partner', 'review_venue_request',
                                'instructor_revenue_totals', 'instructor_revenue_buckets', 'list_gym_coaches']
  LOOP
    v_seen := 0;
    FOR v_fn IN
      SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      v_seen := v_seen + 1;
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', v_fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
      IF v_name = 'finalize_payment' THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
      ELSE
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
      END IF;
    END LOOP;
    IF v_seen = 0 THEN
      RAISE EXCEPTION '197 ABORTED: no function named public.% exists; nothing was changed for it.', v_name;
    END IF;
  END LOOP;
END $$;

-- ── 2. Assert the end state, after the write, on every overload ─────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS fn, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('finalize_payment', 'set_session_partner', 'review_venue_request',
                         'instructor_revenue_totals', 'instructor_revenue_buckets', 'list_gym_coaches')
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '197 ABORTED: anon can still execute %.', r.fn;
    END IF;
    IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '197 ABORTED: service_role cannot execute %; its server caller would break.', r.fn;
    END IF;
    IF r.proname = 'finalize_payment' AND has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '197 ABORTED: authenticated can execute %.', r.fn;
    END IF;
    IF r.proname <> 'finalize_payment' AND NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '197 ABORTED: authenticated cannot execute %; the signed-in screens that use it would break.', r.fn;
    END IF;
  END LOOP;
  RAISE NOTICE '197: six RPCs closed to anon; finalize_payment server-only.';
END $$;

-- ── 3. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('197_revoke_anon_payment_venue_revenue_rpcs', 'Emergency: revoke anon/PUBLIC EXECUTE on finalize_payment (server only), set_session_partner, review_venue_request, instructor_revenue_totals/buckets, list_gym_coaches; hand-applied in production 2026-09-27 before merge')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true, one row per overload. ─────────
SELECT p.oid::regprocedure AS function,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE')                          AS anon_cannot_run_ok,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')
         = (p.proname <> 'finalize_payment')                                          AS logged_in_as_intended_ok,
       has_function_privilege('service_role', p.oid, 'EXECUTE')                       AS server_can_run_ok,
       EXISTS (SELECT 1 FROM public.migrations_applied
                WHERE migration = '197_revoke_anon_payment_venue_revenue_rpcs')        AS recorded_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('finalize_payment', 'set_session_partner', 'review_venue_request',
                     'instructor_revenue_totals', 'instructor_revenue_buckets', 'list_gym_coaches')
 ORDER BY 1;

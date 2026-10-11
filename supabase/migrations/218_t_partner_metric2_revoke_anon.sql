-- 218_t_partner_metric2_revoke_anon.sql
--
-- T-PARTNER-METRIC2. Take EXECUTE on increment_partner_metric away from anon.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 217 granted EXECUTE to anon on the belief that signed-out visitors see the
-- featured-partner banner. They do not: app/page.tsx returns <LandingPage />
-- when there is no user, and FeaturedPartnerBanner renders only in the signed-in
-- home feed (measured 2026-10-11: a fresh signed-out load of tribelatam.com
-- made no call to the function; a signed-in load moved bullbox from 0 to 1
-- impression). So anon's grant buys nothing and leaves one thing open: anyone
-- holding the public anon key can inflate an active partner's impressions or
-- clicks without an account. Removing it costs no feature.
--
-- What stays: authenticated (the banner's caller) and service_role. PUBLIC
-- stays revoked (217). A signed-in user can still inflate counters by calling
-- in a loop; that is the client-side-counting limit 217 states, now behind a
-- sign-in rather than open to the world.
--
-- One edge, stated: a signed-in page whose access token has lapsed sends the
-- call as anon and now gets 42501 instead of a count. The DAL logs it and
-- moves on (fire-and-forget); supabase-js refreshes the token on the next
-- request.
--
-- 217's own guard asserts anon CAN execute. 217 is applied and frozen; its
-- guard ran once, at apply, and is not re-run. verify-migration-state.sql's
-- 217 probe is updated in the same change to check authenticated instead.
--
-- Re-runnable: REVOKE is idempotent; the guard checks the end state.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.increment_partner_metric(uuid, text) FROM anon;

-- ── Assert the end state ────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn oid := to_regprocedure('public.increment_partner_metric(uuid, text)');
BEGIN
  IF v_fn IS NULL THEN
    RAISE EXCEPTION '218 ABORTED: increment_partner_metric does not exist; apply 217 first.';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '218 ABORTED: anon can still EXECUTE increment_partner_metric.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = v_fn AND a.grantee = 0) THEN
    RAISE EXCEPTION '218 ABORTED: PUBLIC can EXECUTE increment_partner_metric, which also reaches anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '218 ABORTED: authenticated or service_role lost EXECUTE; the signed-in banner would count nothing.';
  END IF;

  RAISE NOTICE '218: increment_partner_metric callable by authenticated and service_role only.';
END $$;

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('218_t_partner_metric2_revoke_anon',
        'T-PARTNER-METRIC2: revoke anon EXECUTE on increment_partner_metric (banner is signed-in only)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

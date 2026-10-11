-- 217_t_partner_metric1_increment_partner_metric.sql
--
-- T-PARTNER-METRIC1. Featured-partner impressions and clicks have never been
-- counted. Give the banner a narrow function that can bump exactly those two
-- counters and nothing else.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS WRONG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- lib/dal/featuredPartners.ts incrementPartnerMetric called
-- rpc('increment_counter', {table_name, row_id, column_name}). That function was
-- NEVER WRITTEN: the call arrived on 2026-04-19 (0d2b50a6) already commented
-- "Fallback: log and move on if RPC doesn't exist yet", no commit on any branch
-- has ever defined it in SQL, and PostgREST answers PGRST202 (measured
-- 2026-10-11, as anon). The silent-bug audit of 2026-05-27 listed it as R-6; it
-- was never actioned. Every banner impression and click since April was lost,
-- and since T-ANALYTICS1 stopped dropping early events, each home load also
-- reaches PostHog as error_occurred.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY NOT JUST CREATE increment_counter
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The call's shape is a generic (table, column, row) incrementer. Callable by
-- anon -- the banner renders for signed-out visitors -- and SECURITY DEFINER
-- (it must be, to write past RLS), it would let anyone holding the public anon
-- key add to ANY integer column of ANY table: users, sessions, referrals,
-- revenue. So this is the opposite shape:
--
--   * one table, named in the function body, never taken from the caller
--   * two columns, each its own STATIC UPDATE: there is no EXECUTE and no
--     format(), so no caller string ever becomes SQL
--   * anything else is refused with 22023 (invalid_parameter_value)
--   * only status = 'active' partners count, the same rows the banner shows
--   * SET search_path = '' and every name schema-qualified: nothing on a
--     caller-influenced search_path (a temp table called featured_partners,
--     an operator in another schema) can stand in for the real objects
--   * EXECUTE revoked from PUBLIC and granted to anon, authenticated and
--     service_role by name
--
-- total_bookings is DELIBERATELY NOT a metric here. A booking is something the
-- server should derive from a real participation, not something any visitor
-- can add one to; the old type allowed it but nothing ever called it. It has no
-- writer today and that is reported, not papered over.
--
-- What a client-side counter cannot prevent, stated rather than implied: a
-- visitor can still call this in a loop and inflate an ACTIVE partner's
-- impressions or clicks by one per call. That was already the design (the
-- banner counts in the browser); this migration bounds it to those two numbers
-- on those rows, instead of every number in the database.
--
-- Re-runnable: CREATE OR REPLACE, then REVOKE/GRANT, then the guard.

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_partner_metric(p_partner_id uuid, p_metric text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_metric = 'total_impressions' THEN
    UPDATE public.featured_partners
       SET total_impressions = coalesce(total_impressions, 0) + 1
     WHERE id = p_partner_id
       AND status = 'active';
  ELSIF p_metric = 'total_clicks' THEN
    UPDATE public.featured_partners
       SET total_clicks = coalesce(total_clicks, 0) + 1
     WHERE id = p_partner_id
       AND status = 'active';
  ELSE
    RAISE EXCEPTION 'increment_partner_metric: % is not a partner metric', coalesce(p_metric, 'NULL')
      USING ERRCODE = '22023';
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.increment_partner_metric(uuid, text) IS
  'T-PARTNER-METRIC1: +1 to total_impressions or total_clicks of one ACTIVE featured partner. '
  'Whitelisted metrics, static SQL, search_path pinned. Unknown or inactive partner: no-op. '
  'Replaces the never-created generic increment_counter, which must not exist.';

REVOKE ALL ON FUNCTION public.increment_partner_metric(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_partner_metric(uuid, text) TO anon, authenticated, service_role;

-- ── Assert the end state ────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn oid := to_regprocedure('public.increment_partner_metric(uuid, text)');
  v_src text;
BEGIN
  IF v_fn IS NULL THEN
    RAISE EXCEPTION '217 ABORTED: public.increment_partner_metric(uuid, text) does not exist.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '217 ABORTED: increment_partner_metric is not SECURITY DEFINER; it cannot write past RLS.';
  END IF;
  IF NOT coalesce((SELECT 'search_path=""' = ANY (proconfig) FROM pg_proc WHERE oid = v_fn), false) THEN
    RAISE EXCEPTION '217 ABORTED: increment_partner_metric does not pin search_path to empty.';
  END IF;

  -- No dynamic SQL, ever: the body must not contain EXECUTE or format(.
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_fn;
  IF v_src ~* '\mexecute\M' OR v_src ~* '\mformat\s*\(' THEN
    RAISE EXCEPTION '217 ABORTED: increment_partner_metric contains dynamic SQL (EXECUTE or format).';
  END IF;

  -- Who can call it: anon, authenticated, service_role. Not PUBLIC.
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = v_fn AND a.grantee = 0) THEN
    RAISE EXCEPTION '217 ABORTED: PUBLIC can still EXECUTE increment_partner_metric.';
  END IF;
  IF NOT has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '217 ABORTED: anon, authenticated or service_role cannot EXECUTE increment_partner_metric.';
  END IF;

  -- The generic shape this replaces must not exist, under any signature.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_counter') THEN
    RAISE EXCEPTION '217 ABORTED: a function named increment_counter exists; a generic incrementer must not.';
  END IF;

  RAISE NOTICE '217: increment_partner_metric (impressions, clicks; active partners; static SQL; search_path pinned).';
END $$;

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('217_t_partner_metric1_increment_partner_metric',
        'T-PARTNER-METRIC1: narrow SECURITY DEFINER increment_partner_metric (total_impressions, total_clicks) replacing the never-created increment_counter')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

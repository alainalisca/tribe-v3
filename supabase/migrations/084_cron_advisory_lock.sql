-- Migration 084: cron advisory-lock helper
--
-- Adds a SECURITY DEFINER function so cron route handlers can guard
-- against duplicate concurrent invocations via Postgres advisory
-- locks without exposing pg_try_advisory_lock directly to the API
-- surface.
--
-- Usage pattern from a cron handler:
--   const { data: acquired } = await service.rpc('cron_try_lock',
--     { p_key: 'reconcile-counters' });
--   if (!acquired) {
--     log('warn', 'cron_skipped_lock_held', { key: 'reconcile-counters' });
--     return NextResponse.json({ success: true, skipped: 'lock_held' });
--   }
--   try {
--     // ...do the work...
--   } finally {
--     await service.rpc('cron_release_lock', { p_key: 'reconcile-counters' });
--   }
--
-- Why session-level (not transaction-level) advisory locks: the cron
-- handler makes multiple PostgREST calls during a single invocation,
-- each in its own transaction. A pg_try_advisory_xact_lock would
-- release between calls, defeating the purpose. We use the session-
-- level variant and release explicitly. Connection pooling means
-- the "session" is a pooled connection — if a cron crashes without
-- releasing, the lock stays held until that pooled connection is
-- recycled. The acceptable worst-case is one missed cron run; the
-- next scheduled invocation finds the connection cycled and proceeds.
--
-- Key namespacing: we hash the string key into a single bigint
-- because pg_advisory_lock accepts a bigint. hashtext() is stable
-- and good enough; collisions are theoretically possible but the
-- key space (a few cron names) makes it effectively impossible.

CREATE OR REPLACE FUNCTION public.cron_try_lock(p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_lock(hashtext(p_key));
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_release_lock(p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_advisory_unlock(hashtext(p_key));
END;
$$;

REVOKE ALL ON FUNCTION public.cron_try_lock(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_release_lock(text) FROM PUBLIC;

-- Only service-role should be able to invoke these — never the
-- authenticated role, since holding a lock from a user session
-- would let one user freeze a cron.
GRANT EXECUTE ON FUNCTION public.cron_try_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_release_lock(text) TO service_role;

COMMENT ON FUNCTION public.cron_try_lock(text) IS
  'Acquire a session-level advisory lock keyed by hashtext(p_key). Returns true if acquired, false if another session holds it. Service-role only.';
COMMENT ON FUNCTION public.cron_release_lock(text) IS
  'Release the matching session-level advisory lock. Returns true if the lock was held by this session and is now released, false otherwise.';

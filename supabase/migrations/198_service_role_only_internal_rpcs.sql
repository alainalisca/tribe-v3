-- 198_service_role_only_internal_rpcs.sql
--
-- NORMAL PROCESS. NOT HAND-APPLIED.
--
-- Unlike 196 and 197 on this same branch, nothing in this file has been run in
-- production. It follows the house rule: the branch merges to main first, and
-- only then is this file pasted, WHOLE, in one paste, into the production SQL
-- editor, stating which commit on main the pasted text corresponds to. If this
-- branch cannot be merged, this file is not pasted.
--
-- NUMBER: 198. Read 2026-09-28 immediately before writing, after `git fetch`:
-- origin/main ends at 193; 194 is on chore/194-scrub-push-send-bearer, 195 on
-- fix/s3-notification-forgery, 196 and 197 on this branch; no branch or
-- worktree carries 198 or higher. Re-check against origin/main immediately
-- before merge.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS CHANGES AND WHY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Five SECURITY DEFINER functions that only the server calls, and that the
-- production schema dump (pulled 2026-09-26) grants to anon and authenticated
-- as well as service_role. Found by the T-AV19 sibling sweep, 2026-09-27. None
-- is as severe as 196 or 197, which is why this one waits for the normal
-- process. EXECUTE goes to service_role only.
--
--   bump_longest_streak(uuid, integer)
--     Raises clients.longest_streak_days to GREATEST(existing, p_streak) for
--     any client id, with no caller check. Anyone could inflate a Tribe.OS
--     client's streak. Only caller: lib/ai/data-access.ts, service-role client.
--
--   recompute_all_total_sessions_hosted()
--     Recomputes users.total_sessions_hosted for every user. The values it
--     writes are correct, but anyone could force a full-table UPDATE on users
--     at will. Only caller: /api/cron/tribe-os/reconcile-counters, service role.
--
--   recompute_user_total_sessions_hosted(uuid)
--     Same, for one user. No app caller. Its only caller is the trigger
--     function trg_recompute_sessions_hosted (on sessions, insert, update and
--     delete), which is SECURITY DEFINER and so executes it as its OWNER, not
--     as the user whose write fired the trigger. Revoking client EXECUTE does
--     not break session writes; the local rehearsal proves it with a real
--     session insert as an authenticated user.
--
--   cron_try_lock(text), cron_release_lock(text)
--     Session-level advisory locks for the tribe-os crons. The dump's own
--     COMMENT on cron_try_lock says "Service-role only"; the grants said
--     otherwise. With EXECUTE, anyone could take a cron's lock and leave it
--     held on a pooled connection, so that cron skips its run. Callers:
--     /api/cron/tribe-os/intelligence, weekly-summary, audit-watchdog, and
--     reconcile-counters through lib/cron/lockGuard.ts, all service role.
--
-- PUBLIC is revoked too. For recompute_all_total_sessions_hosted and
-- recompute_user_total_sessions_hosted the dump has no REVOKE FROM PUBLIC, so
-- in production PUBLIC holds EXECUTE by default and anon could run them through
-- PUBLIC even without its explicit grant.
--
-- EVERY OVERLOAD. As in 197, section 1 finds the functions by name through
-- pg_proc and refuses to run if any name matches nothing.

-- ── 1. Service role only, every overload ────────────────────────────────────
DO $$
DECLARE
  v_name text;
  v_fn   regprocedure;
  v_seen int;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['bump_longest_streak', 'recompute_all_total_sessions_hosted',
                                'recompute_user_total_sessions_hosted', 'cron_try_lock', 'cron_release_lock']
  LOOP
    v_seen := 0;
    FOR v_fn IN
      SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      v_seen := v_seen + 1;
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, public', v_fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
    END LOOP;
    IF v_seen = 0 THEN
      RAISE EXCEPTION '198 ABORTED: no function named public.% exists; nothing was changed for it.', v_name;
    END IF;
  END LOOP;
END $$;

-- ── 2. Assert the end state, after the write, on every overload ─────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('bump_longest_streak', 'recompute_all_total_sessions_hosted',
                         'recompute_user_total_sessions_hosted', 'cron_try_lock', 'cron_release_lock')
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '198 ABORTED: anon can still execute %.', r.fn;
    END IF;
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '198 ABORTED: authenticated can still execute %.', r.fn;
    END IF;
    IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '198 ABORTED: service_role cannot execute %; its cron or pipeline would break.', r.fn;
    END IF;
  END LOOP;
  -- The trigger that calls recompute_user_total_sessions_hosted must still run
  -- as its owner, or every session write by a user would now fail.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public.trg_recompute_sessions_hosted()')
                  AND prosecdef) THEN
    RAISE EXCEPTION '198 ABORTED: trg_recompute_sessions_hosted is missing or not SECURITY DEFINER; session writes would fail after this revoke.';
  END IF;
  RAISE NOTICE '198: five internal RPCs are service_role only.';
END $$;

-- ── 3. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('198_service_role_only_internal_rpcs', 'Service-role only: bump_longest_streak, recompute_all/user_total_sessions_hosted, cron_try_lock, cron_release_lock (normal process, merged before paste)')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true, one row per overload. ─────────
SELECT p.oid::regprocedure AS function,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE')           AS anon_cannot_run_ok,
       NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS logged_in_cannot_run_ok,
       has_function_privilege('service_role', p.oid, 'EXECUTE')       AS server_can_run_ok,
       EXISTS (SELECT 1 FROM public.migrations_applied
                WHERE migration = '198_service_role_only_internal_rpcs') AS recorded_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('bump_longest_streak', 'recompute_all_total_sessions_hosted',
                     'recompute_user_total_sessions_hosted', 'cron_try_lock', 'cron_release_lock')
 ORDER BY 1;

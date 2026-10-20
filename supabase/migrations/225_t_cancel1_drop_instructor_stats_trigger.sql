-- 225_t_cancel1_drop_instructor_stats_trigger.sql
--
-- T-CANCEL1: a host who is not an admin can cancel their own session again.
-- NOT APPLIED when written (2026-10-19). Merge first, then apply (CLAUDE.md).
--
-- WHAT IS BROKEN. Read on production on 2026-10-19 with read-only SELECTs
-- (BEGIN READ ONLY ... ROLLBACK):
--
--   trigger   on_session_status_change
--             AFTER UPDATE ON public.sessions FOR EACH ROW
--             EXECUTE FUNCTION update_instructor_stats()
--   function  public.update_instructor_stats(), SECURITY DEFINER,
--             search_path=public, owner postgres. In no migration in this
--             repository: docs/DRIFT_AUDIT_2026-07-08.md lists it live-only.
--
-- On EVERY change of sessions.status it runs, for the host,
--   UPDATE users SET sessions_completed = sessions_completed + 1,
--                    total_participants_served = total_participants_served + <participant rows>
-- Since 2026-09-20, protect_verified_instructor (BEFORE UPDATE ON users;
-- applied as 176, 178 in this repository) raises
--   'total_participants_served can only be changed by an admin'
-- whenever auth.uid() is not an admin. SECURITY DEFINER changes current_user,
-- not auth.uid(), so the host's own status change aborts whenever the session
-- has at least one participant row. With no rows the add is +0, the guarded
-- column does not change, and the update passes: that is why hosts kept
-- cancelling empty sessions after 2026-09-20 (production shows non-admin
-- cancels on 2026-10-05, 2026-10-10 and 2026-10-18, all with zero rows).
-- 178's header says "no caller anywhere writes this column"; this trigger did,
-- and nothing in the repository could show it.
--
-- No session on production shows the damage yet (active, every participant row
-- cancelled), and no upcoming active session has any participant row today.
-- The first booking on a coach's session makes it uncancellable by that coach.
--
-- WHY DROP IT RATHER THAN LET IT PAST THE GUARD:
--   * The numbers it keeps are wrong anyway. A cancel counts as a completed
--     session, and the participant count includes cancelled rows and door
--     guests. Readers: /storefront (frozen), the spotlight score
--     (lib/dal/spotlight.ts), the admin user list.
--   * Letting it past the guard means a bypass of the guard for a writer of
--     wrong numbers.
--   * Dropping it freezes sessions_completed and total_participants_served at
--     their current values. A correct recompute (the total_sessions_hosted
--     shape: trg_recompute_sessions_hosted) is a separate ticket.
--   * protect_verified_instructor is NOT changed. It is right; the trigger is
--     what was wrong.
--
-- CAPTURED DEFINITION (2026-10-19, md5(prosrc) = 60a20b272df22dd83400dfbd9444c3e3),
-- kept here because no other file in the repository has it. Re-creating these
-- two objects is the rollback, and it brings the cancel failure back with them.
--
--   CREATE OR REPLACE FUNCTION public.update_instructor_stats()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     participant_count integer;
--   BEGIN
--     IF NEW.status IS DISTINCT FROM OLD.status THEN
--       IF NEW.creator_id IS NOT NULL THEN
--         SELECT COUNT(*) INTO participant_count FROM public.session_participants WHERE session_id = NEW.id;
--         UPDATE public.users
--           SET sessions_completed = sessions_completed + 1,
--               total_participants_served = total_participants_served + participant_count
--           WHERE id = NEW.creator_id;
--       END IF;
--     END IF;
--     RETURN NEW;
--   END;
--   $function$;
--
--   CREATE TRIGGER on_session_status_change AFTER UPDATE ON public.sessions
--     FOR EACH ROW EXECUTE FUNCTION update_instructor_stats();
--
-- GUARDS. pg_temp.m225_shape() reads the live objects and either names their
-- state or aborts:
--   'captured'       the function and trigger are exactly as captured: drop both
--   'function only'  the trigger is already gone: drop the function
--   'absent'         both gone (a re-run): nothing to drop
--   ABORT            the function body is not the captured one (by md5), it is
--                    no longer SECURITY DEFINER, another trigger calls it, or
--                    the trigger is not AFTER UPDATE FOR EACH ROW with no WHEN
--                    and no column list. Anything other than the captured
--                    objects is read before it is dropped, not dropped blind.
-- It is a temporary function, so the rehearsal can call it again against shapes
-- built to fail and prove each abort fires.
-- Afterwards: both objects are gone, and the users guard trigger is still
-- there and enabled.

BEGIN;

CREATE FUNCTION pg_temp.m225_shape() RETURNS text LANGUAGE plpgsql AS $shape$
DECLARE
  v_fn  regprocedure := to_regprocedure('public.update_instructor_stats()');
  v_trg record;
  v_other integer;
BEGIN
  SELECT t.tgtype, t.tgqual, t.tgattr, t.tgfoid, t.tgenabled INTO v_trg
    FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.sessions')
     AND t.tgname = 'on_session_status_change'
     AND NOT t.tgisinternal;

  IF v_fn IS NULL THEN
    IF v_trg.tgfoid IS NOT NULL THEN
      RAISE EXCEPTION '225 ABORTED: on_session_status_change exists but update_instructor_stats() does not.';
    END IF;
    RETURN 'absent';
  END IF;

  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM '60a20b272df22dd83400dfbd9444c3e3' THEN
    RAISE EXCEPTION '225 ABORTED: update_instructor_stats() is not the body captured on 2026-10-19; read it before dropping it.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '225 ABORTED: update_instructor_stats() is no longer SECURITY DEFINER; it changed since 2026-10-19.';
  END IF;

  SELECT count(*) INTO v_other
    FROM pg_trigger t
   WHERE t.tgfoid = v_fn AND NOT t.tgisinternal
     AND NOT (t.tgrelid = to_regclass('public.sessions') AND t.tgname = 'on_session_status_change');
  IF v_other > 0 THEN
    RAISE EXCEPTION '225 ABORTED: % other trigger(s) call update_instructor_stats(); dropping it would break them.', v_other;
  END IF;

  IF v_trg.tgfoid IS NULL THEN
    RETURN 'function only';
  END IF;

  -- tgtype 17 = ROW (1) + UPDATE (16): AFTER (no BEFORE bit 2), not INSERT,
  -- DELETE or TRUNCATE. No WHEN clause, no column list.
  IF v_trg.tgfoid <> v_fn OR v_trg.tgtype <> 17 OR v_trg.tgqual IS NOT NULL
     OR coalesce(array_length(v_trg.tgattr::int2[], 1), 0) <> 0 THEN
    RAISE EXCEPTION '225 ABORTED: on_session_status_change is not the AFTER UPDATE FOR EACH ROW trigger captured on 2026-10-19.';
  END IF;

  RETURN 'captured';
END $shape$;

DO $$
BEGIN
  RAISE NOTICE '225 pre-flight: %', pg_temp.m225_shape();
END $$;

DROP TRIGGER IF EXISTS on_session_status_change ON public.sessions;
DROP FUNCTION IF EXISTS public.update_instructor_stats();

DO $$
BEGIN
  IF pg_temp.m225_shape() <> 'absent' THEN
    RAISE EXCEPTION '225 ABORTED: update_instructor_stats() or on_session_status_change is still there after the drop.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = to_regclass('public.users')
                    AND t.tgname = 'protect_verified_instructor_trigger'
                    AND t.tgfoid = to_regprocedure('public.protect_verified_instructor()')
                    AND t.tgenabled <> 'D') THEN
    RAISE EXCEPTION '225 ABORTED: protect_verified_instructor_trigger is missing or disabled; 225 drops the stats trigger, never the guard.';
  END IF;
  RAISE NOTICE '225: on_session_status_change and update_instructor_stats() dropped; protect_verified_instructor unchanged.';
END $$;

-- ── Record this migration as applied
INSERT INTO public.migrations_applied (migration, note)
VALUES ('225_t_cancel1_drop_instructor_stats_trigger',
        'T-CANCEL1: dropped live-only on_session_status_change / update_instructor_stats(); non-admin hosts can cancel sessions with participants')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

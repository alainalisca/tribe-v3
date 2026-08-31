-- 148_total_sessions_hosted_counter.sql
--
-- Makes users.total_sessions_hosted a real, maintained counter. It was a dead
-- column: it exists in production (untracked — no migration ever created or wrote
-- it) and NOTHING writes it, so it sits at its default for every user while being
-- read on the storefront trust bar, the profile card, featured-instructor lists,
-- the featured ordering, and the spotlight eligibility gate (.gte(...,5)).
--
-- DEFINITION OF "hosted" (as specified):
--   a session where creator_id = the user
--     AND session.date is STRICTLY in the past
--     AND status <> 'cancelled'.
--   "Strictly in the past" is evaluated in Medellin wall-clock:
--     s.date < (now() AT TIME ZONE 'America/Bogota')::date
--   (sessions.date is a DATE holding Medellin local dates; America/Bogota is a
--    fixed UTC-5, the same anchor migration 143 established.)
--   Cancellation is compared with IS DISTINCT FROM 'cancelled', so 'active',
--   'completed', or any other non-cancelled/NULL status counts as hosted.
--
-- ⚠ OUTSTANDING LIVE CHECK — DO NOT APPLY UNTIL CONFIRMED:
--   The spec asked to confirm from live data that the only terminal value is
--   'cancelled'. That could not be verified here (no DB access from this session).
--   From the code: sessions are created 'active' (default), the cancel path writes
--   'cancelled' (double-l), RLS exposes only 'active'. The repo ALSO contains the
--   strings 'canceled' (single-l), 'completed', 'expired', etc., but those appear
--   to belong to OTHER tables (Stripe subscriptions, participants, boosts). Run
--   this against production BEFORE applying:
--       SELECT status, count(*) FROM public.sessions GROUP BY status ORDER BY 2 DESC;
--   If any other cancelled-like terminal value exists (e.g. 'canceled', 'deleted'),
--   widen the two `status IS DISTINCT FROM 'cancelled'` predicates below to exclude
--   it too, and re-run the rehearsal.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS/CREATE. Safe to
-- re-run. Rehearsal: supabase/rehearsals/148_total_sessions_hosted_counter_REHEARSAL.sql.

-- ── Recompute one user's counter from scratch ─────────────────────────────
-- Recompute (not delta) on purpose: this codebase's delta counters have
-- repeatedly drifted (follower_count, post/comment counts, participant_count).
-- At this scale (~250 sessions, low write volume) a from-scratch COUNT per
-- affected user is trivial and cannot drift.
CREATE OR REPLACE FUNCTION public.recompute_user_total_sessions_hosted(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users u
     SET total_sessions_hosted = (
       SELECT count(*)
         FROM public.sessions s
        WHERE s.creator_id = p_user
          AND s.date < (now() AT TIME ZONE 'America/Bogota')::date
          AND s.status IS DISTINCT FROM 'cancelled'
     )
   WHERE u.id = p_user;
$$;

-- ── Recompute EVERY user's counter ────────────────────────────────────────
-- Used for the one-time backfill below AND as the daily reconcile that fixes the
-- date-crossing problem (see the note under the trigger). Only writes rows whose
-- value actually changes, to avoid churning the whole users table daily.
CREATE OR REPLACE FUNCTION public.recompute_all_total_sessions_hosted()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users u
     SET total_sessions_hosted = sub.cnt
    FROM (
      SELECT u2.id AS id,
             (
               SELECT count(*)
                 FROM public.sessions s
                WHERE s.creator_id = u2.id
                  AND s.date < (now() AT TIME ZONE 'America/Bogota')::date
                  AND s.status IS DISTINCT FROM 'cancelled'
             ) AS cnt
        FROM public.users u2
    ) sub
   WHERE u.id = sub.id
     AND u.total_sessions_hosted IS DISTINCT FROM sub.cnt;
$$;

-- ── Trigger: keep the counter correct across all WRITE events ──────────────
-- Recomputes the affected creator(s). On a creator_id change, both the old and
-- new creator are recomputed. Covers: INSERT of a past-dated session, UPDATE of
-- status to/from 'cancelled', UPDATE of date across the past/future boundary,
-- UPDATE of creator_id, and DELETE.
CREATE OR REPLACE FUNCTION public.trg_recompute_sessions_hosted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_user_total_sessions_hosted(NEW.creator_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_user_total_sessions_hosted(OLD.creator_id);
    RETURN OLD;
  ELSE  -- UPDATE
    PERFORM public.recompute_user_total_sessions_hosted(NEW.creator_id);
    IF OLD.creator_id IS DISTINCT FROM NEW.creator_id THEN
      PERFORM public.recompute_user_total_sessions_hosted(OLD.creator_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_hosted_ins_del ON public.sessions;
CREATE TRIGGER trg_sessions_hosted_ins_del
AFTER INSERT OR DELETE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_sessions_hosted();

-- Only fire on UPDATE when a field in the definition changed, to avoid needless
-- recomputes on unrelated column edits.
DROP TRIGGER IF EXISTS trg_sessions_hosted_upd ON public.sessions;
CREATE TRIGGER trg_sessions_hosted_upd
AFTER UPDATE ON public.sessions
FOR EACH ROW
WHEN (OLD.status     IS DISTINCT FROM NEW.status
   OR OLD.date       IS DISTINCT FROM NEW.date
   OR OLD.creator_id IS DISTINCT FROM NEW.creator_id)
EXECUTE FUNCTION public.trg_recompute_sessions_hosted();

-- ── THE DATE-CROSSING PROBLEM (stated explicitly, not hidden) ──────────────
-- A session created as future-dated becomes "hosted" the instant midnight passes
-- its date — purely by the clock advancing. NO row is written, so NO trigger
-- event fires, and the counter would silently UNDER-count (a session that is now
-- in the past is not yet reflected) until the next write touches that creator's
-- rows. A trigger cannot observe time passing; this is unsolvable by triggers
-- alone.
--
-- Solution: the counter is fully recomputable. recompute_all_total_sessions_hosted()
-- rebuilds every user's value from the definition. The triggers keep it correct
-- across all writes; the boundary crossing is corrected by scheduling
-- recompute_all_total_sessions_hosted() to run ONCE PER DAY (e.g. a daily Vercel
-- cron; a natural home is alongside the existing daily recurring-sessions job,
-- which already runs at 02:00). Necessary + sufficient = triggers (writes) + the
-- daily recompute (time). Without the daily job the counter drifts by exactly the
-- number of sessions whose date crossed into the past since the last write.
-- (This migration does NOT create the cron; wiring the schedule is an app/vercel
--  change. The function is provided so the job is a one-line call.)

-- ── Backfill every user now ───────────────────────────────────────────────
SELECT public.recompute_all_total_sessions_hosted();

-- ── STANDALONE RECONCILIATION (drift detector) — NOT executed by this migration ──
-- Run manually any time to detect stored-vs-live drift. Returns one row per user
-- whose stored counter disagrees with a fresh live count; zero rows = no drift.
-- (Left commented so applying the migration emits no result set.)
--
-- SELECT u.id,
--        u.total_sessions_hosted            AS stored,
--        live.cnt                           AS live,
--        (live.cnt - COALESCE(u.total_sessions_hosted, 0)) AS diff
--   FROM public.users u
--   CROSS JOIN LATERAL (
--     SELECT count(*) AS cnt
--       FROM public.sessions s
--      WHERE s.creator_id = u.id
--        AND s.date < (now() AT TIME ZONE 'America/Bogota')::date
--        AND s.status IS DISTINCT FROM 'cancelled'
--   ) live
--  WHERE COALESCE(u.total_sessions_hosted, -1) <> live.cnt
--  ORDER BY abs(live.cnt - COALESCE(u.total_sessions_hosted, 0)) DESC;

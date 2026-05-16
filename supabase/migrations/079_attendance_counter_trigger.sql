-- Migration 079 — Cached attendance counter trigger
--
-- Keeps clients.total_sessions, clients.sessions_last_30_days, and
-- clients.current_streak_days fresh on every attendance write. Until
-- now those counters were only updated when the AI scoring pipeline
-- ran (manual rescore or nightly cron), so between runs the columns
-- got stale and the Stats card on /os/clients/[id] lied.
--
-- Why the trigger recomputes from scratch (vs +1/-1 deltas):
-- attendance corrections (attended flips from true → false, or back),
-- backdated entries, and the 30-day rolling window all make
-- incremental counters fragile. A single SELECT COUNT(*) per write
-- is a few hundred microseconds for a typical client (≤100 rows in
-- the 90-day window) and stays correct under every edit path.
--
-- Triggers fire on:
--   - INSERT (any row — we need to react even to attended=false in
--     case the row is later flipped true and we'd otherwise miss the
--     no-op recount)
--   - UPDATE OF attended OR attended_at (the two columns that affect
--     the counters)
--   - DELETE (manual cleanup needs to drop the count)
--
-- longest_streak_days is monotonic: GREATEST() with the current
-- value, so we only ever ratchet it up. Matches the
-- bump_longest_streak RPC behavior from migration 078.

CREATE OR REPLACE FUNCTION public.refresh_client_attendance_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_total integer;
  v_last_30 integer;
  v_streak integer;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- Resolve the affected client. DELETE has only OLD, INSERT/UPDATE
  -- carry NEW.
  IF TG_OP = 'DELETE' THEN
    v_client_id := OLD.client_id;
  ELSE
    v_client_id := NEW.client_id;
  END IF;

  -- 1. Lifetime + 30-day attended counts in one scan.
  SELECT
    COUNT(*) FILTER (WHERE attended = true),
    COUNT(*) FILTER (
      WHERE attended = true
        AND attended_at IS NOT NULL
        AND attended_at >= now() - interval '30 days'
    )
  INTO v_total, v_last_30
  FROM public.client_attendance
  WHERE client_id = v_client_id;

  -- 2. Current streak — consecutive UTC-day run ending TODAY.
  --    Matches the TS scoring code: streak only counts when today
  --    itself has an attended row. (If you trained M-W-F-Sat-Sun and
  --    it's now Monday, streak is 0 until today's attendance lands.)
  --    Uses the classic gaps-and-islands trick: subtract row-number
  --    from each date so consecutive dates collapse to a single
  --    "island" group. The latest island whose max date is today is
  --    the active streak; anything else means 0.
  WITH attended_days AS (
    SELECT DISTINCT (attended_at AT TIME ZONE 'UTC')::date AS d
    FROM public.client_attendance
    WHERE client_id = v_client_id
      AND attended = true
      AND attended_at IS NOT NULL
      AND attended_at >= now() - interval '61 days'
  ),
  islands AS (
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS grp
    FROM attended_days
  ),
  latest_island AS (
    SELECT MAX(d) AS max_d, COUNT(*) AS run_length
    FROM islands
    GROUP BY grp
    ORDER BY MAX(d) DESC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT CASE WHEN max_d = v_today THEN run_length ELSE 0 END FROM latest_island),
    0
  )
  INTO v_streak;

  -- 3. Write back. longest_streak_days only ratchets up.
  UPDATE public.clients
  SET
    total_sessions = v_total,
    sessions_last_30_days = v_last_30,
    current_streak_days = v_streak,
    longest_streak_days = GREATEST(longest_streak_days, v_streak)
  WHERE id = v_client_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_client_attendance_counters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_client_attendance_counters() TO authenticated;

-- Drop any prior incarnations so re-running this migration is safe.
DROP TRIGGER IF EXISTS attendance_counters_on_insert ON public.client_attendance;
DROP TRIGGER IF EXISTS attendance_counters_on_update ON public.client_attendance;
DROP TRIGGER IF EXISTS attendance_counters_on_delete ON public.client_attendance;

-- INSERT path: any new row. We don't gate on attended=true because
-- new false rows still affect counts when they later flip — and the
-- recount is cheap enough that we don't need to micro-optimize the
-- insert-then-update path.
CREATE TRIGGER attendance_counters_on_insert
  AFTER INSERT ON public.client_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_client_attendance_counters();

-- UPDATE path: only when the columns that affect counters change.
-- attended (the gate) or attended_at (which window the row falls in).
-- Payment-only edits (paid, amount_paid_cents, etc.) don't touch the
-- counters, so we skip those to avoid trigger spam during checkout.
CREATE TRIGGER attendance_counters_on_update
  AFTER UPDATE OF attended, attended_at ON public.client_attendance
  FOR EACH ROW
  WHEN (
    OLD.attended IS DISTINCT FROM NEW.attended
    OR OLD.attended_at IS DISTINCT FROM NEW.attended_at
  )
  EXECUTE FUNCTION public.refresh_client_attendance_counters();

-- DELETE path: drop the counts when a row is removed. Rare in prod
-- (no UI exposes attendance delete) but covers manual SQL cleanup.
CREATE TRIGGER attendance_counters_on_delete
  AFTER DELETE ON public.client_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_client_attendance_counters();

COMMENT ON FUNCTION public.refresh_client_attendance_counters() IS
  'Recomputes clients.total_sessions, sessions_last_30_days, current_streak_days, and ratchets longest_streak_days from public.client_attendance for the affected client. Fired by AFTER INSERT/UPDATE-OF-attended-or-attended_at/DELETE triggers on client_attendance. Keeps the Stats card on /os/clients/[id] honest between AI scoring runs.';

-- One-time backfill so existing clients reflect their actual history
-- right away instead of waiting for the next attendance write per
-- member. Runs the same logic the trigger does, scoped to every
-- client with at least one attendance row (skipping cold clients
-- avoids an unnecessary UPDATE on every row in the table).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT client_id FROM public.client_attendance
  LOOP
    UPDATE public.clients
    SET
      total_sessions = sub.total,
      sessions_last_30_days = sub.last_30,
      current_streak_days = sub.streak,
      longest_streak_days = GREATEST(public.clients.longest_streak_days, sub.streak)
    FROM (
      WITH attended_days AS (
        SELECT DISTINCT (attended_at AT TIME ZONE 'UTC')::date AS d
        FROM public.client_attendance
        WHERE client_id = r.client_id
          AND attended = true
          AND attended_at IS NOT NULL
          AND attended_at >= now() - interval '61 days'
      ),
      islands AS (
        SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS grp
        FROM attended_days
      ),
      latest_island AS (
        SELECT MAX(d) AS max_d, COUNT(*) AS run_length
        FROM islands
        GROUP BY grp
        ORDER BY MAX(d) DESC
        LIMIT 1
      )
      SELECT
        (SELECT COUNT(*) FROM public.client_attendance
          WHERE client_id = r.client_id AND attended = true) AS total,
        (SELECT COUNT(*) FROM public.client_attendance
          WHERE client_id = r.client_id
            AND attended = true
            AND attended_at IS NOT NULL
            AND attended_at >= now() - interval '30 days') AS last_30,
        COALESCE(
          (SELECT CASE WHEN max_d = (now() AT TIME ZONE 'UTC')::date THEN run_length ELSE 0 END FROM latest_island),
          0
        ) AS streak
    ) sub
    WHERE public.clients.id = r.client_id;
  END LOOP;
END;
$$;

-- Verification:
--   SELECT id, total_sessions, sessions_last_30_days, current_streak_days, longest_streak_days
--   FROM public.clients WHERE total_sessions > 0 ORDER BY total_sessions DESC LIMIT 10;

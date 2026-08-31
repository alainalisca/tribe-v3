-- ============================================================================
-- 148_total_sessions_hosted_counter_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 148's body verbatim, backfills, exercises every trigger path, returns a SINGLE
-- final result set, and ROLLS BACK — ZERO changes persist.
--
-- The SQL Editor shows only the last statement's result and has no Notices panel,
-- so there is NO RAISE NOTICE: every scenario writes a pass/fail row into a temp
-- table and the final SELECT renders them plus an ALL_CHECKS row.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- What it proves:
--   * backfill_matches_live: after the backfill, EVERY user's stored counter
--     equals a fresh live count under the definition (0 mismatches).
--   * Each trigger path moves the affected creator's counter by the right delta:
--     INSERT past/active (+1), status to/from 'cancelled' (-1/+1), date across the
--     past/future boundary both ways (-1/+1), creator_id change (old -1 / new +1),
--     DELETE (-1). Deltas are measured against each test user's real baseline, so
--     the rehearsal is correct regardless of their existing data.
--
-- PRE-REQ: run `SELECT status, count(*) FROM public.sessions GROUP BY status;`
-- first and confirm 'cancelled' is the only terminal value (see the migration's
-- OUTSTANDING LIVE CHECK note). If not, widen the predicate before rehearsing.
-- ============================================================================

BEGIN;

-- ── MIGRATION 148 BODY (verbatim) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_user_total_sessions_hosted(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.users u
     SET total_sessions_hosted = (
       SELECT count(*) FROM public.sessions s
        WHERE s.creator_id = p_user
          AND s.date < (now() AT TIME ZONE 'America/Bogota')::date
          AND s.status IS DISTINCT FROM 'cancelled'
     )
   WHERE u.id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.recompute_all_total_sessions_hosted()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.users u
     SET total_sessions_hosted = sub.cnt
    FROM (
      SELECT u2.id AS id,
             (SELECT count(*) FROM public.sessions s
               WHERE s.creator_id = u2.id
                 AND s.date < (now() AT TIME ZONE 'America/Bogota')::date
                 AND s.status IS DISTINCT FROM 'cancelled') AS cnt
        FROM public.users u2
    ) sub
   WHERE u.id = sub.id
     AND u.total_sessions_hosted IS DISTINCT FROM sub.cnt;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_sessions_hosted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_user_total_sessions_hosted(NEW.creator_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_user_total_sessions_hosted(OLD.creator_id);
    RETURN OLD;
  ELSE
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
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_sessions_hosted();

DROP TRIGGER IF EXISTS trg_sessions_hosted_upd ON public.sessions;
CREATE TRIGGER trg_sessions_hosted_upd
AFTER UPDATE ON public.sessions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
   OR OLD.date IS DISTINCT FROM NEW.date
   OR OLD.creator_id IS DISTINCT FROM NEW.creator_id)
EXECUTE FUNCTION public.trg_recompute_sessions_hosted();

SELECT public.recompute_all_total_sessions_hosted();  -- backfill

-- ── PROBES ─────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _checks(ord int, check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

-- Check 1: backfill matches a fresh live count for every user (0 mismatches).
INSERT INTO _checks
SELECT 1, 'backfill_matches_live', m.n::text, '0', m.n = 0
FROM (
  SELECT count(*) AS n
    FROM public.users u
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt FROM public.sessions s
       WHERE s.creator_id = u.id
         AND s.date < (now() AT TIME ZONE 'America/Bogota')::date
         AND s.status IS DISTINCT FROM 'cancelled'
    ) live
   WHERE COALESCE(u.total_sessions_hosted, -1) <> live.cnt
) m;

-- Trigger-path scenarios. All logic inside one DO block (no NOTICE); results land
-- in _checks. Uses two real users; deltas are relative to their baselines.
DO $$
DECLARE
  v_u1 uuid; v_u2 uuid;
  v_b1 int;  v_b2 int;  v_c1 int; v_c2 int;
  v_sid uuid;
  d_yesterday date := (now() AT TIME ZONE 'America/Bogota')::date - 1;
  d_tomorrow  date := (now() AT TIME ZONE 'America/Bogota')::date + 1;
BEGIN
  SELECT id INTO v_u1 FROM public.users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_u2 FROM public.users WHERE id <> v_u1 ORDER BY created_at, id LIMIT 1;
  SELECT total_sessions_hosted INTO v_b1 FROM public.users WHERE id = v_u1;

  -- INSERT past-dated active session -> +1
  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants, status)
  VALUES (v_u1, '__rehearsal__', d_yesterday, TIME '10:00', 60, '__rehearsal__', 10, 'active')
  RETURNING id INTO v_sid;
  SELECT total_sessions_hosted INTO v_c1 FROM public.users WHERE id = v_u1;
  INSERT INTO _checks VALUES (2, 'insert_past_active_+1', (v_c1 - v_b1)::text, '1', (v_c1 - v_b1) = 1);

  -- status active -> cancelled : back to baseline
  UPDATE public.sessions SET status = 'cancelled' WHERE id = v_sid;
  SELECT total_sessions_hosted INTO v_c1 FROM public.users WHERE id = v_u1;
  INSERT INTO _checks VALUES (3, 'status_to_cancelled_-1', (v_c1 - v_b1)::text, '0', (v_c1 - v_b1) = 0);

  -- status cancelled -> active : +1
  UPDATE public.sessions SET status = 'active' WHERE id = v_sid;
  SELECT total_sessions_hosted INTO v_c1 FROM public.users WHERE id = v_u1;
  INSERT INTO _checks VALUES (4, 'status_from_cancelled_+1', (v_c1 - v_b1)::text, '1', (v_c1 - v_b1) = 1);

  -- date past -> future : no longer hosted, back to baseline
  UPDATE public.sessions SET date = d_tomorrow WHERE id = v_sid;
  SELECT total_sessions_hosted INTO v_c1 FROM public.users WHERE id = v_u1;
  INSERT INTO _checks VALUES (5, 'date_to_future_-1', (v_c1 - v_b1)::text, '0', (v_c1 - v_b1) = 0);

  -- date future -> past : +1
  UPDATE public.sessions SET date = d_yesterday WHERE id = v_sid;
  SELECT total_sessions_hosted INTO v_c1 FROM public.users WHERE id = v_u1;
  INSERT INTO _checks VALUES (6, 'date_to_past_+1', (v_c1 - v_b1)::text, '1', (v_c1 - v_b1) = 1);

  IF v_u2 IS NOT NULL THEN
    SELECT total_sessions_hosted INTO v_b2 FROM public.users WHERE id = v_u2;
    -- creator_id u1 -> u2 : u1 back to baseline, u2 +1
    UPDATE public.sessions SET creator_id = v_u2 WHERE id = v_sid;
    SELECT total_sessions_hosted INTO v_c1 FROM public.users WHERE id = v_u1;
    SELECT total_sessions_hosted INTO v_c2 FROM public.users WHERE id = v_u2;
    INSERT INTO _checks VALUES (7, 'creator_change_old_-1', (v_c1 - v_b1)::text, '0', (v_c1 - v_b1) = 0);
    INSERT INTO _checks VALUES (8, 'creator_change_new_+1', (v_c2 - v_b2)::text, '1', (v_c2 - v_b2) = 1);

    -- DELETE : u2 back to baseline
    DELETE FROM public.sessions WHERE id = v_sid;
    SELECT total_sessions_hosted INTO v_c2 FROM public.users WHERE id = v_u2;
    INSERT INTO _checks VALUES (9, 'delete_-1', (v_c2 - v_b2)::text, '0', (v_c2 - v_b2) = 0);
  ELSE
    -- Only one user in the DB: creator-change/delete-on-u2 can't be exercised.
    -- DELETE on u1 instead so the DELETE path is still covered.
    DELETE FROM public.sessions WHERE id = v_sid;
    SELECT total_sessions_hosted INTO v_c1 FROM public.users WHERE id = v_u1;
    INSERT INTO _checks VALUES (7, 'creator_change_SKIPPED_need_2_users', 'n/a', 'n/a', true);
    INSERT INTO _checks VALUES (8, 'creator_change_SKIPPED_need_2_users', 'n/a', 'n/a', true);
    INSERT INTO _checks VALUES (9, 'delete_-1', (v_c1 - v_b1)::text, '0', (v_c1 - v_b1) = 0);
  END IF;
END $$;

-- ── SINGLE FINAL RESULT SET ────────────────────────────────────────────────
SELECT check_name, actual, expected, pass
FROM (
  SELECT ord, check_name, actual, expected, pass FROM _checks
  UNION ALL
  SELECT 99, 'ALL_CHECKS',
         (count(*) FILTER (WHERE pass))::text || ' of ' || count(*)::text || ' passed',
         'all true', bool_and(pass)
    FROM _checks
) q
ORDER BY q.ord;

ROLLBACK;

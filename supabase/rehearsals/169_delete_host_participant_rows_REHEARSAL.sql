-- 169_delete_host_participant_rows_REHEARSAL.sql
--
-- Rehearsal for migration 169 (T-ATH7 destructive half). Runs the real
-- migration body inside BEGIN ... ROLLBACK, so production is read and written
-- and then restored. Nothing survives this script.
--
-- WHAT IT PROVES, beyond "the delete ran":
--
--  1. The delete removes exactly the 23 host rows and NOTHING else -- the
--     surviving row count drops by exactly 23 and every surviving row is a
--     non-host row.
--  2. trg_sync_session_participant_count (migration 087) recomputes
--     sessions.current_participants on the delete, so the counter self-corrects
--     from 1 to 0 on all 23 affected sessions. This is the claim the whole
--     "render fix cannot close the counter gap" argument rests on, so it is
--     measured before and after rather than assumed.
--  3. THE GUARD ACTUALLY FIRES. A guard that stays quiet is indistinguishable
--     from a guard that is mis-aimed, so part A deliberately creates a 24th
--     host row and asserts the migration raises rather than deleting 24. That
--     synthetic row is created inside a plpgsql subtransaction, so the raise
--     rolls it back automatically and part B still sees exactly 23.
--
--  4. The cascade is bounded. Deleting a session_participants row fires
--     trg_sync_session_participant_count, which UPDATEs public.sessions -- and
--     that UPDATE in turn fires trg_sessions_updated_at (144, bumps
--     sessions.updated_at) and trg_sessions_hosted_upd (148, recomputes
--     users.total_sessions_hosted). Both are transactional, so the rollback
--     undoes them here; but when 169 is really applied, sessions.updated_at
--     WILL move on the 23 affected sessions. That is expected, not incidental,
--     so it is asserted rather than left to be discovered. The hosted counter
--     recomputes from truth and no sessions row is added or removed, so it must
--     come out unchanged -- which is also asserted.
--
--     The push-notification triggers that once sat on session_participants
--     (on_join_request_created, on_join_accepted) were dropped with their
--     functions by migration 136, and nothing left on this table calls
--     net.http_post. So no side effect escapes the ROLLBACK. The surviving
--     INSERT trigger is trg_challenge_progress (011), pure SQL.
--
-- RUN IT IN THE SUPABASE SQL EDITOR AS ONE SCRIPT. Reading a PASS/FAIL table is
-- the point; do not run the statements piecemeal.

BEGIN;

-- ── Before-state ───────────────────────────────────────────────────────────
CREATE TEMP TABLE reh_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.session_participants) AS all_rows,
  (SELECT count(*) FROM public.session_participants sp
     JOIN public.sessions s ON s.id = sp.session_id
    WHERE sp.user_id = s.creator_id
      AND sp.status = 'confirmed'
      AND sp.is_guest = false)                       AS host_rows,
  (SELECT count(*) FROM public.session_participants
    WHERE is_guest = true)                           AS guest_rows,
  (SELECT count(*) FROM public.session_participants
    WHERE status <> 'confirmed')                     AS non_confirmed_rows,
  (SELECT count(*) FROM public.sessions)             AS session_rows;

-- The affected sessions, captured with their counter value BEFORE the delete.
CREATE TEMP TABLE reh_sessions ON COMMIT DROP AS
SELECT DISTINCT s.id AS session_id, s.current_participants AS cp_before
FROM public.session_participants sp
JOIN public.sessions s ON s.id = sp.session_id
WHERE sp.user_id = s.creator_id
  AND sp.status = 'confirmed'
  AND sp.is_guest = false;

-- The cascade's reach, captured before anything is deleted.
CREATE TEMP TABLE reh_updated_at ON COMMIT DROP AS
SELECT s.id AS session_id, s.updated_at AS ua_before
FROM public.sessions s
WHERE s.id IN (SELECT session_id FROM reh_sessions);

CREATE TEMP TABLE reh_hosted ON COMMIT DROP AS
SELECT u.id AS user_id, u.total_sessions_hosted AS hosted_before
FROM public.users u
WHERE u.id IN (
  SELECT DISTINCT s.creator_id FROM public.sessions s
  WHERE s.id IN (SELECT session_id FROM reh_sessions)
);

CREATE TEMP TABLE reh_guard (fired boolean, msg text) ON COMMIT DROP;

-- ── Part A: prove the guard raises when the count is not 0 or 23 ───────────
-- The inner BEGIN ... EXCEPTION is a subtransaction. When the guard raises, the
-- synthetic INSERT above it is rolled back with the subtransaction -- including
-- the counter update its trigger made -- and only then does the handler record
-- the outcome. No savepoint needed, and part B cannot inherit the extra row.
DO $$
DECLARE
  v_found  integer;
  v_fired  boolean := false;
  v_msg    text := '(guard did not raise)';
BEGIN
  BEGIN
    INSERT INTO public.session_participants (session_id, user_id, status, is_guest)
    SELECT s.id, s.creator_id, 'confirmed', false
    FROM public.sessions s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = s.id AND sp.user_id = s.creator_id
    )
    LIMIT 1;

    SELECT count(*) INTO v_found
    FROM public.session_participants sp
    JOIN public.sessions s ON s.id = sp.session_id
    WHERE sp.user_id = s.creator_id
      AND sp.status = 'confirmed'
      AND sp.is_guest = false;

    IF v_found <> 23 AND v_found <> 0 THEN
      RAISE EXCEPTION '169 ABORTED: expected 23 host participant rows but found %.', v_found;
    END IF;
  EXCEPTION WHEN others THEN
    v_fired := true;
    v_msg := SQLERRM;
  END;

  INSERT INTO reh_guard VALUES (v_fired, v_msg);
END $$;

-- ── Part B: the real migration body, verbatim from 169 ─────────────────────
DO $$
DECLARE
  v_expected  constant integer := 23;
  v_found     integer;
  v_deleted   integer;
BEGIN
  SELECT count(*) INTO v_found
  FROM public.session_participants sp
  JOIN public.sessions s ON s.id = sp.session_id
  WHERE sp.user_id = s.creator_id
    AND sp.status = 'confirmed'
    AND sp.is_guest = false;

  IF v_found = 0 THEN
    RAISE NOTICE '169: no host participant rows found -- already applied, or a fresh rebuild. Nothing to do.';
    RETURN;
  END IF;

  IF v_found <> v_expected THEN
    RAISE EXCEPTION
      '169 ABORTED: expected % host participant rows (measured on production 2026-09-16T18:53Z) but found %. '
      'A row was added or removed since the measurement. Re-measure and re-scope this migration before applying it; '
      'do NOT widen the guard.', v_expected, v_found;
  END IF;

  DELETE FROM public.session_participants sp
  USING public.sessions s
  WHERE s.id = sp.session_id
    AND sp.user_id = s.creator_id
    AND sp.status = 'confirmed'
    AND sp.is_guest = false;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION '169 ABORTED: guard counted % rows but DELETE removed %.', v_expected, v_deleted;
  END IF;

  RAISE NOTICE '169: deleted % host participant rows.', v_deleted;
END $$;

-- ── Every check, one result set ────────────────────────────────────────────
WITH checks AS (
  SELECT 'guard_fired_on_24_rows' AS check_name,
         (SELECT CASE WHEN fired THEN 'raised' ELSE 'silent' END FROM reh_guard) AS actual,
         'raised' AS expected
  UNION ALL SELECT 'guard_message_names_the_count',
         (SELECT CASE WHEN msg LIKE '%found 24%' THEN 'yes' ELSE 'no: ' || msg END FROM reh_guard),
         'yes'
  UNION ALL SELECT 'host_rows_before',
         (SELECT host_rows::text FROM reh_before), '23'
  UNION ALL SELECT 'host_rows_after',
         (SELECT count(*)::text FROM public.session_participants sp
            JOIN public.sessions s ON s.id = sp.session_id
           WHERE sp.user_id = s.creator_id
             AND sp.status = 'confirmed'
             AND sp.is_guest = false),
         '0'
  UNION ALL SELECT 'sessions_affected',
         (SELECT count(*)::text FROM reh_sessions), '23'
  -- Nothing but the 23 was touched.
  UNION ALL SELECT 'total_rows_dropped_by_exactly_23',
         ((SELECT all_rows FROM reh_before) - (SELECT count(*) FROM public.session_participants))::text,
         '23'
  -- Both sides must come from DIFFERENT points in time or the check is a
  -- tautology. The actual is read after the delete; the expected is the value
  -- captured into reh_before, above, before it.
  UNION ALL SELECT 'guest_rows_untouched',
         (SELECT count(*)::text FROM public.session_participants WHERE is_guest = true),
         (SELECT guest_rows::text FROM reh_before)
  UNION ALL SELECT 'non_confirmed_rows_untouched',
         (SELECT count(*)::text FROM public.session_participants WHERE status <> 'confirmed'),
         (SELECT non_confirmed_rows::text FROM reh_before)
  -- THE TRIGGER CLAIM. Before: every affected session reads 1. After: every one
  -- reads 0, recomputed by trg_sync_session_participant_count on the delete,
  -- without this migration writing to sessions at all.
  UNION ALL SELECT 'counter_before_all_one',
         (SELECT count(*)::text FROM reh_sessions WHERE cp_before = 1), '23'
  UNION ALL SELECT 'counter_after_all_zero',
         (SELECT count(*)::text FROM reh_sessions r
            JOIN public.sessions s ON s.id = r.session_id
           WHERE s.current_participants = 0), '23'
  UNION ALL SELECT 'counter_matches_confirmed_rows_everywhere',
         (SELECT count(*)::text FROM public.sessions s
           WHERE s.current_participants <> (
             SELECT count(*) FROM public.session_participants sp
             WHERE sp.session_id = s.id AND sp.status = 'confirmed')),
         '0'
  -- No session that had a real athlete lost one. Measured as zero overlap
  -- before the delete; asserted here as "no affected session still holds a
  -- confirmed row", which is only true because the host was its only one.
  UNION ALL SELECT 'affected_sessions_have_no_confirmed_rows_left',
         (SELECT count(*)::text FROM reh_sessions r
           WHERE EXISTS (SELECT 1 FROM public.session_participants sp
                         WHERE sp.session_id = r.session_id AND sp.status = 'confirmed')),
         '0'
  -- The cascade, asserted rather than discovered. sessions.updated_at moving on
  -- all 23 is the expected consequence of the counter trigger's UPDATE.
  UNION ALL SELECT 'updated_at_moved_on_all_23',
         (SELECT count(*)::text FROM reh_updated_at r
            JOIN public.sessions s ON s.id = r.session_id
           WHERE s.updated_at IS DISTINCT FROM r.ua_before), '23'
  -- trg_sessions_hosted_upd recomputes from truth and no sessions row is added
  -- or removed, so the hosted counter must not move for any affected creator.
  UNION ALL SELECT 'hosted_counter_unchanged_for_affected_creators',
         (SELECT count(*)::text FROM reh_hosted r
            JOIN public.users u ON u.id = r.user_id
           WHERE u.total_sessions_hosted IS DISTINCT FROM r.hosted_before), '0'
  UNION ALL SELECT 'no_session_row_deleted',
         (SELECT count(*)::text FROM public.sessions),
         (SELECT session_rows::text FROM reh_before)
)
-- ORDER BY after a UNION accepts only result column names, not expressions
-- (0A000), so ord is materialised inside the subquery and sorted on out here.
SELECT check_name, actual, expected, pass
FROM (
  SELECT 0 AS ord,
         check_name,
         actual,
         expected,
         CASE WHEN actual = expected THEN 'PASS' ELSE '*** FAIL ***' END AS pass
  FROM checks
  UNION ALL
  SELECT 1,
         'ALL_CHECKS',
         (SELECT count(*)::text FROM checks WHERE actual = expected) || '/' ||
         (SELECT count(*)::text FROM checks),
         (SELECT count(*)::text FROM checks) || '/' ||
         (SELECT count(*)::text FROM checks),
         CASE WHEN NOT EXISTS (SELECT 1 FROM checks WHERE actual IS DISTINCT FROM expected)
              THEN 'PASS' ELSE '*** FAIL ***' END
) x
ORDER BY ord, check_name;

ROLLBACK;

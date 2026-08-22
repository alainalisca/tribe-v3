-- ============================================================================
-- 144_recur1_gate0_sessions_updated_at_REHEARSAL.sql  —  NOT A MIGRATION. DO NOT
-- let this file be auto-applied by any migration runner. Lives outside
-- supabase/migrations/.
--
-- Purpose: paste this whole file into the Supabase SQL Editor and Run once. It
-- opens a transaction, applies migration 144's body verbatim, then returns a
-- SINGLE final result set — one row per check — and ROLLS BACK, leaving ZERO
-- changes. The SQL Editor shows only the last statement's result and has no
-- Notices panel, so every check is folded into that one closing SELECT (same
-- shape as the 143 rehearsal). RAISE NOTICE / DO blocks are deliberately avoided.
--
-- Read the ALL_CHECKS row: pass = true means every check passed.
--
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- No fixtures needed: the behavioral check picks the oldest session dynamically
-- and its no-op edit is rolled back with everything else.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- MIGRATION 144 BODY (verbatim) — generic touch function + BEFORE UPDATE trigger
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON public.sessions;

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────
-- Behavioral helper — a TEMP function so the no-op UPDATE, the before/after
-- capture, and the "other columns unchanged" comparison run once and return
-- values the final SELECT can assert on. Temp objects live only for this
-- session and vanish on ROLLBACK; they never touch the committed schema.
--
-- It captures updated_at before, snapshots every other column as jsonb, does a
-- genuine no-op edit (SET title = title), then re-reads. now() is the
-- transaction start time, which is strictly later than the row's stored
-- updated_at (set in a prior transaction), so a passing trigger moves it.
-- ──────────────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.rehearsal_updated_at()
 RETURNS TABLE(before_ts timestamptz, after_ts timestamptz, moved boolean, others_unchanged boolean, tested_id uuid)
 LANGUAGE plpgsql
AS $fn$
DECLARE
  v_id         uuid;
  v_before     timestamptz;
  v_after      timestamptz;
  v_sig_before jsonb;
  v_sig_after  jsonb;
BEGIN
  SELECT s.id, s.updated_at
    INTO v_id, v_before
    FROM public.sessions s
   ORDER BY s.created_at ASC
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT NULL::timestamptz, NULL::timestamptz, false, false, NULL::uuid;
    RETURN;
  END IF;

  -- Snapshot all columns except updated_at, as a single jsonb signature.
  SELECT to_jsonb(s.*) - 'updated_at'
    INTO v_sig_before
    FROM public.sessions s
   WHERE s.id = v_id;

  -- Genuine no-op edit: content is unchanged, but the trigger must still stamp.
  UPDATE public.sessions SET title = title WHERE id = v_id;

  SELECT s.updated_at
    INTO v_after
    FROM public.sessions s
   WHERE s.id = v_id;

  SELECT to_jsonb(s.*) - 'updated_at'
    INTO v_sig_after
    FROM public.sessions s
   WHERE s.id = v_id;

  RETURN QUERY SELECT
    v_before,
    v_after,
    (v_after IS NOT NULL AND (v_before IS NULL OR v_after > v_before)),
    (v_sig_before IS NOT DISTINCT FROM v_sig_after),
    v_id;
END;
$fn$;

-- ──────────────────────────────────────────────────────────────────────────
-- SINGLE FINAL RESULT SET — one row per check, plus an ALL_CHECKS summary row.
-- `beh` is MATERIALIZED so the temp function (which performs the UPDATE) runs
-- exactly once even though two checks read from it.
-- ──────────────────────────────────────────────────────────────────────────
WITH beh AS MATERIALIZED (
  SELECT * FROM pg_temp.rehearsal_updated_at()
),
trg AS (
  SELECT tgtype
    FROM pg_trigger
   WHERE tgrelid = 'public.sessions'::regclass
     AND tgname  = 'trg_sessions_updated_at'
     AND NOT tgisinternal
),
fn AS (
  SELECT btrim(regexp_replace(prosrc, '\s+', ' ', 'g')) AS body
    FROM pg_proc
   WHERE proname = 'update_updated_at_column'
     AND pronamespace = 'public'::regnamespace
),
checks(ord, check_name, actual, expected, pass) AS (
  -- 1. the trigger exists on sessions
  SELECT 1, 'trigger_registered'::text,
    (EXISTS (SELECT 1 FROM trg))::text,
    'true'::text,
    COALESCE(EXISTS (SELECT 1 FROM trg), false)

  UNION ALL
  -- 2. it fires BEFORE UPDATE, not AFTER (pg_trigger.tgtype bitmask: 2=BEFORE, 16=UPDATE)
  SELECT 2, 'trigger_is_before_update'::text,
    COALESCE(
      (CASE WHEN ((SELECT tgtype FROM trg) & 2) > 0 THEN 'BEFORE' ELSE 'AFTER' END)
        || ' UPDATE=' || (((SELECT tgtype FROM trg) & 16) > 0)::text,
      'trigger missing'),
    'BEFORE UPDATE=true'::text,
    COALESCE(((SELECT tgtype FROM trg) & 2) > 0 AND ((SELECT tgtype FROM trg) & 16) > 0, false)

  UNION ALL
  -- 3. the function body is exactly the generic touch body
  SELECT 3, 'function_body_correct'::text,
    COALESCE((SELECT body FROM fn), 'function missing'),
    'BEGIN NEW.updated_at = now(); RETURN NEW; END;'::text,
    COALESCE((SELECT body FROM fn) = 'BEGIN NEW.updated_at = now(); RETURN NEW; END;', false)

  UNION ALL
  -- 4. a no-op UPDATE moves updated_at forward
  SELECT 4, 'updated_at_moves'::text,
    COALESCE(b.before_ts::text, '(none)') || ' -> ' || COALESCE(b.after_ts::text, '(none)'),
    'after > before'::text,
    COALESCE(b.moved, false)
    FROM beh b

  UNION ALL
  -- 5. that same UPDATE changed nothing else on the row
  SELECT 5, 'no_other_side_effects'::text,
    CASE WHEN b.others_unchanged THEN 'other columns unchanged' ELSE 'other columns CHANGED' END,
    'other columns unchanged'::text,
    COALESCE(b.others_unchanged, false)
    FROM beh b
)
SELECT check_name, actual, expected, pass
FROM (
  SELECT ord, check_name, actual, expected, pass FROM checks
  UNION ALL
  SELECT 6,
         'ALL_CHECKS'::text,
         (count(*) FILTER (WHERE pass))::text || ' of ' || count(*)::text || ' passed',
         'all true'::text,
         bool_and(pass)
    FROM checks
) q
ORDER BY q.ord;

ROLLBACK;

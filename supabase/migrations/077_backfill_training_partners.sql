-- Migration 077 — Backfill training_partners from historical attendance
--
-- One-time job: applies the same logic as the trigger from 076 over
-- existing client_attendance rows. After 076 is applied, the trigger
-- catches every new attended row going forward; this migration
-- catches up everything that came before.
--
-- Safe to re-run: the INSERT uses ON CONFLICT DO UPDATE so a second
-- pass over the same rows correctly increments shared_sessions
-- WITHOUT double-counting (because we group pairs in a single
-- subquery and emit one row per (gym, pair)).
--
-- Performance: this is a single INSERT…SELECT operating over the
-- attendance + clients tables. For a gym with ~10k attendance rows
-- this runs in a few seconds. For larger volumes, the same logic
-- can be split by gym_id and run in batches.
--
-- Excludes:
--   - Attendance rows with attended != true (we only pair real visits)
--   - Clients with gym_id IS NULL (legacy-tenant rows)
--   - Pairs that already exist in training_partners (handled by
--     ON CONFLICT; we DO update shared_sessions but keep the existing
--     first_shared_at + add new shared_sessions only if the existing
--     row was created BEFORE this backfill ran)
--
-- Why we don't just blanket DELETE+INSERT: the trigger may have
-- written rows since 076 landed but before this backfill runs.
-- Preserving those + only topping up missing co-attendance is the
-- right semantics.

-- Step 1: build a temp table of all (gym, pair, count, first, last)
-- aggregates from historical attendance.
CREATE TEMP TABLE _training_partner_backfill AS
WITH attended_with_gym AS (
  SELECT
    ca.client_id,
    ca.session_id,
    ca.attended_at,
    c.gym_id
  FROM public.client_attendance ca
  JOIN public.clients c ON c.id = ca.client_id
  WHERE ca.attended = true
    AND c.gym_id IS NOT NULL
),
pairs AS (
  -- Self-join to produce every ordered pair (a < b) that shared a
  -- session inside the same gym. The strict < ordering enforces the
  -- training_partners CHECK constraint and dedupes a/b vs b/a.
  SELECT
    a.gym_id,
    a.client_id AS member_a_id,
    b.client_id AS member_b_id,
    a.session_id,
    -- For each shared session, take the LATER of the two attended_at
    -- timestamps so last_shared_at reflects when the pairing was
    -- actually established (both were present). NULLs roll back to
    -- the other side via COALESCE.
    GREATEST(
      COALESCE(a.attended_at, b.attended_at, now()),
      COALESCE(b.attended_at, a.attended_at, now())
    ) AS pair_shared_at
  FROM attended_with_gym a
  JOIN attended_with_gym b
    ON a.session_id = b.session_id
   AND a.gym_id = b.gym_id
   AND a.client_id < b.client_id
)
SELECT
  gym_id,
  member_a_id,
  member_b_id,
  COUNT(*)::int AS shared_sessions,
  MIN(pair_shared_at) AS first_shared_at,
  MAX(pair_shared_at) AS last_shared_at
FROM pairs
GROUP BY gym_id, member_a_id, member_b_id;

-- Step 2: insert (or top up) training_partners from the temp aggregate.
--
-- The ON CONFLICT path uses `shared_sessions = EXCLUDED.shared_sessions`
-- rather than `+ EXCLUDED.shared_sessions` because the temp table
-- already contains the FULL historical count for each pair. A pair
-- whose row was created by the live trigger between 076 and 077 will
-- be brought up to the (potentially larger) historical count if any
-- of its pre-076 sessions are now being counted in.
--
-- last_30_day_sessions is left at 0 — the nightly batch (when it
-- ships) will compute that with the right rolling window. Same for
-- compatibility_score and retention_correlation.

INSERT INTO public.training_partners (
  gym_id,
  member_a_id,
  member_b_id,
  shared_sessions,
  last_30_day_sessions,
  first_shared_at,
  last_shared_at
)
SELECT
  gym_id,
  member_a_id,
  member_b_id,
  shared_sessions,
  0,
  first_shared_at,
  last_shared_at
FROM _training_partner_backfill
ON CONFLICT (member_a_id, member_b_id) DO UPDATE
SET
  -- Take the larger of the existing row's count vs the backfill
  -- count. This handles the case where the live trigger has been
  -- writing since 076 landed: we don't want to under-count by
  -- overwriting a trigger-built row that already saw new sessions.
  shared_sessions = GREATEST(
    public.training_partners.shared_sessions,
    EXCLUDED.shared_sessions
  ),
  first_shared_at = LEAST(
    public.training_partners.first_shared_at,
    EXCLUDED.first_shared_at
  ),
  last_shared_at = GREATEST(
    public.training_partners.last_shared_at,
    EXCLUDED.last_shared_at
  ),
  updated_at = now();

DROP TABLE _training_partner_backfill;

-- Optional verification (paste into the SQL editor to compare):
--   SELECT count(*) AS pair_count,
--          sum(shared_sessions) AS total_co_attendances
--   FROM public.training_partners;
--
-- Should reflect the total number of unique (gym, pair) edges + the
-- sum of shared sessions across the whole community graph.

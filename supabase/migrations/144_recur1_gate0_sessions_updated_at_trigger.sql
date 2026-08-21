-- 144_recur1_gate0_sessions_updated_at_trigger.sql
-- T-RECUR1 Gate 0: make session edits recordable.
--
-- WHY:
--   The `sessions` table has no BEFORE UPDATE trigger, and the edit path
--   (updateSessionAsHost in lib/dal/sessions.ts) builds its update object from
--   form fields only and never sets `updated_at`. Only cancelSession sets it
--   explicitly. The result: editing a session (title, date, price, recurrence
--   pattern, anything) does NOT move `updated_at`, so the database cannot answer
--   "was this row edited, and when". That gap is why an instructor's "I changed
--   it and it did not save" was unanswerable, and why parent price/pattern edits
--   are invisible (they leave existing children stranded with no timestamp trail).
--
--   This migration attaches the existing generic touch-updated-at function to
--   `sessions` so every UPDATE stamps `updated_at = now()`.
--
-- SCOPE:
--   Additive and rolling-safe. It adds a BEFORE UPDATE trigger only; it does not
--   add or alter columns, does not backfill, and does not rewrite existing rows.
--   `updated_at` already exists on `sessions` and is already typed in
--   lib/database.types.ts, so no type regeneration is required.
--
-- SAFETY:
--   A risk survey confirmed nothing currently reads `sessions.updated_at`
--   functionally: no ORDER BY / range filter on it, no cache key, no ISR
--   revalidation, no realtime sync, and the /api/og cache key is built from
--   query params and timestamped storage filenames, not from updated_at. So a
--   now-live `updated_at` is behaviorally invisible to existing reads.
--
--   cancelSession still sets `updated_at` explicitly in code. With this trigger
--   that write becomes redundant, but it is harmless (both resolve to ~now()),
--   and removing it is a code change that is intentionally out of scope for this
--   migration-only gate. Leave it; a later code gate may drop it.

-- The generic function already exists (first defined in
-- 013_product_storefront.sql for products / product_orders). Re-declaring it
-- CREATE OR REPLACE with the identical body keeps this migration self-contained
-- and idempotent; it is a no-op against the current definition.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Idempotent attach: drop any prior copy of this trigger before creating it, so
-- re-running the migration does not error. (Do not use CREATE TABLE IF NOT
-- EXISTS style guards here; this is a trigger, and a stale trigger must be
-- replaced, not silently skipped.)
DROP TRIGGER IF EXISTS trg_sessions_updated_at ON public.sessions;

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

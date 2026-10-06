-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV22
-- RENUMBERED: was 8207_t_av22_program_columns_server_only.sql until 2026-10-06 (T-AV31). 8200 to 8209 became 201
--   to 210 at the merge gate, skipping 194, 195 and 200, which unmerged
--   branches already claim (Al's decision, docs/ATHLETE_VALUE_MERGE_GATE.md).
-- CREATES: policy "Program columns are server only" on public.pass_leads (AS RESTRICTIVE, FOR INSERT, all roles)
-- RISK: HIGH
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV22 (7 of 7): no client role, admin included, inserts a program column
-- ════════════════════════════════════════════════════════════════════════════
--
-- 208 was free on origin/main (highest 198, d236656d), every branch, every
-- worktree and all history on 2026-09-30.
--
-- WHAT THE PROBE MATRIX FOUND
--   Spec rule 5.8: no client role can insert or update any column this
--   program adds to pass_leads. The claim policy's IS NULL clauses (201,
--   204) bind anon and ordinary users. They do not bind an admin, because
--   "Admins manage pass leads" is a second PERMISSIVE policy (FOR ALL,
--   is_app_admin()), and permissive policies OR: an admin's insert passes on
--   that policy alone. Measured 2026-09-30: an admin JWT inserted a lead with
--   referred_by_athlete_id set, 0 -> 1. A hand-made admin row would be
--   indistinguishable from a real claim credited to an athlete.
--
-- THE FIX IS ADDITIVE (Al, 2026-09-30, decision 1)
--   A RESTRICTIVE policy ANDs with every permissive one, so this constrains
--   the admin path without touching it. Neither "Admins manage pass leads" nor
--   the claim policy is altered. CLAUDE.md, "PERMISSIVE POLICIES OR TOGETHER":
--   tightening one permissive policy among several constrains nothing, and
--   RESTRICTIVE is the exception that can. This is the first restrictive
--   policy in this repo, which is why it says so here.
--
-- WHO IS NOT AFFECTED
--   * The service role (/api/pase's insert, getServiceRoleClient) has
--     BYPASSRLS, so it still writes attributed leads (T-AV23).
--   * The definer functions (201, 206) UPDATE rather than INSERT, and run
--     as the table owner.
--   * A plain lead with every program column NULL passes, for everyone the
--     permissive policies already admit.
--
-- UPDATE is not covered and does not need to be: no client role holds UPDATE
-- on pass_leads (asserted by 201 and 204).

BEGIN;

DROP POLICY IF EXISTS "Program columns are server only" ON public.pass_leads;
CREATE POLICY "Program columns are server only" ON public.pass_leads
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
        attended_at IS NULL
    AND attended_marked_by IS NULL
    AND attended_method IS NULL
    AND referred_by_athlete_id IS NULL
    AND outcome IS NULL
    AND outcome_at IS NULL
    AND outcome_marked_by IS NULL
    AND retained_at IS NULL
    AND bonus_eligible IS NULL
    AND bonus_settled_at IS NULL
    AND bonus_settled_by IS NULL
  );

DO $$
DECLARE
  v_row record;
  v_col text;
BEGIN
  SELECT roles::text AS roles, cmd, permissive, with_check INTO v_row FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads' AND policyname = 'Program columns are server only';
  IF v_row.with_check IS NULL OR v_row.permissive <> 'RESTRICTIVE' OR v_row.cmd <> 'INSERT' OR v_row.roles <> '{public}' THEN
    RAISE EXCEPTION '208 ABORTED: the policy is missing or is not RESTRICTIVE, FOR INSERT, for all roles.';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['attended_at', 'attended_marked_by', 'attended_method',
                               'referred_by_athlete_id', 'outcome', 'outcome_at', 'outcome_marked_by',
                               'retained_at', 'bonus_eligible', 'bonus_settled_at', 'bonus_settled_by'] LOOP
    IF position(v_col || ' IS NULL' IN v_row.with_check) = 0 THEN
      RAISE EXCEPTION '208 ABORTED: the restrictive policy has no "% IS NULL" clause.', v_col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads'
                  AND policyname = 'Admins manage pass leads' AND permissive = 'PERMISSIVE') THEN
    RAISE EXCEPTION '208 ABORTED: "Admins manage pass leads" is not as expected; this file must not have changed it.';
  END IF;
  RAISE NOTICE '208: program columns are server only, for every client role including admin.';
END $$;

-- ── Record this migration as applied (T-AV31: renumbered into main's sequence,
--    so it records itself like every migration since 184) ─────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('208_t_av22_program_columns_server_only', 'T-AV22: restrictive INSERT policy, program columns server only (was 8207)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

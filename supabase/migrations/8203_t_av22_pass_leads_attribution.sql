-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV22
-- TABLE: public.pass_leads OWNER: consumer
-- ALTERS: public.pass_leads (8 columns, 1 CHECK, 1 partial index), policy "Anyone can claim a pass"
-- RISK: HIGH
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV22 (3 of 5): attribution and outcome on pass_leads
-- ════════════════════════════════════════════════════════════════════════════
--
-- 8203 was free on origin/main (highest 198), every branch, every worktree and
-- all history on 2026-09-29.
--
-- THE EIGHT COLUMNS
--   referred_by_athlete_id  the program athlete whose code the guest used
--   outcome                 joined | follow_up | not_now | already_member
--   outcome_at              when the outcome was last set
--   outcome_marked_by       who set it
--   retained_at             owner or admin confirmed the guest stayed
--   bonus_eligible          set when the outcome BECOMES joined: true if the
--                           referring athlete's level at that moment is
--                           athlete or sponsored, false if captain; NULL
--                           whenever the outcome is not joined. (Al,
--                           2026-09-29, decision 2: a captain's join counts as
--                           joined and never as a bonus owed. The level at
--                           the moment of the join is recorded because the
--                           current level cannot say when the join happened.)
--   bonus_settled_at        the gym ticked "paid"
--   bonus_settled_by        who ticked it
--
-- WHY THE INSERT POLICY IS REPLACED AGAIN (recon F2)
--   The new columns inherit the table-level INSERT that anon and
--   authenticated hold. Without this, anyone with the anon key could POST a
--   lead already credited to an athlete, joined and bonus-eligible. The
--   policy is T-AV21's (8200) text copied verbatim, with exactly eight
--   IS NULL clauses appended. Only definer functions and the service-role
--   /api/pase insert write these columns.
--
--   Re-running 8200 after this file would drop these eight clauses. 8200 now
--   carries a pre-flight that aborts when referred_by_athlete_id exists.
--
-- NOT A migrations_applied ROW: the 8000 block is renumbered at the merge gate.

BEGIN;

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.pass_leads
  ADD COLUMN IF NOT EXISTS referred_by_athlete_id uuid REFERENCES public.program_athletes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome                text,
  ADD COLUMN IF NOT EXISTS outcome_at             timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_marked_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retained_at            timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_eligible         boolean,
  ADD COLUMN IF NOT EXISTS bonus_settled_at       timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_settled_by       uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_outcome_check;
ALTER TABLE public.pass_leads
  ADD CONSTRAINT pass_leads_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('joined', 'follow_up', 'not_now', 'already_member'));

CREATE INDEX IF NOT EXISTS pass_leads_referred_by_athlete_idx
  ON public.pass_leads (referred_by_athlete_id)
  WHERE referred_by_athlete_id IS NOT NULL;

-- ── 2. Close the insert path again (F2) ─────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can claim a pass" ON "public"."pass_leads";
CREATE POLICY "Anyone can claim a pass" ON "public"."pass_leads" FOR INSERT WITH CHECK (((("char_length"("name") >= 2) AND ("char_length"("name") <= 80)) AND ("email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::"text") AND ("whatsapp" ~ '^\+[1-9][0-9]{7,14}$'::"text") AND (("char_length"("consent_text") >= 20) AND ("char_length"("consent_text") <= 500)) AND ("notified_at" IS NULL) AND ("contacted_at" IS NULL) AND ("tribe_user_id" IS NULL) AND "public"."pass_is_active"("partner_id", "slug") AND ("attended_at" IS NULL) AND ("attended_marked_by" IS NULL) AND ("attended_method" IS NULL) AND ("referred_by_athlete_id" IS NULL) AND ("outcome" IS NULL) AND ("outcome_at" IS NULL) AND ("outcome_marked_by" IS NULL) AND ("retained_at" IS NULL) AND ("bonus_eligible" IS NULL) AND ("bonus_settled_at" IS NULL) AND ("bonus_settled_by" IS NULL)));

-- ── 3. Assert the end state, after the writes ───────────────────────────────
DO $$
DECLARE
  v_check text;
  v_col   text;
BEGIN
  SELECT with_check INTO v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads' AND policyname = 'Anyone can claim a pass';
  IF v_check IS NULL OR position('pass_is_active' IN v_check) = 0 THEN
    RAISE EXCEPTION '8203 ABORTED: the claim policy is missing or lost its pass_is_active check.';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['attended_at', 'attended_marked_by', 'attended_method',
                               'referred_by_athlete_id', 'outcome', 'outcome_at', 'outcome_marked_by',
                               'retained_at', 'bonus_eligible', 'bonus_settled_at', 'bonus_settled_by'] LOOP
    IF position(v_col || ' IS NULL' IN v_check) = 0 THEN
      RAISE EXCEPTION '8203 ABORTED: the claim policy has no "% IS NULL" clause.', v_col;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'pass_leads' AND cmd IN ('INSERT', 'ALL')
         AND permissive = 'PERMISSIVE' AND policyname NOT IN ('Anyone can claim a pass', 'Admins manage pass leads')) > 0 THEN
    RAISE EXCEPTION '8203 ABORTED: another permissive INSERT policy on pass_leads would reopen F2.';
  END IF;
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '8203 ABORTED: a client role holds UPDATE on pass_leads.';
  END IF;
  RAISE NOTICE '8203: attribution and outcome columns added, claim policy closed over all eleven.';
END $$;

COMMIT;

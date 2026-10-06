-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV22
-- RENUMBERED: was 8202_t_av22_program_athletes.sql until 2026-10-06 (T-AV31). 8200 to 8209 became 201
--   to 210 at the merge gate, skipping 194, 195 and 200, which unmerged
--   branches already claim (Al's decision, docs/ATHLETE_VALUE_MERGE_GATE.md).
-- TABLE: public.program_athletes OWNER: t-av-new
-- CREATES: public.program_athletes, RLS, column grants; policy "Program athletes read their program" on public.athlete_programs (202's table, t-av-new)
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV22 (2 of 5): the athletes of a program
-- ════════════════════════════════════════════════════════════════════════════
--
-- 203 was free on origin/main (highest 198), every branch, every worktree and
-- all history on 2026-09-29.
--
-- CONTACT COLUMNS
--   email_lower (copied from users.email when the athlete is added) and
--   whatsapp_e164 exist for the self-referral rule (spec 5.4, D11). No client
--   role can SELECT them: they are left out of the column grant, so they reach
--   the owner and admin only through av_athletes_partner_summary.
--
-- WHATSAPP IS E.164 OR NOTHING (Al, 2026-09-29, decision 6)
--   The CHECK below refuses anything that is not E.164. The table does NOT
--   normalize: /api/pase normalizes with lib/pase/phone.ts, SQL cannot call
--   that, and a second normalizer written in SQL would drift from it. Callers
--   (T-AV26's add-athlete form) normalize with lib/pase/phone before calling
--   av_athletes_add.
--
-- NO CLIENT WRITES
--   INSERT, UPDATE and DELETE are granted to no client role. Every write goes
--   through the definer functions in 206 (writes), which enforce the pilot cap and the
--   level rules.
--
-- THE ATHLETES' READ OF athlete_programs LIVES HERE because it references
-- this table. It is a second permissive SELECT policy on athlete_programs, so
-- that table's SELECT set is exactly two policies, ORed; the assert below
-- counts them.

BEGIN;

-- ── 1. The table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.program_athletes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid NOT NULL REFERENCES public.athlete_programs(partner_id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  level         text NOT NULL DEFAULT 'captain' CONSTRAINT program_athletes_level_check
                  CHECK (level IN ('captain', 'athlete', 'sponsored')),
  status        text NOT NULL DEFAULT 'active' CONSTRAINT program_athletes_status_check
                  CHECK (status IN ('active', 'paused', 'ended')),
  ref_code      text NOT NULL CONSTRAINT program_athletes_ref_code_key UNIQUE
                  CONSTRAINT program_athletes_ref_code_check CHECK (ref_code ~ '^[A-Z0-9-]{4,24}$'),
  email_lower   text NOT NULL CONSTRAINT program_athletes_email_lower_check
                  CHECK (email_lower = lower(email_lower) AND length(email_lower) > 0),
  whatsapp_e164 text CONSTRAINT program_athletes_whatsapp_e164_check
                  CHECK (whatsapp_e164 IS NULL OR whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  started_on    date NOT NULL DEFAULT current_date,
  ended_on      date,
  added_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_athletes_partner_user_key UNIQUE (partner_id, user_id)
);

CREATE INDEX IF NOT EXISTS program_athletes_user_id_idx ON public.program_athletes (user_id);

CREATE OR REPLACE TRIGGER program_athletes_updated_at
  BEFORE UPDATE ON public.program_athletes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. Grants, from zero ────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.program_athletes FROM public, anon, authenticated;
GRANT ALL ON TABLE public.program_athletes TO service_role;

GRANT SELECT (id, partner_id, user_id, level, status, ref_code, started_on, ended_on,
              added_by, created_at, updated_at)
  ON public.program_athletes TO authenticated;

-- ── 3. Row security ─────────────────────────────────────────────────────────
ALTER TABLE public.program_athletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athletes and program staff read athletes" ON public.program_athletes;
CREATE POLICY "Athletes and program staff read athletes" ON public.program_athletes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.av_my_partner_role(partner_id) IS NOT NULL);

DROP POLICY IF EXISTS "Program athletes read their program" ON public.athlete_programs;
CREATE POLICY "Program athletes read their program" ON public.athlete_programs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.program_athletes pa
                  WHERE pa.partner_id = athlete_programs.partner_id
                    AND pa.user_id = auth.uid()
                    AND pa.status = 'active'));

-- ── 4. Assert the end state ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.program_athletes'::regclass) THEN
    RAISE EXCEPTION '203 ABORTED: RLS is not enabled on program_athletes.';
  END IF;
  IF has_any_column_privilege('anon', 'public.program_athletes', 'SELECT')
     OR has_any_column_privilege('anon', 'public.program_athletes', 'INSERT')
     OR has_any_column_privilege('anon', 'public.program_athletes', 'UPDATE')
     OR has_table_privilege('anon', 'public.program_athletes', 'DELETE') THEN
    RAISE EXCEPTION '203 ABORTED: anon holds a privilege on program_athletes.';
  END IF;
  IF has_any_column_privilege('authenticated', 'public.program_athletes', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.program_athletes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.program_athletes', 'DELETE') THEN
    RAISE EXCEPTION '203 ABORTED: authenticated can write program_athletes directly.';
  END IF;
  IF has_column_privilege('authenticated', 'public.program_athletes', 'email_lower', 'SELECT')
     OR has_column_privilege('authenticated', 'public.program_athletes', 'whatsapp_e164', 'SELECT') THEN
    RAISE EXCEPTION '203 ABORTED: authenticated can SELECT an athlete contact column.';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'athlete_programs'
         AND cmd IN ('SELECT', 'ALL') AND permissive = 'PERMISSIVE') <> 2 THEN
    RAISE EXCEPTION '203 ABORTED: athlete_programs must have exactly two permissive SELECT policies.';
  END IF;
  RAISE NOTICE '203: program_athletes created, no client writes, contact columns unselectable.';
END $$;

-- ── Record this migration as applied (T-AV31: renumbered into main's sequence,
--    so it records itself like every migration since 184) ─────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('203_t_av22_program_athletes', 'T-AV22: program_athletes, no client writes, contact columns unselectable (was 8202)')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

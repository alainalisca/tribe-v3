-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV22
-- TABLE: public.athlete_programs OWNER: t-av-new
-- CREATES: public.athlete_programs, RLS, column grants, updated_at trigger, is_active admin guard, av_my_partner_role(uuid)
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV22 (1 of 5): one program row per partner gym
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch-only, reserved T-AV block, renumbered at the merge gate. 8201 was
-- free on origin/main (highest 198, d236656d), every branch, every worktree
-- and all history on 2026-09-29.
--
-- WHO SEES WHAT
--   SELECT: owner, active coach, admin (this file); active athletes of the
--   program (8202, which is where program_athletes exists).
--   UPDATE: owner and admin, and only the columns granted below.
--   INSERT, DELETE: admin only.
--
-- WHY THE BONUS COLUMNS ARE NOT SELECTABLE AT ALL (Al, 2026-09-29, decision 4)
--   Column grants are per ROLE, not per row, and coaches, owners and athletes
--   are all `authenticated`. A coach allowed to SELECT conversion_bonus_cop on
--   this table would read the bonus directly and make "the coach payload has
--   no bonus fields" (acceptance 4) decorative. Owners, admins and athletes
--   get those fields through the definer functions in 8206.
--
-- WHY is_active NEEDS A TRIGGER AS WELL AS A GRANT (decision 3)
--   The admin is also `authenticated`, so no grant can let the admin write
--   is_active while refusing the owner. UPDATE (is_active) is granted and a
--   BEFORE UPDATE trigger refuses the change unless is_app_admin(), the same
--   shape as users_is_admin_guard. auth.uid() IS NULL (service role, a
--   postgres session) passes, as it does there.
--
-- WHY av_my_partner_role IS EXECUTABLE BY authenticated
--   Policies run as the caller, so any function a policy calls must be
--   executable by the caller. T-AV21's av_can_work_door is deliberately not.
--   This one answers only about the CALLER: 'admin', 'owner', 'coach' (active,
--   is_active IS TRUE) or NULL. It can tell a signed-in user nothing about
--   anyone else.
--
-- NOT A migrations_applied ROW: the 8000 block is renumbered at the merge gate.

BEGIN;

-- ── 1. The table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_programs (
  partner_id              uuid PRIMARY KEY REFERENCES public.featured_partners(id) ON DELETE CASCADE,
  is_active               boolean NOT NULL DEFAULT false,
  welcome_offer_en        text,
  welcome_offer_es        text,
  showup_reward_en        text,
  showup_reward_es        text,
  class_access_en         text,
  class_access_es         text,
  conversion_bonus_cop    integer CONSTRAINT athlete_programs_bonus_cop_check
                            CHECK (conversion_bonus_cop IS NULL OR conversion_bonus_cop BETWEEN 0 AND 5000000),
  conversion_bonus_note_en text,
  conversion_bonus_note_es text,
  retention_days          integer NOT NULL DEFAULT 30 CONSTRAINT athlete_programs_retention_days_check
                            CHECK (retention_days BETWEEN 7 AND 180),
  promote_at_showups      integer NOT NULL DEFAULT 10 CONSTRAINT athlete_programs_promote_at_check
                            CHECK (promote_at_showups BETWEEN 1 AND 100),
  max_athletes            integer NOT NULL DEFAULT 5 CONSTRAINT athlete_programs_max_athletes_check
                            CHECK (max_athletes BETWEEN 1 AND 50),
  pilot_starts_on         date,
  pilot_ends_on           date,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER athlete_programs_updated_at
  BEFORE UPDATE ON public.athlete_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. is_active is admin only ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athlete_programs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND auth.uid() IS NOT NULL
     AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Only an admin can turn an athlete program on or off'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_athlete_programs_guard() FROM public, anon, authenticated;

CREATE OR REPLACE TRIGGER athlete_programs_is_active_guard
  BEFORE UPDATE ON public.athlete_programs
  FOR EACH ROW EXECUTE FUNCTION public.av_athlete_programs_guard();

-- ── 3. The caller's role at a partner ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_my_partner_role(p_partner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_partner_id IS NULL THEN NULL
    WHEN public.is_app_admin() THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.featured_partners fp
                  WHERE fp.id = p_partner_id AND fp.user_id = auth.uid()) THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM public.partner_instructors pi
                  WHERE pi.partner_id = p_partner_id
                    AND pi.instructor_id = auth.uid()
                    AND pi.is_active IS TRUE) THEN 'coach'
  END;
$fn$;

REVOKE ALL ON FUNCTION public.av_my_partner_role(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.av_my_partner_role(uuid) TO authenticated;

-- ── 4. Grants, from zero ────────────────────────────────────────────────────
-- Supabase's default privileges hand a new public table ALL to anon and
-- authenticated. Revoke that first; everything below is deliberate.
REVOKE ALL ON TABLE public.athlete_programs FROM public, anon, authenticated;
GRANT ALL ON TABLE public.athlete_programs TO service_role;

GRANT SELECT (partner_id, is_active, welcome_offer_en, welcome_offer_es,
              showup_reward_en, showup_reward_es, class_access_en, class_access_es,
              retention_days, promote_at_showups, max_athletes,
              pilot_starts_on, pilot_ends_on, created_at, updated_at)
  ON public.athlete_programs TO authenticated;

GRANT UPDATE (welcome_offer_en, welcome_offer_es, showup_reward_en, showup_reward_es,
              class_access_en, class_access_es, conversion_bonus_cop,
              conversion_bonus_note_en, conversion_bonus_note_es, retention_days,
              promote_at_showups, max_athletes, pilot_starts_on, pilot_ends_on, is_active)
  ON public.athlete_programs TO authenticated;

GRANT INSERT, DELETE ON TABLE public.athlete_programs TO authenticated;

-- ── 5. Row security ─────────────────────────────────────────────────────────
ALTER TABLE public.athlete_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Program staff read the program" ON public.athlete_programs;
CREATE POLICY "Program staff read the program" ON public.athlete_programs
  FOR SELECT TO authenticated
  USING (public.av_my_partner_role(partner_id) IS NOT NULL);

DROP POLICY IF EXISTS "Owner or admin edits the program" ON public.athlete_programs;
CREATE POLICY "Owner or admin edits the program" ON public.athlete_programs
  FOR UPDATE TO authenticated
  USING (public.av_my_partner_role(partner_id) IN ('owner', 'admin'))
  WITH CHECK (public.av_my_partner_role(partner_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Admins create programs" ON public.athlete_programs;
CREATE POLICY "Admins create programs" ON public.athlete_programs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Admins delete programs" ON public.athlete_programs;
CREATE POLICY "Admins delete programs" ON public.athlete_programs
  FOR DELETE TO authenticated
  USING (public.is_app_admin());

-- ── 6. Assert the end state ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.athlete_programs'::regclass) THEN
    RAISE EXCEPTION '8201 ABORTED: RLS is not enabled on athlete_programs.';
  END IF;
  IF has_any_column_privilege('anon', 'public.athlete_programs', 'SELECT')
     OR has_any_column_privilege('anon', 'public.athlete_programs', 'INSERT')
     OR has_any_column_privilege('anon', 'public.athlete_programs', 'UPDATE')
     OR has_table_privilege('anon', 'public.athlete_programs', 'DELETE') THEN
    RAISE EXCEPTION '8201 ABORTED: anon holds a privilege on athlete_programs.';
  END IF;
  IF has_column_privilege('authenticated', 'public.athlete_programs', 'conversion_bonus_cop', 'SELECT')
     OR has_column_privilege('authenticated', 'public.athlete_programs', 'conversion_bonus_note_en', 'SELECT')
     OR has_column_privilege('authenticated', 'public.athlete_programs', 'conversion_bonus_note_es', 'SELECT') THEN
    RAISE EXCEPTION '8201 ABORTED: authenticated can SELECT a bonus column directly.';
  END IF;
  IF has_column_privilege('authenticated', 'public.athlete_programs', 'partner_id', 'UPDATE') THEN
    RAISE EXCEPTION '8201 ABORTED: authenticated can move a program to another partner.';
  END IF;
  IF has_function_privilege('anon', 'public.av_my_partner_role(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.av_my_partner_role(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '8201 ABORTED: av_my_partner_role grants are wrong.';
  END IF;
  -- Named rather than counted: 8202 adds a fifth (the athletes' read), and a
  -- count would make this file abort on an ordinary re-run after 8202.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'athlete_programs'
         AND policyname IN ('Program staff read the program', 'Owner or admin edits the program',
                            'Admins create programs', 'Admins delete programs')) <> 4 THEN
    RAISE EXCEPTION '8201 ABORTED: a program policy is missing.';
  END IF;
  RAISE NOTICE '8201: athlete_programs created, grants from zero, is_active guarded.';
END $$;

COMMIT;

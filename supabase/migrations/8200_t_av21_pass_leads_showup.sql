-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV21
-- TABLE: public.pass_leads OWNER: consumer
-- ALTERS: public.pass_leads (3 columns), policy "Anyone can claim a pass"
-- RISK: HIGH
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV21: the pass show-up core, shared with T-AV10
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch-only. Numbered in the reserved T-AV block and renumbered into main's
-- sequence at the merge gate, reading origin/main at that moment. 8200 was
-- free on origin/main (highest 198), every branch and every worktree on
-- 2026-09-29.
--
-- WHAT IT ADDS
--   * pass_leads.attended_at, attended_marked_by, attended_method (the names
--     T-AV10 fixed in parent decision 8).
--   * av_door_pass(code): the door's READ. Coaches cannot SELECT pass_leads
--     (recon F6), so the door reads through this.
--   * av_confirm_pass_attendance(code, method): the door's only WRITE.
--
-- WHY THE INSERT POLICY IS REPLACED (recon F2)
--   ADD COLUMN inherits the table-level privileges, and anon and authenticated
--   hold table-level INSERT on pass_leads. Without this, anyone with the public
--   anon key could POST a lead that is already "attended". The policy is
--   dropped and recreated in the same transaction as the columns, with the
--   existing predicate copied verbatim from the production dump
--   (supabase/av-local-schema.sql:8523) and exactly three clauses appended:
--   attended_at, attended_marked_by and attended_method must be NULL.
--   The dump has no COMMENT on this policy, so none is added.
--
-- AUTHORIZATION, AND WHY THE REFUSAL IS ONE SHAPE
--   The caller must own the lead's partner (featured_partners.user_id), be an
--   active coach of it (partner_instructors.is_active IS TRUE, so FALSE and
--   NULL are both refused), or be an app admin. Everyone else, and every code
--   that does not exist, gets the SAME {success:false, error:'not_found'}, so
--   the response cannot be used to learn which pass codes exist.
--   av_can_work_door is the single place that rule lives; both functions call
--   it. Client roles cannot execute it.
--
-- WHAT THE DOOR MAY SEE
--   Partner name, the guest's FIRST name only (the first word of the name they
--   typed), claim time and attended_at. Never the full name, email or WhatsApp.
--   T-AV22 adds athlete first name, outcome and welcome offer.
--
-- NOT A migrations_applied ROW
--   The 8000 block is renumbered at the merge gate; the record belongs to the
--   renumbered file.

BEGIN;

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.pass_leads
  ADD COLUMN IF NOT EXISTS attended_at        timestamptz,
  ADD COLUMN IF NOT EXISTS attended_marked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attended_method    text;

ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_attended_method_check;
ALTER TABLE public.pass_leads
  ADD CONSTRAINT pass_leads_attended_method_check
  CHECK (attended_method IS NULL OR attended_method IN ('toggle', 'scan', 'code'));

-- ── 2. Close the insert path (F2) ───────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can claim a pass" ON "public"."pass_leads";
CREATE POLICY "Anyone can claim a pass" ON "public"."pass_leads" FOR INSERT WITH CHECK (((("char_length"("name") >= 2) AND ("char_length"("name") <= 80)) AND ("email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::"text") AND ("whatsapp" ~ '^\+[1-9][0-9]{7,14}$'::"text") AND (("char_length"("consent_text") >= 20) AND ("char_length"("consent_text") <= 500)) AND ("notified_at" IS NULL) AND ("contacted_at" IS NULL) AND ("tribe_user_id" IS NULL) AND "public"."pass_is_active"("partner_id", "slug") AND ("attended_at" IS NULL) AND ("attended_marked_by" IS NULL) AND ("attended_method" IS NULL)));

-- ── 3. Who may work this partner's door ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_can_work_door(p_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT auth.uid() IS NOT NULL
     AND p_partner_id IS NOT NULL
     AND (
          EXISTS (SELECT 1 FROM public.featured_partners fp
                   WHERE fp.id = p_partner_id AND fp.user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.partner_instructors pi
                   WHERE pi.partner_id = p_partner_id
                     AND pi.instructor_id = auth.uid()
                     AND pi.is_active IS TRUE)
       OR public.is_app_admin()
     );
$fn$;

REVOKE ALL ON FUNCTION public.av_can_work_door(uuid) FROM public, anon, authenticated;

-- ── 4. The door's read ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_door_pass(p_pass_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead record;
BEGIN
  SELECT pl.partner_id, pl.name, pl.created_at, pl.attended_at, fp.business_name
    INTO v_lead
    FROM public.pass_leads pl
    JOIN public.featured_partners fp ON fp.id = pl.partner_id
   WHERE pl.pass_code = upper(btrim(p_pass_code));

  IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'partner_name', v_lead.business_name,
    'guest_first_name', split_part(btrim(v_lead.name), ' ', 1),
    'claimed_at', v_lead.created_at,
    'attended_at', v_lead.attended_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_door_pass(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.av_door_pass(text) TO authenticated;

-- ── 5. The door's only write ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_confirm_pass_attendance(p_pass_code text, p_method text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead record;
  v_at   timestamptz;
BEGIN
  -- Checked first and independent of the code, so it reveals nothing about
  -- which codes exist.
  IF p_method IS NULL OR p_method NOT IN ('toggle', 'scan', 'code') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_method');
  END IF;

  SELECT pl.id, pl.partner_id, pl.attended_at
    INTO v_lead
    FROM public.pass_leads pl
   WHERE pl.pass_code = upper(btrim(p_pass_code))
   FOR UPDATE;

  IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- Idempotent: the first confirmation stands.
  IF v_lead.attended_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'attended_at', v_lead.attended_at, 'already_confirmed', true);
  END IF;

  UPDATE public.pass_leads
     SET attended_at = now(),
         attended_marked_by = auth.uid(),
         attended_method = p_method
   WHERE id = v_lead.id
  RETURNING attended_at INTO v_at;

  RETURN jsonb_build_object('success', true, 'attended_at', v_at, 'already_confirmed', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_confirm_pass_attendance(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.av_confirm_pass_attendance(text, text) TO authenticated;

-- ── 6. Assert the end state, after the writes ───────────────────────────────
DO $$
DECLARE
  v_check text;
BEGIN
  SELECT with_check INTO v_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads' AND policyname = 'Anyone can claim a pass';
  IF v_check IS NULL
     OR position('attended_at IS NULL' IN v_check) = 0
     OR position('attended_marked_by IS NULL' IN v_check) = 0
     OR position('attended_method IS NULL' IN v_check) = 0
     OR position('pass_is_active' IN v_check) = 0 THEN
    RAISE EXCEPTION '8200 ABORTED: the claim policy is missing an IS NULL clause or the pass_is_active check.';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'pass_leads' AND cmd IN ('INSERT', 'ALL')
         AND permissive = 'PERMISSIVE' AND policyname NOT IN ('Anyone can claim a pass', 'Admins manage pass leads')) > 0 THEN
    RAISE EXCEPTION '8200 ABORTED: another permissive INSERT policy on pass_leads would reopen F2.';
  END IF;
  IF has_function_privilege('anon', 'public.av_door_pass(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.av_confirm_pass_attendance(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_can_work_door(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '8200 ABORTED: a client role can execute something it must not.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.av_door_pass(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.av_confirm_pass_attendance(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '8200 ABORTED: authenticated cannot execute the door functions.';
  END IF;
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '8200 ABORTED: a client role holds UPDATE on pass_leads; the door write must be the only path.';
  END IF;
  RAISE NOTICE '8200: show-up columns added, claim policy closed, door read and confirm installed.';
END $$;

COMMIT;

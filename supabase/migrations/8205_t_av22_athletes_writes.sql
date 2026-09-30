-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV22
-- CREATES: av_athletes_add, _set_status, _set_level, _set_outcome, _mark_retained, _mark_bonus_settled
-- RISK: HIGH
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV22 (5 of 6): every write
-- ════════════════════════════════════════════════════════════════════════════
--
-- 8205 was free on origin/main (highest 198), every branch, every worktree and
-- all history on 2026-09-29. Split from the reads (now 8206) on 2026-09-30 to
-- keep each file under the 300-line rule; nothing had been applied anywhere.
--
-- EVERY FUNCTION HERE is SECURITY DEFINER with search_path pinned, revoked from
-- public and anon, and granted to authenticated. An unauthorized caller and a
-- missing object get the SAME {success:false, error:'not_found'}, as in T-AV21,
-- so no response reveals which leads, athletes or programs exist. Input
-- validation that does not depend on the object runs first, for the same
-- reason.
--
-- WHO MAY CALL WHAT
--   add, set_status, set_level          owner or admin of the program
--   set_level to or from 'sponsored'    admin only
--   set_outcome                         owner, active coach or admin (av_can_work_door)
--   mark_retained, mark_bonus_settled   owner or admin
--
-- DECISIONS RECORDED HERE (Al, 2026-09-29)
--   * bonus_eligible is written by set_outcome when the outcome BECOMES joined
--     (the referring athlete's level at that moment: athlete or sponsored is
--     true, captain is false, no athlete is false) and cleared to NULL when the
--     outcome leaves joined. Re-setting joined keeps the recorded value: the
--     level that matters is the one at the join.
--   * mark_bonus_settled requires bonus_eligible and a credited lead.
--   * A joined outcome cannot change once the lead is retained or its bonus is
--     settled ('locked'): both are facts about a join.
--   * av_athletes_add takes WhatsApp already in E.164 and refuses anything
--     else. Callers normalize with lib/pase/phone.ts (T-AV26 must).

BEGIN;

-- ── 1. Add an athlete ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_add(p_partner_id uuid, p_user_id uuid, p_whatsapp text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role    text;
  v_prog    record;
  v_user    record;
  v_base    text;
  v_code    text;
  v_id      uuid;
  v_con     text;
  v_alpha   constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try     integer;
BEGIN
  IF p_whatsapp IS NOT NULL AND p_whatsapp !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_whatsapp');
  END IF;

  v_role := public.av_my_partner_role(p_partner_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- The program row is the lock every cap check takes, so two adds cannot
  -- both see four active athletes and both insert a fifth and sixth.
  SELECT * INTO v_prog FROM public.athlete_programs WHERE partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  SELECT u.email, u.name INTO v_user FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_user.email IS NULL OR btrim(v_user.email) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_has_no_email');
  END IF;

  IF EXISTS (SELECT 1 FROM public.program_athletes WHERE partner_id = p_partner_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_added');
  END IF;

  IF (SELECT count(*) FROM public.program_athletes
       WHERE partner_id = p_partner_id AND status = 'active') >= v_prog.max_athletes THEN
    RETURN jsonb_build_object('success', false, 'error', 'program_full');
  END IF;

  -- First name, ASCII-folded, uppercased, letters and digits only.
  v_base := upper(translate(split_part(btrim(coalesce(v_user.name, '')), ' ', 1),
                            'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                            'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'));
  v_base := left(regexp_replace(v_base, '[^A-Z0-9]', '', 'g'), 20);
  IF v_base = '' THEN
    v_base := 'TRIBE';
  END IF;

  FOR v_try IN 1..10 LOOP
    v_code := v_base || '-'
           || substr(v_alpha, 1 + floor(random() * 32)::int, 1)
           || substr(v_alpha, 1 + floor(random() * 32)::int, 1)
           || substr(v_alpha, 1 + floor(random() * 32)::int, 1);
    BEGIN
      INSERT INTO public.program_athletes (partner_id, user_id, level, status, ref_code,
                                           email_lower, whatsapp_e164, added_by)
      VALUES (p_partner_id, p_user_id, 'captain', 'active', v_code,
              lower(btrim(v_user.email)), p_whatsapp, auth.uid())
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con IS DISTINCT FROM 'program_athletes_ref_code_key' THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_added');
      END IF;
    END;
  END LOOP;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_free_code');
  END IF;

  RETURN jsonb_build_object('success', true, 'program_athlete_id', v_id,
                            'ref_code', v_code, 'level', 'captain', 'status', 'active');
END;
$fn$;

-- ── 2. Pause, resume or end an athlete ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_set_status(p_program_athlete_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_partner uuid;
  v_role    text;
  v_prog    record;
  v_pa      record;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('active', 'paused', 'ended') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT partner_id INTO v_partner FROM public.program_athletes WHERE id = p_program_athlete_id;
  v_role := public.av_my_partner_role(v_partner);
  IF v_partner IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- Program first, then athlete: the same order av_athletes_add locks in.
  SELECT * INTO v_prog FROM public.athlete_programs WHERE partner_id = v_partner FOR UPDATE;
  SELECT * INTO v_pa FROM public.program_athletes WHERE id = p_program_athlete_id FOR UPDATE;

  IF v_pa.status = p_status THEN
    RETURN jsonb_build_object('success', true, 'status', v_pa.status, 'unchanged', true);
  END IF;

  IF p_status = 'active'
     AND (SELECT count(*) FROM public.program_athletes
           WHERE partner_id = v_partner AND status = 'active') >= v_prog.max_athletes THEN
    RETURN jsonb_build_object('success', false, 'error', 'program_full');
  END IF;

  UPDATE public.program_athletes
     SET status = p_status,
         ended_on = CASE WHEN p_status = 'ended' THEN current_date ELSE NULL END
   WHERE id = p_program_athlete_id;

  RETURN jsonb_build_object('success', true, 'status', p_status, 'unchanged', false);
END;
$fn$;

-- ── 3. Promote or demote ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_set_level(p_program_athlete_id uuid, p_level text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pa   record;
  v_role text;
BEGIN
  IF p_level IS NULL OR p_level NOT IN ('captain', 'athlete', 'sponsored') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_level');
  END IF;

  SELECT * INTO v_pa FROM public.program_athletes WHERE id = p_program_athlete_id FOR UPDATE;
  v_role := public.av_my_partner_role(v_pa.partner_id);
  IF v_pa.id IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- 'sponsored' is Tribe's level, not the gym's: only an admin moves an
  -- athlete into it or out of it.
  IF (p_level = 'sponsored' OR v_pa.level = 'sponsored') AND NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_allowed');
  END IF;

  IF v_pa.level = p_level THEN
    RETURN jsonb_build_object('success', true, 'level', p_level, 'unchanged', true);
  END IF;

  UPDATE public.program_athletes SET level = p_level WHERE id = p_program_athlete_id;
  RETURN jsonb_build_object('success', true, 'level', p_level, 'unchanged', false);
END;
$fn$;

-- ── 4. The coach records what happened after the class ─────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_set_outcome(p_pass_code text, p_outcome text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead     record;
  v_eligible boolean;
  v_at       timestamptz;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('joined', 'follow_up', 'not_now', 'already_member') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_outcome');
  END IF;

  SELECT pl.id, pl.partner_id, pl.attended_at, pl.outcome, pl.retained_at,
         pl.bonus_settled_at, pl.referred_by_athlete_id
    INTO v_lead
    FROM public.pass_leads pl
   WHERE pl.pass_code = upper(btrim(p_pass_code))
   FOR UPDATE;

  IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- Rule 2: joined requires a verified show-up.
  IF p_outcome = 'joined' AND v_lead.attended_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_attended');
  END IF;

  IF v_lead.outcome IS NOT DISTINCT FROM p_outcome THEN
    RETURN jsonb_build_object('success', true, 'outcome', p_outcome, 'unchanged', true);
  END IF;

  IF v_lead.outcome = 'joined'
     AND (v_lead.retained_at IS NOT NULL OR v_lead.bonus_settled_at IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'locked');
  END IF;

  IF p_outcome = 'joined' THEN
    SELECT pa.level IN ('athlete', 'sponsored') INTO v_eligible
      FROM public.program_athletes pa
     WHERE pa.id = v_lead.referred_by_athlete_id;
    v_eligible := coalesce(v_eligible, false);
  ELSE
    v_eligible := NULL;
  END IF;

  UPDATE public.pass_leads
     SET outcome = p_outcome,
         outcome_at = now(),
         outcome_marked_by = auth.uid(),
         bonus_eligible = v_eligible
   WHERE id = v_lead.id
  RETURNING outcome_at INTO v_at;

  -- No bonus field in the answer: coaches call this.
  RETURN jsonb_build_object('success', true, 'outcome', p_outcome, 'outcome_at', v_at, 'unchanged', false);
END;
$fn$;

-- ── 5. Retained ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_mark_retained(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead record;
  v_role text;
  v_days integer;
  v_at   timestamptz;
BEGIN
  SELECT pl.id, pl.partner_id, pl.outcome, pl.outcome_at, pl.retained_at
    INTO v_lead
    FROM public.pass_leads pl
   WHERE pl.id = p_lead_id
   FOR UPDATE;
  v_role := public.av_my_partner_role(v_lead.partner_id);
  SELECT retention_days INTO v_days FROM public.athlete_programs WHERE partner_id = v_lead.partner_id;
  IF v_lead.id IS NULL OR v_days IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_lead.outcome IS DISTINCT FROM 'joined' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_joined');
  END IF;

  IF v_lead.retained_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'retained_at', v_lead.retained_at, 'unchanged', true);
  END IF;

  IF now() < v_lead.outcome_at + make_interval(days => v_days) THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_early',
                              'due_at', v_lead.outcome_at + make_interval(days => v_days));
  END IF;

  UPDATE public.pass_leads SET retained_at = now() WHERE id = v_lead.id RETURNING retained_at INTO v_at;
  RETURN jsonb_build_object('success', true, 'retained_at', v_at, 'unchanged', false);
END;
$fn$;

-- ── 6. Bonus paid ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_mark_bonus_settled(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead     record;
  v_role     text;
  v_credited boolean;
  v_at       timestamptz;
BEGIN
  SELECT pl.id, pl.partner_id, pl.outcome, pl.bonus_eligible, pl.bonus_settled_at
    INTO v_lead
    FROM public.pass_leads pl
   WHERE pl.id = p_lead_id
   FOR UPDATE;
  v_role := public.av_my_partner_role(v_lead.partner_id);
  IF v_lead.id IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_lead.outcome IS DISTINCT FROM 'joined' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_joined');
  END IF;

  IF v_lead.bonus_eligible IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT l.credited INTO v_credited
    FROM public.av_athletes_ledger(v_lead.partner_id) l
   WHERE l.lead_id = v_lead.id;
  IF v_credited IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_credit');
  END IF;

  IF v_lead.bonus_settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'bonus_settled_at', v_lead.bonus_settled_at, 'unchanged', true);
  END IF;

  UPDATE public.pass_leads
     SET bonus_settled_at = now(), bonus_settled_by = auth.uid()
   WHERE id = v_lead.id
  RETURNING bonus_settled_at INTO v_at;
  RETURN jsonb_build_object('success', true, 'bonus_settled_at', v_at, 'unchanged', false);
END;
$fn$;

-- ── 7. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.av_athletes_add(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.av_athletes_set_status(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.av_athletes_set_level(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.av_athletes_set_outcome(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.av_athletes_mark_retained(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.av_athletes_mark_bonus_settled(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.av_athletes_add(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_athletes_set_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_athletes_set_level(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_athletes_set_outcome(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_athletes_mark_retained(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_athletes_mark_bonus_settled(uuid) TO authenticated;

-- ── 8. Assert the end state ────────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.av_athletes_add(uuid,uuid,text)',
    'public.av_athletes_set_status(uuid,text)',
    'public.av_athletes_set_level(uuid,text)',
    'public.av_athletes_set_outcome(text,text)',
    'public.av_athletes_mark_retained(uuid)',
    'public.av_athletes_mark_bonus_settled(uuid)'] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION '8205 ABORTED: % is missing.', v_fn;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_fn))
       OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure(v_fn)) IS NULL THEN
      RAISE EXCEPTION '8205 ABORTED: % must be SECURITY DEFINER with a pinned search_path.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '8205 ABORTED: % has the wrong grants.', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE '8205: athlete write functions installed.';
END $$;

COMMIT;

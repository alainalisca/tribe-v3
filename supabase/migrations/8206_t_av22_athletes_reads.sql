-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV22
-- CREATES: av_athletes_my_summary, av_athletes_partner_summary, av_door_list
-- REPLACES: av_door_pass(text) (T-AV21, adds athlete first name, outcome, welcome offer EN/ES)
-- RISK: HIGH
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV22 (6 of 6): every read a client makes
-- ════════════════════════════════════════════════════════════════════════════
--
-- 8206 was free on origin/main (highest 198, d236656d), every branch, every
-- worktree and all history on 2026-09-30. Split from 8205 (the writes) to keep
-- each file under the 300-line rule.
--
-- EVERY FUNCTION HERE is SECURITY DEFINER with search_path pinned, revoked from
-- public and anon, and granted to authenticated. An unauthorized caller and a
-- missing object get the SAME {success:false, error:'not_found'}, as in T-AV21,
-- so no response reveals which leads, athletes or programs exist. Input
-- validation that does not depend on the object runs first, for the same
-- reason.
--
-- WHO MAY CALL WHAT
--   my_summary        the calling athlete, own rows only
--   partner_summary   owner and admin: everything; active coach: no bonus
--                     field and no athlete contact column, at any depth
--   door_list         owner, active coach, admin
--   door_pass         owner, active coach, admin (unchanged from T-AV21)
--
-- The athlete sees a guest status collapsed to claimed, showed_up, joined or
-- retained. follow_up and not_now are the gym's sales notes.
--
-- RISK: HIGH because it replaces T-AV21's av_door_pass. Same signature, same
-- authorization, same single refusal; three fields added, none of them the
-- guest's contact details.
--
-- T-AV26 (2026-10-01, Al's decision 1): partner_summary widened IN PLACE,
-- before this file was ever applied outside the local stack, so the gym
-- dashboard reads every number from here and recomputes nothing:
--   totals.to_close       credited show-ups with no outcome yet ("Por cerrar")
--   guests.contacted_at   owner and admin only ("Oferta enviada")
--   guests.retain_from    owner and admin only: outcome_at + retention_days,
--                         the same instant av_athletes_mark_retained (8205)
--                         refuses before, so the button and the rule agree
-- Coaches still get no bonus field and no sales note at any depth.

BEGIN;

-- ── 1. The athlete's own summary ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_my_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pa       record;
  v_prog     record;
  v_tot      record;
  v_guests   jsonb;
  v_programs jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  FOR v_pa IN
    SELECT pa.id, pa.partner_id, pa.level, pa.status, pa.ref_code, pa.started_on, fp.business_name
      FROM public.program_athletes pa
      JOIN public.featured_partners fp ON fp.id = pa.partner_id
     WHERE pa.user_id = auth.uid()
     ORDER BY pa.started_on DESC, pa.created_at DESC
  LOOP
    SELECT * INTO v_prog FROM public.athlete_programs WHERE partner_id = v_pa.partner_id;
    SELECT * INTO v_tot FROM public.av_athletes_ledger_totals(v_pa.partner_id) t
     WHERE t.program_athlete_id = v_pa.id;

    -- First name, claim date, collapsed status and the no-credit reason.
    -- Never email or WhatsApp (D4).
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'first_name', l.guest_first_name,
             'claimed_at', l.claimed_at,
             'status', CASE
                         WHEN l.outcome = 'joined' AND l.retained_at IS NOT NULL THEN 'retained'
                         WHEN l.outcome = 'joined' AND l.attended_at IS NOT NULL THEN 'joined'
                         WHEN l.attended_at IS NOT NULL THEN 'showed_up'
                         ELSE 'claimed'
                       END,
             'no_credit_reason', l.no_credit_reason)
             ORDER BY l.claimed_at DESC), '[]'::jsonb)
      INTO v_guests
      FROM public.av_athletes_ledger(v_pa.partner_id) l
     WHERE l.program_athlete_id = v_pa.id;

    v_programs := v_programs || jsonb_build_array(jsonb_build_object(
      'partner_id', v_pa.partner_id,
      'partner_name', v_pa.business_name,
      'program_active', v_prog.is_active,
      'program_athlete_id', v_pa.id,
      'level', v_pa.level,
      'status', v_pa.status,
      'ref_code', v_pa.ref_code,
      'started_on', v_pa.started_on,
      'welcome_offer_en', v_prog.welcome_offer_en,
      'welcome_offer_es', v_prog.welcome_offer_es,
      'showup_reward_en', v_prog.showup_reward_en,
      'showup_reward_es', v_prog.showup_reward_es,
      'class_access_en', v_prog.class_access_en,
      'class_access_es', v_prog.class_access_es,
      'conversion_bonus_cop', v_prog.conversion_bonus_cop,
      'conversion_bonus_note_en', v_prog.conversion_bonus_note_en,
      'conversion_bonus_note_es', v_prog.conversion_bonus_note_es,
      'counts', jsonb_build_object(
        'invited', v_tot.invited, 'not_credited', v_tot.not_credited,
        'showed_up', v_tot.showed_up, 'joined', v_tot.joined, 'retained', v_tot.retained,
        'bonus_owed', v_tot.bonus_owed, 'bonus_settled', v_tot.bonus_settled),
      'ready_to_promote', v_tot.ready_to_promote,
      'progress', jsonb_build_object('showups', v_tot.showed_up, 'promote_at', v_tot.promote_at_showups),
      'guests', v_guests));
  END LOOP;

  IF jsonb_array_length(v_programs) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('success', true, 'programs', v_programs);
END;
$fn$;

-- ── 2. The gym's summary ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_athletes_partner_summary(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role     text;
  v_full     boolean;
  v_prog     record;
  v_program  jsonb;
  v_athletes jsonb;
  v_guests   jsonb;
  v_totals   jsonb;
BEGIN
  v_role := public.av_my_partner_role(p_partner_id);
  SELECT * INTO v_prog FROM public.athlete_programs WHERE partner_id = p_partner_id;
  IF v_role IS NULL OR v_prog.partner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- Coaches get counts and first names, and no bonus field at any depth.
  v_full := v_role IN ('owner', 'admin');

  v_program := jsonb_build_object(
      'partner_id', v_prog.partner_id, 'is_active', v_prog.is_active,
      'welcome_offer_en', v_prog.welcome_offer_en, 'welcome_offer_es', v_prog.welcome_offer_es,
      'showup_reward_en', v_prog.showup_reward_en, 'showup_reward_es', v_prog.showup_reward_es,
      'class_access_en', v_prog.class_access_en, 'class_access_es', v_prog.class_access_es,
      'retention_days', v_prog.retention_days, 'promote_at_showups', v_prog.promote_at_showups,
      'max_athletes', v_prog.max_athletes,
      'pilot_starts_on', v_prog.pilot_starts_on, 'pilot_ends_on', v_prog.pilot_ends_on)
    || CASE WHEN v_full THEN jsonb_build_object(
      'conversion_bonus_cop', v_prog.conversion_bonus_cop,
      'conversion_bonus_note_en', v_prog.conversion_bonus_note_en,
      'conversion_bonus_note_es', v_prog.conversion_bonus_note_es) ELSE '{}'::jsonb END;

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'program_athlete_id', t.program_athlete_id,
             'first_name', split_part(btrim(u.name), ' ', 1),
             'level', t.level, 'status', t.status, 'ref_code', pa.ref_code, 'started_on', pa.started_on,
             'invited', t.invited, 'not_credited', t.not_credited, 'showed_up', t.showed_up,
             'joined', t.joined, 'retained', t.retained, 'ready_to_promote', t.ready_to_promote)
           || CASE WHEN v_full THEN jsonb_build_object(
             'bonus_owed', t.bonus_owed, 'bonus_settled', t.bonus_settled,
             'email_lower', pa.email_lower, 'whatsapp_e164', pa.whatsapp_e164) ELSE '{}'::jsonb END
           ORDER BY pa.started_on, pa.created_at), '[]'::jsonb)
    INTO v_athletes
    FROM public.av_athletes_ledger_totals(p_partner_id) t
    JOIN public.program_athletes pa ON pa.id = t.program_athlete_id
    JOIN public.users u ON u.id = t.user_id;

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'lead_id', l.lead_id, 'first_name', l.guest_first_name, 'pass_code', l.pass_code,
             'claimed_at', l.claimed_at, 'attended_at', l.attended_at, 'outcome', l.outcome,
             'retained_at', l.retained_at, 'athlete_first_name', split_part(btrim(u.name), ' ', 1),
             'credited', l.credited, 'no_credit_reason', l.no_credit_reason)
           || CASE WHEN v_full THEN jsonb_build_object(
             'bonus_eligible', l.bonus_eligible, 'bonus_owed', l.bonus_owed,
             'bonus_settled_at', l.bonus_settled_at, 'contacted_at', pl.contacted_at,
             'retain_from', CASE WHEN l.outcome = 'joined' AND l.outcome_at IS NOT NULL
                                 THEN l.outcome_at + make_interval(days => v_prog.retention_days) END)
             ELSE '{}'::jsonb END
           ORDER BY l.claimed_at DESC), '[]'::jsonb)
    INTO v_guests
    FROM public.av_athletes_ledger(p_partner_id) l
    JOIN public.pass_leads pl ON pl.id = l.lead_id
    JOIN public.program_athletes pa ON pa.id = l.program_athlete_id
    JOIN public.users u ON u.id = pa.user_id;

  SELECT jsonb_build_object(
           'invited', coalesce(sum(t.invited), 0), 'not_credited', coalesce(sum(t.not_credited), 0),
           'showed_up', coalesce(sum(t.showed_up), 0), 'joined', coalesce(sum(t.joined), 0),
           'retained', coalesce(sum(t.retained), 0),
           'to_close', (SELECT count(*) FROM public.av_athletes_ledger(p_partner_id) c
                         WHERE c.showed_up AND c.outcome IS NULL))
         || CASE WHEN v_full THEN jsonb_build_object(
           'bonus_owed', coalesce(sum(t.bonus_owed), 0),
           'bonus_settled', coalesce(sum(t.bonus_settled), 0)) ELSE '{}'::jsonb END
    INTO v_totals
    FROM public.av_athletes_ledger_totals(p_partner_id) t;

  RETURN jsonb_build_object('success', true, 'role', v_role, 'program', v_program,
                            'athletes', v_athletes, 'guests', v_guests, 'totals', v_totals);
END;
$fn$;

-- ── 3. The door list (F6) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_door_list(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.av_can_work_door(p_partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'leads', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'guest_first_name', split_part(btrim(pl.name), ' ', 1),
             'pass_code', pl.pass_code,
             'claimed_at', pl.created_at,
             'attended_at', pl.attended_at,
             'outcome', pl.outcome,
             'athlete_first_name', CASE WHEN pa.id IS NULL THEN NULL ELSE split_part(btrim(u.name), ' ', 1) END)
             ORDER BY pl.created_at DESC)
      FROM public.pass_leads pl
      LEFT JOIN public.program_athletes pa ON pa.id = pl.referred_by_athlete_id
      LEFT JOIN public.users u ON u.id = pa.user_id
     WHERE pl.partner_id = p_partner_id
       AND pl.created_at >= now() - interval '14 days'), '[]'::jsonb));
END;
$fn$;

-- ── 4. T-AV21's door read, widened ─────────────────────────────────────────
-- Same signature, same authorization, same single refusal. Adds the referring
-- athlete's first name, the outcome and the welcome offer. Still never the
-- guest's full name, email or WhatsApp.
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
  SELECT pl.partner_id, pl.name, pl.created_at, pl.attended_at, pl.outcome, fp.business_name,
         split_part(btrim(u.name), ' ', 1) AS athlete_first_name,
         ap.welcome_offer_en, ap.welcome_offer_es
    INTO v_lead
    FROM public.pass_leads pl
    JOIN public.featured_partners fp ON fp.id = pl.partner_id
    LEFT JOIN public.program_athletes pa ON pa.id = pl.referred_by_athlete_id
    LEFT JOIN public.users u ON u.id = pa.user_id
    LEFT JOIN public.athlete_programs ap ON ap.partner_id = pl.partner_id
   WHERE pl.pass_code = upper(btrim(p_pass_code));

  IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'partner_name', v_lead.business_name,
    'guest_first_name', split_part(btrim(v_lead.name), ' ', 1),
    'claimed_at', v_lead.created_at,
    'attended_at', v_lead.attended_at,
    'outcome', v_lead.outcome,
    'athlete_first_name', v_lead.athlete_first_name,
    'welcome_offer_en', v_lead.welcome_offer_en,
    'welcome_offer_es', v_lead.welcome_offer_es
  );
END;
$fn$;

-- ── 5. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.av_athletes_my_summary() FROM public, anon;
REVOKE ALL ON FUNCTION public.av_athletes_partner_summary(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.av_door_list(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.av_door_pass(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.av_athletes_my_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_athletes_partner_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_door_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_door_pass(text) TO authenticated;

-- ── 6. Assert the end state ────────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.av_athletes_my_summary()',
    'public.av_athletes_partner_summary(uuid)',
    'public.av_door_list(uuid)',
    'public.av_door_pass(text)'] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION '8206 ABORTED: % is missing.', v_fn;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_fn))
       OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure(v_fn)) IS NULL THEN
      RAISE EXCEPTION '8206 ABORTED: % must be SECURITY DEFINER with a pinned search_path.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '8206 ABORTED: % has the wrong grants.', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE '8206: athlete read functions installed; door read widened.';
END $$;

COMMIT;

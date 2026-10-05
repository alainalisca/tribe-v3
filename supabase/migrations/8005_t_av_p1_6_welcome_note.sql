-- PROGRAM: T-AV
-- TICKET: T-AV33 (athlete concepts Phase 1, P1-6: the coach's welcome note)
-- TABLE: public.coach_contact_settings OWNER: t-av-new
-- TABLE: public.av_notification_log OWNER: t-av-new
-- CREATES: av_set_welcome_note, av_claim_welcome_for_join, av_claim_welcome_for_pass
-- ALTERS: av_notification_log (8209, this branch, applied nowhere): event 'welcome', coach_id,
--         program_athlete_id nullable for welcome rows only, once-per-coach-and-person index
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- P1-6: the coach writes a welcome note once; Tribe sends it on a person's
-- first join or Pass claim with that coach
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch-only, reserved T-AV block. 8005 was free on 2026-10-04: origin/main
-- ends at 198; 80xx holds 8000 to 8004, the branches this is stacked on.
--
-- THE CAP AND THE PUSH PATH (program spec section 3, Al's P1-6 instruction).
-- Every T-AV push counts against ONE ledger, av_notification_log (8209), which
-- is what av_push_allowed reads: at most 1 T-AV push per person per day and 3
-- per week. So welcome rows go into that same table rather than a second log
-- the cap could not see. Over the cap, the in-app note is still written and
-- only the push is off, exactly as 8209 does. av_push_allowed is NOT changed:
-- 'welcome' is not 'joined', so it is held to the daily limit too.
-- The push itself is sent by the app through /api/notifications/send, never by
-- a database trigger; these functions only decide and record.
--
-- WHEN. "First" means the person has no relationship with this coach yet:
--   join  the caller holds a CONFIRMED participant row on this session, and
--         no participant row on any other of the coach's sessions, no
--         confirmed attendance with the coach, no Pass lead with the coach.
--         A pending request (curated or paid) is not a join yet.
--   pass  the signed-in claimant (resolved by /api/pase from their own
--         session, never from the form) has no participant row on the
--         coach's sessions, no confirmed attendance, and no OTHER Pass lead
--         with the coach. Callable by the service role only.
-- Never to the coach. Once per coach and person, ever (unique index), so a
-- retried request or a second join cannot send it twice.
--
-- WHY THE 8209 CONSTRAINTS CHANGE. 8209 made program_athlete_id NOT NULL and
-- tied lead_id to 'ready'; both describe Tribe Athletes events. A welcome has
-- no program athlete, and has a lead only when it came from a Pass. Each
-- constraint now applies to every event EXCEPT 'welcome', which gets its own
-- checks (a coach, and no program athlete). 8209 is on this branch and applied
-- nowhere, so this changes no live data.

BEGIN;

-- ── 1. The note ────────────────────────────────────────────────────────────
ALTER TABLE public.coach_contact_settings ADD COLUMN IF NOT EXISTS welcome_note text;
ALTER TABLE public.coach_contact_settings DROP CONSTRAINT IF EXISTS coach_contact_settings_welcome_len;
ALTER TABLE public.coach_contact_settings ADD CONSTRAINT coach_contact_settings_welcome_len
  CHECK (welcome_note IS NULL OR char_length(welcome_note) BETWEEN 1 AND 500);
COMMENT ON COLUMN public.coach_contact_settings.welcome_note IS
  'T-AV33 (P1-6). Sent once to a person on their first join or Pass claim with this coach.';

-- ── 2. The one ledger learns 'welcome' ─────────────────────────────────────
ALTER TABLE public.av_notification_log ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.av_notification_log ALTER COLUMN program_athlete_id DROP NOT NULL;

ALTER TABLE public.av_notification_log DROP CONSTRAINT IF EXISTS av_notification_log_event_check;
ALTER TABLE public.av_notification_log ADD CONSTRAINT av_notification_log_event_check
  CHECK (event IN ('claimed', 'arrived', 'joined', 'ready', 'welcome'));
ALTER TABLE public.av_notification_log DROP CONSTRAINT IF EXISTS av_notification_log_lead_check;
ALTER TABLE public.av_notification_log ADD CONSTRAINT av_notification_log_lead_check
  CHECK (event = 'welcome' OR ((event = 'ready') = (lead_id IS NULL)));
ALTER TABLE public.av_notification_log DROP CONSTRAINT IF EXISTS av_notification_log_athlete_check;
ALTER TABLE public.av_notification_log ADD CONSTRAINT av_notification_log_athlete_check
  CHECK (CASE WHEN event = 'welcome' THEN program_athlete_id IS NULL AND coach_id IS NOT NULL
              ELSE program_athlete_id IS NOT NULL END);

CREATE UNIQUE INDEX IF NOT EXISTS av_notification_log_welcome_once
  ON public.av_notification_log (coach_id, recipient_id) WHERE event = 'welcome';

-- ── 3. The coach writes it ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.av_set_welcome_note(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  IF v_text IS NOT NULL AND char_length(v_text) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_long');
  END IF;
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.is_instructor IS TRUE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_instructor');
  END IF;
  INSERT INTO public.coach_contact_settings (coach_id, welcome_note, updated_at)
  VALUES (v_uid, v_text, now())
  ON CONFLICT (coach_id) DO UPDATE SET welcome_note = EXCLUDED.welcome_note, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$fn$;

-- ── 4. Shared: decide, record once, within the cap ─────────────────────────
-- Internal. Returns the notification to deliver, or an empty array. Not
-- callable by any client role; the two entry points below call it.
CREATE OR REPLACE FUNCTION public.av_welcome_record(p_coach uuid, p_recipient uuid, p_lead uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_note  text;
  v_coach record;
  v_lang  text;
  v_push  boolean;
  v_id    uuid;
BEGIN
  SELECT c.welcome_note INTO v_note FROM public.coach_contact_settings c WHERE c.coach_id = p_coach;
  IF v_note IS NULL OR p_recipient IS NULL OR p_recipient = p_coach THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT split_part(btrim(coalesce(u.name, '')), ' ', 1) AS first_name INTO v_coach FROM public.users u WHERE u.id = p_coach;
  SELECT u.preferred_language INTO v_lang FROM public.users u WHERE u.id = p_recipient;

  -- One recipient at a time, so two sends in the same second cannot both read
  -- "no push today" and both push (8209's construction).
  PERFORM pg_advisory_xact_lock(hashtext('av_push:' || p_recipient::text));
  v_push := public.av_push_allowed(p_recipient, 'welcome');
  INSERT INTO public.av_notification_log (event, lead_id, program_athlete_id, recipient_id, push, coach_id)
  VALUES ('welcome', p_lead, NULL, p_recipient, v_push, p_coach)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN jsonb_build_array(jsonb_build_object(
    'event', 'welcome', 'recipient_id', p_recipient, 'language', v_lang, 'push', v_push,
    'coach_id', p_coach, 'coach_first_name', v_coach.first_name, 'note', v_note));
END;
$fn$;

-- Does p_person already have a relationship with p_coach, other than the one
-- that triggered this (p_except_session or p_except_lead)?
CREATE OR REPLACE FUNCTION public.av_welcome_known(p_coach uuid, p_person uuid, p_except_session uuid, p_except_lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.session_participants sp JOIN public.sessions s ON s.id = sp.session_id
                  WHERE sp.user_id = p_person AND s.creator_id = p_coach
                    AND sp.session_id IS DISTINCT FROM p_except_session)
      OR EXISTS (SELECT 1 FROM public.session_attendance a JOIN public.sessions s ON s.id = a.session_id
                  WHERE a.user_id = p_person AND s.creator_id = p_coach AND a.status = 'attended')
      OR EXISTS (SELECT 1 FROM public.pass_leads pl
                  WHERE pl.tribe_user_id = p_person AND pl.id IS DISTINCT FROM p_except_lead
                    AND (pl.instructor_id = p_coach
                         OR pl.partner_id IN (SELECT fp.id FROM public.featured_partners fp WHERE fp.user_id = p_coach)));
$fn$;

-- ── 5. Entry point: a join, called by the joiner ───────────────────────────
CREATE OR REPLACE FUNCTION public.av_claim_welcome_for_join(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_coach uuid;
BEGIN
  IF v_uid IS NULL OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  SELECT s.creator_id INTO v_coach FROM public.sessions s WHERE s.id = p_session_id;
  IF v_coach IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  -- The join must have happened, and be confirmed. The caller does not get to
  -- say it did.
  IF NOT EXISTS (SELECT 1 FROM public.session_participants sp
                  WHERE sp.session_id = p_session_id AND sp.user_id = v_uid AND sp.status = 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_joined');
  END IF;
  IF public.av_welcome_known(v_coach, v_uid, p_session_id, NULL) THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true, 'notifications', public.av_welcome_record(v_coach, v_uid, NULL));
END;
$fn$;

-- ── 6. Entry point: a Pass claim, called by /api/pase as the service role ──
CREATE OR REPLACE FUNCTION public.av_claim_welcome_for_pass(p_lead_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_lead record;
BEGIN
  SELECT pl.id, coalesce(pl.instructor_id, fp.user_id) AS coach
    INTO v_lead
    FROM public.pass_leads pl LEFT JOIN public.featured_partners fp ON fp.id = pl.partner_id
   WHERE pl.id = p_lead_id;
  IF NOT FOUND OR v_lead.coach IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;
  IF public.av_welcome_known(v_lead.coach, p_user_id, NULL, v_lead.id) THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true, 'notifications', public.av_welcome_record(v_lead.coach, p_user_id, v_lead.id));
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_set_welcome_note(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.av_welcome_record(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.av_welcome_known(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.av_claim_welcome_for_join(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.av_claim_welcome_for_pass(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.av_set_welcome_note(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_claim_welcome_for_join(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_claim_welcome_for_pass(uuid, uuid) TO service_role;

-- ── 7. Assert the end state ────────────────────────────────────────────────
DO $$
DECLARE v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.av_set_welcome_note(text)', 'public.av_welcome_record(uuid,uuid,uuid)',
                              'public.av_welcome_known(uuid,uuid,uuid,uuid)', 'public.av_claim_welcome_for_join(uuid)',
                              'public.av_claim_welcome_for_pass(uuid,uuid)'] LOOP
    IF to_regprocedure(v_fn) IS NULL
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_fn))
       OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure(v_fn)) IS NULL
       OR has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '8005 ABORTED: % is missing, not a pinned SECURITY DEFINER, or runnable by anon.', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.av_welcome_record(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_welcome_known(uuid,uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_claim_welcome_for_pass(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.av_claim_welcome_for_pass(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '8005 ABORTED: a client can reach an internal welcome function, or the Pass route cannot.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.av_set_welcome_note(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.av_claim_welcome_for_join(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '8005 ABORTED: the coach or the joiner cannot reach their function.';
  END IF;
  IF has_any_column_privilege('authenticated', 'public.av_notification_log', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.av_notification_log', 'INSERT') THEN
    RAISE EXCEPTION '8005 ABORTED: av_notification_log gained a client grant.';
  END IF;
  RAISE NOTICE '8005: welcome note, its two entry points and the shared cap ledger installed.';
END $$;

COMMIT;

-- NOT A migrations_applied ROW. The 8000 block is renumbered at the merge
-- gate; the record belongs to the renumbered file.

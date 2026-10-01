-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV27
-- TABLE: public.av_notification_log OWNER: t-av-new
-- CREATES: public.av_notification_log, av_athletes_claim_notification(text, text), av_athletes_claim_lead_notification(uuid)
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-AV27b (the second part of T-AV27): who is told what, once, within the push cap
-- ════════════════════════════════════════════════════════════════════════════
--
-- 8209 was free on origin/main (highest 198), every branch, every worktree and
-- all history on 2026-10-01.
--
-- THE FIVE EVENTS (Al, 2026-10-01). The first four go through here; the fifth
-- is a line in the owner's existing lead email and needs nothing stored.
--   claimed   a credited guest claimed a pass   -> athlete, in-app only
--   arrived   a credited guest's show-up        -> athlete, push and in-app
--   joined    a credited guest joined           -> athlete, push and in-app
--   ready     a captain's show-up made them ready to move up
--                                               -> owner, push and in-app
--
-- WHY A LOG AND NOT A TRIGGER. The parent spec forbids DB triggers for pushes:
-- they go through the consolidated path, /api/notifications/send. So the app
-- calls a route after the write, and the route asks THIS function whether to
-- tell anyone. The function decides everything that must not be the caller's
-- choice, in one place:
--   * the caller can work this door (owner, active coach, admin)
--   * the event really happened (attended_at, outcome = 'joined')
--   * the guest is CREDITED: a self-referral, a duplicate, a returning guest
--     or an existing member tells the athlete nothing
--   * once per lead and event (the unique index), and "ready" once per athlete
--   * the parent spec's cap, max 1 T-AV push per athlete per day and 3 per
--     week: over it, the in-app row is still written and only the push is off
-- The route then renders the copy and sends; it chooses none of the above.
--
-- The log is server-only: RLS on, no grant to anon or authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS public.av_notification_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event              text NOT NULL CONSTRAINT av_notification_log_event_check
                       CHECK (event IN ('claimed', 'arrived', 'joined', 'ready')),
  lead_id            uuid REFERENCES public.pass_leads(id) ON DELETE CASCADE,
  program_athlete_id uuid NOT NULL REFERENCES public.program_athletes(id) ON DELETE CASCADE,
  recipient_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  push               boolean NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT av_notification_log_lead_check CHECK ((event = 'ready') = (lead_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS av_notification_log_once_per_lead
  ON public.av_notification_log (lead_id, event) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS av_notification_log_ready_once
  ON public.av_notification_log (program_athlete_id) WHERE event = 'ready';
CREATE INDEX IF NOT EXISTS av_notification_log_push_window
  ON public.av_notification_log (recipient_id, created_at) WHERE push;

ALTER TABLE public.av_notification_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.av_notification_log FROM public, anon, authenticated;
GRANT ALL ON TABLE public.av_notification_log TO service_role;

-- ── The cap: max 1 T-AV push per athlete per day, max 3 per week ───────────
CREATE OR REPLACE FUNCTION public.av_push_allowed(p_recipient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT (SELECT count(*) FROM public.av_notification_log
           WHERE recipient_id = p_recipient AND push AND created_at > now() - interval '1 day') < 1
     AND (SELECT count(*) FROM public.av_notification_log
           WHERE recipient_id = p_recipient AND push AND created_at > now() - interval '7 days') < 3;
$fn$;
REVOKE ALL ON FUNCTION public.av_push_allowed(uuid) FROM public, anon, authenticated;

-- ── arrived / joined (and the ready that an arrival can cause) ─────────────
CREATE OR REPLACE FUNCTION public.av_athletes_claim_notification(p_pass_code text, p_event text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead     record;
  v_credited boolean;
  v_pa       record;
  v_push     boolean;
  v_id       uuid;
  v_out      jsonb := '[]'::jsonb;
  v_owner    record;
  v_ready    boolean;
BEGIN
  IF p_event IS NULL OR p_event NOT IN ('arrived', 'joined') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_event');
  END IF;

  SELECT pl.id, pl.partner_id, pl.attended_at, pl.outcome, pl.referred_by_athlete_id,
         split_part(btrim(pl.name), ' ', 1) AS guest_first_name, fp.business_name, fp.user_id AS owner_id
    INTO v_lead
    FROM public.pass_leads pl
    JOIN public.featured_partners fp ON fp.id = pl.partner_id
   WHERE pl.pass_code = upper(btrim(p_pass_code));
  IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- The event must have happened. The caller does not get to say it did.
  IF (p_event = 'arrived' AND v_lead.attended_at IS NULL)
     OR (p_event = 'joined' AND v_lead.outcome IS DISTINCT FROM 'joined') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_happened');
  END IF;

  IF v_lead.referred_by_athlete_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'notifications', v_out);
  END IF;
  SELECT l.credited INTO v_credited FROM public.av_athletes_ledger(v_lead.partner_id) l WHERE l.lead_id = v_lead.id;
  IF v_credited IS NOT TRUE THEN
    RETURN jsonb_build_object('success', true, 'notifications', v_out);
  END IF;

  SELECT pa.id, pa.user_id, split_part(btrim(u.name), ' ', 1) AS first_name, u.preferred_language
    INTO v_pa
    FROM public.program_athletes pa JOIN public.users u ON u.id = pa.user_id
   WHERE pa.id = v_lead.referred_by_athlete_id;

  -- One recipient at a time, so two confirms in the same second cannot both
  -- read "no push today" and both push.
  PERFORM pg_advisory_xact_lock(hashtext('av_push:' || v_pa.user_id::text));
  v_push := public.av_push_allowed(v_pa.user_id);
  INSERT INTO public.av_notification_log (event, lead_id, program_athlete_id, recipient_id, push)
  VALUES (p_event, v_lead.id, v_pa.id, v_pa.user_id, v_push)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'event', p_event, 'recipient_id', v_pa.user_id, 'language', v_pa.preferred_language,
      'push', v_push, 'guest_first_name', v_lead.guest_first_name, 'partner_name', v_lead.business_name,
      'partner_id', v_lead.partner_id, 'lead_id', v_lead.id));
  END IF;

  -- An arrival is what moves a captain to ready. Tell the owner, once.
  IF p_event = 'arrived' THEN
    SELECT t.ready_to_promote INTO v_ready
      FROM public.av_athletes_ledger_totals(v_lead.partner_id) t WHERE t.program_athlete_id = v_pa.id;
    IF v_ready IS TRUE THEN
      SELECT u.id, u.preferred_language INTO v_owner FROM public.users u WHERE u.id = v_lead.owner_id;
      v_id := NULL;
      INSERT INTO public.av_notification_log (event, lead_id, program_athlete_id, recipient_id, push)
      VALUES ('ready', NULL, v_pa.id, v_owner.id, true)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_out := v_out || jsonb_build_array(jsonb_build_object(
          'event', 'ready', 'recipient_id', v_owner.id, 'language', v_owner.preferred_language,
          'push', true, 'athlete_first_name', v_pa.first_name, 'partner_name', v_lead.business_name,
          'partner_id', v_lead.partner_id));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'notifications', v_out);
END;
$fn$;

-- ── claimed: from /api/pase, which runs with the service role ──────────────
CREATE OR REPLACE FUNCTION public.av_athletes_claim_lead_notification(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead     record;
  v_credited boolean;
  v_pa       record;
  v_id       uuid;
BEGIN
  SELECT pl.id, pl.partner_id, pl.referred_by_athlete_id, split_part(btrim(pl.name), ' ', 1) AS guest_first_name,
         fp.business_name
    INTO v_lead
    FROM public.pass_leads pl JOIN public.featured_partners fp ON fp.id = pl.partner_id
   WHERE pl.id = p_lead_id;
  IF NOT FOUND OR v_lead.referred_by_athlete_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;
  SELECT l.credited INTO v_credited FROM public.av_athletes_ledger(v_lead.partner_id) l WHERE l.lead_id = v_lead.id;
  IF v_credited IS NOT TRUE THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;

  SELECT pa.id, pa.user_id, u.preferred_language INTO v_pa
    FROM public.program_athletes pa JOIN public.users u ON u.id = pa.user_id
   WHERE pa.id = v_lead.referred_by_athlete_id;
  -- In-app only: the day's one push is kept for a show-up.
  INSERT INTO public.av_notification_log (event, lead_id, program_athlete_id, recipient_id, push)
  VALUES ('claimed', v_lead.id, v_pa.id, v_pa.user_id, false)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'notifications', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true, 'notifications', jsonb_build_array(jsonb_build_object(
    'event', 'claimed', 'recipient_id', v_pa.user_id, 'language', v_pa.preferred_language, 'push', false,
    'guest_first_name', v_lead.guest_first_name, 'partner_name', v_lead.business_name,
    'partner_id', v_lead.partner_id, 'lead_id', v_lead.id)));
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_athletes_claim_notification(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.av_athletes_claim_notification(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.av_athletes_claim_lead_notification(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.av_athletes_claim_lead_notification(uuid) TO service_role;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.av_notification_log'::regclass) THEN
    RAISE EXCEPTION '8209 ABORTED: RLS is not enabled on av_notification_log.';
  END IF;
  IF has_any_column_privilege('anon', 'public.av_notification_log', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.av_notification_log', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.av_notification_log', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.av_notification_log', 'UPDATE') THEN
    RAISE EXCEPTION '8209 ABORTED: a client role holds a privilege on av_notification_log.';
  END IF;
  IF has_function_privilege('anon', 'public.av_athletes_claim_notification(text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.av_athletes_claim_notification(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_athletes_claim_lead_notification(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.av_push_allowed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '8209 ABORTED: a notification function has the wrong grants.';
  END IF;
  RAISE NOTICE '8209: notification log and claim functions installed.';
END $$;

COMMIT;

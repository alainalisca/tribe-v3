-- PROGRAM: T-AV
-- TICKET: T-AV30 (athlete concepts Phase 1, P1-3: "Book a free call" link)
-- TABLE: public.coach_contact_settings OWNER: t-av-new
-- TABLE: public.coach_contact_log OWNER: t-av-new
-- CREATES: av_set_call_link
-- REPLACES: av_coach_contact_options, av_coach_contact_tap (both from 8001, this branch, applied nowhere)
--
-- ════════════════════════════════════════════════════════════════════════════
-- P1-3: a "Book a free call" link on the storefront, logged like P1-2
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch-only, reserved T-AV block. 8002 was free on 2026-10-04: origin/main
-- ends at 198; 80xx holds only 8000 and 8001, the branches this is stacked on.
--
-- THE LINK. Any https URL the coach chooses (Calendly, a booking page, a
-- WhatsApp catalogue). Tribe never touches the booking or any money; it only
-- shows the link and logs the tap. https only, 500 characters at most, so a
-- javascript: or http: URL cannot be stored and rendered as a link. Saving it
-- empty removes it, and with it the button.
--
-- The tap log's channel CHECK widens to call_link. Call links show on the
-- storefront only, so a call_link tap must come from the storefront.

BEGIN;

ALTER TABLE public.coach_contact_settings ADD COLUMN IF NOT EXISTS call_link_url text;
ALTER TABLE public.coach_contact_settings DROP CONSTRAINT IF EXISTS coach_contact_settings_call_link_https;
ALTER TABLE public.coach_contact_settings ADD CONSTRAINT coach_contact_settings_call_link_https
  CHECK (call_link_url IS NULL OR (call_link_url ~ '^https://[^\s<>"]+$' AND length(call_link_url) <= 500));
COMMENT ON COLUMN public.coach_contact_settings.call_link_url IS
  'T-AV30 (P1-3). The coach''s "Book a free call" link. https only. NULL means no button.';

ALTER TABLE public.coach_contact_log DROP CONSTRAINT IF EXISTS coach_contact_log_channel_check;
ALTER TABLE public.coach_contact_log ADD CONSTRAINT coach_contact_log_channel_check
  CHECK (channel IN ('whatsapp', 'call_link'));

CREATE OR REPLACE FUNCTION public.av_set_call_link(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
BEGIN
  IF v_url IS NOT NULL AND (v_url !~ '^https://[^\s<>"]+$' OR length(v_url) > 500) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_url');
  END IF;
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.is_instructor IS TRUE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_instructor');
  END IF;

  INSERT INTO public.coach_contact_settings (coach_id, call_link_url, updated_at)
  VALUES (v_uid, v_url, now())
  ON CONFLICT (coach_id) DO UPDATE SET call_link_url = EXCLUDED.call_link_url, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.av_coach_contact_options(p_coach_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'whatsapp', (SELECT s.whatsapp_e164 FROM public.coach_contact_settings s
                  WHERE s.coach_id = p_coach_id AND s.whatsapp_opt_in AND s.whatsapp_e164 IS NOT NULL),
    'call_link', (SELECT s.call_link_url FROM public.coach_contact_settings s
                   WHERE s.coach_id = p_coach_id AND s.call_link_url IS NOT NULL));
$fn$;

CREATE OR REPLACE FUNCTION public.av_coach_contact_tap(p_coach_id uuid, p_channel text, p_source text, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'call_link') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_channel');
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('storefront', 'session') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_source');
  END IF;
  IF p_channel = 'call_link' AND p_source <> 'storefront' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_source');
  END IF;
  IF v_uid IS NULL OR p_coach_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  -- A coach tapping their own button is not a contact.
  IF v_uid = p_coach_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'own_profile');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coach_contact_settings s
                  WHERE s.coach_id = p_coach_id
                    AND CASE p_channel
                          WHEN 'whatsapp' THEN s.whatsapp_opt_in AND s.whatsapp_e164 IS NOT NULL
                          ELSE s.call_link_url IS NOT NULL
                        END) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF p_source = 'session' AND NOT EXISTS (SELECT 1 FROM public.sessions x
                                           WHERE x.id = p_session_id AND x.creator_id = p_coach_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.coach_contact_log (coach_id, contact_user_id, channel, source, session_id)
  VALUES (p_coach_id, v_uid, p_channel, p_source, CASE WHEN p_source = 'session' THEN p_session_id END);
  RETURN jsonb_build_object('success', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_set_call_link(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.av_set_call_link(text) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.av_set_call_link(text)') IS NULL
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.av_set_call_link(text)'))
     OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.av_set_call_link(text)')) IS NULL
     OR has_function_privilege('anon', 'public.av_set_call_link(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.av_set_call_link(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '8002 ABORTED: av_set_call_link is missing, not a pinned SECURITY DEFINER, or has the wrong grants.';
  END IF;
  IF has_function_privilege('anon', 'public.av_coach_contact_options(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.av_coach_contact_tap(uuid,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '8002 ABORTED: anon gained EXECUTE on a replaced contact function.';
  END IF;
  IF has_any_column_privilege('authenticated', 'public.coach_contact_settings', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.coach_contact_settings', 'SELECT') THEN
    RAISE EXCEPTION '8002 ABORTED: the new column inherited a client grant.';
  END IF;
  RAISE NOTICE '8002: call link column, setter and widened tap log installed.';
END $$;

COMMIT;

-- NOT A migrations_applied ROW. The 8000 block is renumbered at the merge
-- gate; the record belongs to the renumbered file.

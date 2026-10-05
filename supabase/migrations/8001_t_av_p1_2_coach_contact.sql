-- PROGRAM: T-AV
-- TICKET: T-AV29 (athlete concepts Phase 1, P1-2: WhatsApp contact button)
-- TABLE: public.coach_contact_settings OWNER: t-av-new
-- TABLE: public.coach_contact_log OWNER: t-av-new
-- CREATES: av_set_whatsapp_contact, av_coach_contact_options, av_coach_contact_tap
--
-- ════════════════════════════════════════════════════════════════════════════
-- P1-2: "Escríbele a {coach} por WhatsApp", and a server-side log of every tap
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch-only, reserved T-AV block, renumbered at the merge gate. 8001 was
-- free on 2026-10-04: origin/main ends at 198, and the only 80xx file anywhere
-- is 8000 (T-AV2, the branch this one is stacked on).
--
-- WHY A NEW TABLE AND NOT COLUMNS ON users. public.users is under column-level
-- grants (CLAUDE.md, migrations 066, 067, 113) and has BEFORE UPDATE guards
-- that exist only in production. A coach's WhatsApp number and opt-in are
-- coach-owned settings the rest of the app never reads, so they live in their
-- own table with no client grants at all, written and read through definer
-- functions. P1-3, P1-5 and P1-6 add their coach-written fields here too.
--
-- WHY THE LOG IS A TABLE. Analytics go through PostHog, which ad blockers and
-- dropped requests lose. The evaluation's north star (new-client contacts per
-- coach per month, Revision 1) needs a count a coach can be shown, so every
-- tap is one row written by the database.
--
-- WHO SEES WHAT
--   coach_contact_settings  the coach (own row) and app admins. Nobody else
--                           reads the table; a viewer learns a coach's number
--                           only through av_coach_contact_options, and only
--                           when that coach opted in AND saved a number.
--   coach_contact_log       the coach reads rows where they are the coach;
--                           app admins read all. No client role may insert,
--                           update or delete; av_coach_contact_tap inserts.
--
-- PRIVACY NOTE FOR AL. A row records WHO tapped. The coach can read it, and
-- P1-4 shows first names. The prefilled message already tells the coach the
-- person found them on Tribe, but a tap that never becomes a message is still
-- visible to the coach. The data policy should say so before the flag opens.

BEGIN;

-- ── 1. Tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_contact_settings (
  coach_id         uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  whatsapp_e164    text CHECK (whatsapp_e164 IS NULL OR whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_opt_in  boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.coach_contact_settings IS
  'T-AV P1. Coach-written contact settings. Read and written only through av_* definer functions; no client grants.';

CREATE TABLE IF NOT EXISTS public.coach_contact_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  channel          text NOT NULL CHECK (channel IN ('whatsapp')),
  source           text NOT NULL CHECK (source IN ('storefront', 'session')),
  session_id       uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.coach_contact_log IS
  'T-AV P1. One row per tap on a coach contact button. Written only by av_coach_contact_tap. contact_user_id is who tapped; the coach can read it.';
CREATE INDEX IF NOT EXISTS coach_contact_log_coach_created ON public.coach_contact_log (coach_id, created_at DESC);

ALTER TABLE public.coach_contact_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_contact_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.coach_contact_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.coach_contact_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_contact_settings TO authenticated;
GRANT SELECT ON public.coach_contact_log TO authenticated;
GRANT ALL ON public.coach_contact_settings, public.coach_contact_log TO service_role;

DROP POLICY IF EXISTS coach_contact_settings_owner_or_admin ON public.coach_contact_settings;
CREATE POLICY coach_contact_settings_owner_or_admin ON public.coach_contact_settings
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR public.is_app_admin());

DROP POLICY IF EXISTS coach_contact_log_coach_or_admin ON public.coach_contact_log;
CREATE POLICY coach_contact_log_coach_or_admin ON public.coach_contact_log
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR public.is_app_admin());

-- ── 2. The coach saves their WhatsApp choice ───────────────────────────────
CREATE OR REPLACE FUNCTION public.av_set_whatsapp_contact(p_opt_in boolean, p_whatsapp text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF p_whatsapp IS NOT NULL AND p_whatsapp !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_whatsapp');
  END IF;
  IF coalesce(p_opt_in, false) AND p_whatsapp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'whatsapp_required');
  END IF;
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.is_instructor IS TRUE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_instructor');
  END IF;

  INSERT INTO public.coach_contact_settings (coach_id, whatsapp_e164, whatsapp_opt_in, updated_at)
  VALUES (v_uid, p_whatsapp, coalesce(p_opt_in, false), now())
  ON CONFLICT (coach_id) DO UPDATE
     SET whatsapp_e164 = EXCLUDED.whatsapp_e164,
         whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
         updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$fn$;

-- ── 3. What a viewer may use to reach a coach ──────────────────────────────
-- Only what is switched on. The number is returned only when the coach opted
-- in and saved one; otherwise it is null and the button does not render.
CREATE OR REPLACE FUNCTION public.av_coach_contact_options(p_coach_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'whatsapp', (SELECT s.whatsapp_e164 FROM public.coach_contact_settings s
                  WHERE s.coach_id = p_coach_id AND s.whatsapp_opt_in AND s.whatsapp_e164 IS NOT NULL));
$fn$;

-- ── 4. Every tap, logged by the database ───────────────────────────────────
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
  IF p_channel IS DISTINCT FROM 'whatsapp' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_channel');
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('storefront', 'session') THEN
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
                  WHERE s.coach_id = p_coach_id AND s.whatsapp_opt_in AND s.whatsapp_e164 IS NOT NULL) THEN
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

REVOKE ALL ON FUNCTION public.av_set_whatsapp_contact(boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.av_coach_contact_options(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.av_coach_contact_tap(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.av_set_whatsapp_contact(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_coach_contact_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_coach_contact_tap(uuid, text, text, uuid) TO authenticated;

-- ── 5. Assert the end state ────────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['public.coach_contact_settings', 'public.coach_contact_log'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_t::regclass) THEN
      RAISE EXCEPTION '8001 ABORTED: RLS is off on %.', v_t;
    END IF;
    IF has_any_column_privilege('authenticated', v_t, 'INSERT')
       OR has_any_column_privilege('authenticated', v_t, 'UPDATE')
       OR has_table_privilege('authenticated', v_t, 'DELETE')
       OR has_any_column_privilege('anon', v_t, 'SELECT') THEN
      RAISE EXCEPTION '8001 ABORTED: a client role can write %, or anon can read it.', v_t;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.av_set_whatsapp_contact(boolean,text)',
    'public.av_coach_contact_options(uuid)',
    'public.av_coach_contact_tap(uuid,text,text,uuid)'] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_fn))
       OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure(v_fn)) IS NULL THEN
      RAISE EXCEPTION '8001 ABORTED: % must be SECURITY DEFINER with a pinned search_path.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '8001 ABORTED: % has the wrong grants.', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE '8001: coach contact settings and tap log installed.';
END $$;

COMMIT;

-- NOT A migrations_applied ROW. The 8000 block is renumbered at the merge
-- gate; the record belongs to the renumbered file.

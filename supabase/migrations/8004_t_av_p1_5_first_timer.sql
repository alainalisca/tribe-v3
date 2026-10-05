-- PROGRAM: T-AV
-- TICKET: T-AV32 (athlete concepts Phase 1, P1-5: first-timer block on session detail)
-- TABLE: public.coach_contact_settings OWNER: t-av-new
-- CREATES: av_set_first_timer_text, av_first_timer_block
--
-- ════════════════════════════════════════════════════════════════════════════
-- P1-5: "Tu primera vez con {coach}", for people who have never been
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch-only, reserved T-AV block. 8004 was free on 2026-10-04: origin/main
-- ends at 198; 80xx holds 8000 to 8003, the branches this is stacked on.
--
-- THE TEXT is the coach's own words about what to expect at a first class
-- (what to bring, where to enter, who to ask for). 600 characters at most.
--
-- WHO SEES IT. av_first_timer_block(session) returns the text only when the
-- caller is signed in, is not the coach, the coach wrote a text, and the caller
-- has NO confirmed attendance with that coach. "Confirmed" is 8003's
-- definition: session_attendance.status = 'attended' on any of the coach's
-- sessions, or a coach's Pass lead with attended_at set. A no-show or a join
-- that was never marked does not make someone a regular.
--
-- NEVER OTHER NEWCOMERS. The function reads the caller's own history and the
-- coach's text. It returns the coach's first name and the text, and nothing
-- about anyone else: no count of other first-timers, no names (evaluation C3:
-- a "3+ new" pill only at the density threshold, which is not built here).

BEGIN;

ALTER TABLE public.coach_contact_settings ADD COLUMN IF NOT EXISTS first_timer_text text;
ALTER TABLE public.coach_contact_settings DROP CONSTRAINT IF EXISTS coach_contact_settings_first_timer_len;
ALTER TABLE public.coach_contact_settings ADD CONSTRAINT coach_contact_settings_first_timer_len
  CHECK (first_timer_text IS NULL OR char_length(first_timer_text) BETWEEN 1 AND 600);
COMMENT ON COLUMN public.coach_contact_settings.first_timer_text IS
  'T-AV32 (P1-5). The coach''s words for someone''s first class with them. Shown only to people with no confirmed attendance with this coach.';

CREATE OR REPLACE FUNCTION public.av_set_first_timer_text(p_text text)
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
  IF v_text IS NOT NULL AND char_length(v_text) > 600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_long');
  END IF;
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.is_instructor IS TRUE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_instructor');
  END IF;
  INSERT INTO public.coach_contact_settings (coach_id, first_timer_text, updated_at)
  VALUES (v_uid, v_text, now())
  ON CONFLICT (coach_id) DO UPDATE SET first_timer_text = EXCLUDED.first_timer_text, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.av_first_timer_block(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_coach uuid;
  v_text  text;
  v_name  text;
BEGIN
  IF v_uid IS NULL OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('show', false);
  END IF;
  SELECT s.creator_id INTO v_coach FROM public.sessions s WHERE s.id = p_session_id;
  IF v_coach IS NULL OR v_coach = v_uid THEN
    RETURN jsonb_build_object('show', false);
  END IF;
  SELECT c.first_timer_text INTO v_text FROM public.coach_contact_settings c WHERE c.coach_id = v_coach;
  IF v_text IS NULL THEN
    RETURN jsonb_build_object('show', false);
  END IF;

  -- The caller's own confirmed history with this coach. Nobody else's.
  IF EXISTS (SELECT 1 FROM public.session_attendance a
               JOIN public.sessions s ON s.id = a.session_id
              WHERE a.user_id = v_uid AND s.creator_id = v_coach AND a.status = 'attended')
     OR EXISTS (SELECT 1 FROM public.pass_leads pl
                 WHERE pl.tribe_user_id = v_uid AND pl.attended_at IS NOT NULL
                   AND (pl.instructor_id = v_coach
                        OR pl.partner_id IN (SELECT fp.id FROM public.featured_partners fp WHERE fp.user_id = v_coach))) THEN
    RETURN jsonb_build_object('show', false);
  END IF;

  SELECT split_part(btrim(coalesce(u.name, '')), ' ', 1) INTO v_name FROM public.users u WHERE u.id = v_coach;
  RETURN jsonb_build_object('show', true, 'coach_first_name', v_name, 'text', v_text);
END;
$fn$;

REVOKE ALL ON FUNCTION public.av_set_first_timer_text(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.av_first_timer_block(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.av_set_first_timer_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.av_first_timer_block(uuid) TO authenticated;

DO $$
DECLARE v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.av_set_first_timer_text(text)', 'public.av_first_timer_block(uuid)'] LOOP
    IF to_regprocedure(v_fn) IS NULL
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_fn))
       OR (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure(v_fn)) IS NULL
       OR has_function_privilege('anon', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '8004 ABORTED: % is missing, not a pinned SECURITY DEFINER, or has the wrong grants.', v_fn;
    END IF;
  END LOOP;
  IF (SELECT provolatile FROM pg_proc WHERE oid = to_regprocedure('public.av_first_timer_block(uuid)')) <> 's' THEN
    RAISE EXCEPTION '8004 ABORTED: av_first_timer_block must be STABLE (read only).';
  END IF;
  IF has_any_column_privilege('authenticated', 'public.coach_contact_settings', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.coach_contact_settings', 'SELECT') THEN
    RAISE EXCEPTION '8004 ABORTED: the new column inherited a client grant.';
  END IF;
  RAISE NOTICE '8004: first-timer text and block installed.';
END $$;

COMMIT;

-- NOT A migrations_applied ROW. The 8000 block is renumbered at the merge
-- gate; the record belongs to the renumbered file.

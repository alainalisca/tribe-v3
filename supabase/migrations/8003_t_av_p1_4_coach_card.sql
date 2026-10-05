-- PROGRAM: T-AV
-- TICKET: T-AV31 (athlete concepts Phase 1, P1-4: coach card "Lo que Tribe te trajo este mes")
-- CREATES: av_coach_tribe_brought(date)
-- READS: coach_contact_log, conversations, conversation_participants, chat_messages,
--        pass_leads, featured_partners, session_participants, session_attendance, sessions, users
-- WRITES: nothing. Touches no Tribe.OS table (clients, client_attendance, /os/*).
--
-- ════════════════════════════════════════════════════════════════════════════
-- P1-4: what Tribe brought a coach this month, in one read
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch-only, reserved T-AV block. 8003 was free on 2026-10-04: origin/main
-- ends at 198; 80xx holds 8000 to 8002, the branches this is stacked on. It
-- reads 8000's status column and 8001's tap log, so it needs both.
--
-- THE DEFINITIONS (evaluation Revision 1, north star and lead quality). The
-- month is a calendar month in America/Bogota. Nobody is ever counted for
-- their own coaching.
--
--   CONTACTS. Distinct people whose FIRST touch with this coach falls in the
--   month, where a touch is any of:
--     * a tap on the coach's WhatsApp or call-link button (coach_contact_log);
--     * a direct conversation with the coach whose first message they sent;
--     * a Pass claim for the coach (pass_leads.instructor_id) or for a partner
--       the coach owns (featured_partners.user_id), by a Tribe user;
--     * their first join of any of the coach's sessions.
--   "First" across all four, ever: someone who joined a class in June and taps
--   WhatsApp in October is not an October contact.
--
--   CONFIRMED FIRST VISITS. People whose first CONFIRMED visit with the coach
--   falls in the month. A visit is a session_attendance row with status
--   'attended' (T-AV2) on one of the coach's sessions, dated by the session,
--   or a coach's Pass lead with attended_at set, dated by that.
--
--   CAME BACK. Of this month's first visits, people with another confirmed
--   visit on a later day, at most 30 days after the first. A first visit late
--   in the month may still come back after this card is read; the count is
--   what has happened so far.
--
-- Names are first names only (the first word of users.name), ordered by when
-- each thing happened. They are shown to the coach about their own clients;
-- nothing here is shown to anyone else.
--
-- SECURITY DEFINER because the coach cannot read other people's join rows,
-- conversations or Pass leads under RLS. The caller is always the coach: there
-- is no coach parameter, so nobody can ask about another coach.

BEGIN;

CREATE OR REPLACE FUNCTION public.av_coach_tribe_brought(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_coach uuid := auth.uid();
  v_from  date;
  v_to    date;
  v_out   jsonb;
BEGIN
  IF v_coach IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_coach AND u.is_instructor IS TRUE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_instructor');
  END IF;

  v_from := date_trunc('month', coalesce(p_month, (now() AT TIME ZONE 'America/Bogota')::date))::date;
  v_to   := (v_from + interval '1 month')::date;

  WITH
  touches AS (
    SELECT l.contact_user_id AS person, l.created_at AS at
      FROM public.coach_contact_log l
     WHERE l.coach_id = v_coach AND l.contact_user_id IS NOT NULL
    UNION ALL
    -- A direct conversation between exactly the coach and one other person,
    -- dated by its first message, counted only if that person sent it.
    SELECT first_msg.user_id, first_msg.created_at
      FROM public.conversations c
      JOIN LATERAL (SELECT m.user_id, m.created_at FROM public.chat_messages m
                     WHERE m.conversation_id = c.id ORDER BY m.created_at, m.id LIMIT 1) first_msg ON true
     WHERE c.type = 'direct'
       AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = v_coach)
       AND (SELECT count(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
       AND first_msg.user_id IS DISTINCT FROM v_coach
    UNION ALL
    SELECT pl.tribe_user_id, pl.created_at
      FROM public.pass_leads pl
     WHERE pl.tribe_user_id IS NOT NULL
       AND (pl.instructor_id = v_coach
            OR pl.partner_id IN (SELECT fp.id FROM public.featured_partners fp WHERE fp.user_id = v_coach))
    UNION ALL
    SELECT sp.user_id, sp.joined_at
      FROM public.session_participants sp
      JOIN public.sessions s ON s.id = sp.session_id
     WHERE s.creator_id = v_coach AND sp.user_id IS NOT NULL AND coalesce(sp.is_guest, false) = false
  ),
  first_touch AS (
    SELECT person, min(at) AS at FROM touches
     WHERE person IS NOT NULL AND person <> v_coach AND at IS NOT NULL
     GROUP BY person
  ),
  contacts AS (
    SELECT person, at FROM first_touch
     WHERE (at AT TIME ZONE 'America/Bogota')::date >= v_from
       AND (at AT TIME ZONE 'America/Bogota')::date < v_to
  ),
  visits AS (
    SELECT a.user_id AS person, s.date AS day
      FROM public.session_attendance a
      JOIN public.sessions s ON s.id = a.session_id
     WHERE s.creator_id = v_coach AND a.status = 'attended' AND a.user_id IS NOT NULL
    UNION
    SELECT pl.tribe_user_id, (pl.attended_at AT TIME ZONE 'America/Bogota')::date
      FROM public.pass_leads pl
     WHERE pl.attended_at IS NOT NULL AND pl.tribe_user_id IS NOT NULL
       AND (pl.instructor_id = v_coach
            OR pl.partner_id IN (SELECT fp.id FROM public.featured_partners fp WHERE fp.user_id = v_coach))
  ),
  first_visit AS (
    SELECT person, min(day) AS day FROM visits WHERE person <> v_coach GROUP BY person
  ),
  first_visits AS (
    SELECT person, day FROM first_visit WHERE day >= v_from AND day < v_to
  ),
  came_back AS (
    SELECT f.person, min(v.day) AS day
      FROM first_visits f
      JOIN visits v ON v.person = f.person AND v.day > f.day AND v.day <= f.day + 30
     GROUP BY f.person
  ),
  named AS (
    SELECT 'contacts' AS grp, c.at AS ord, split_part(btrim(coalesce(u.name, '')), ' ', 1) AS first
      FROM contacts c JOIN public.users u ON u.id = c.person
    UNION ALL
    SELECT 'first_visits', f.day::timestamptz, split_part(btrim(coalesce(u.name, '')), ' ', 1)
      FROM first_visits f JOIN public.users u ON u.id = f.person
    UNION ALL
    SELECT 'came_back', b.day::timestamptz, split_part(btrim(coalesce(u.name, '')), ' ', 1)
      FROM came_back b JOIN public.users u ON u.id = b.person
  )
  SELECT jsonb_build_object(
           'success', true,
           'month', to_char(v_from, 'YYYY-MM'),
           'contacts', jsonb_build_object(
              'count', (SELECT count(*) FROM contacts),
              'names', coalesce((SELECT jsonb_agg(first ORDER BY ord) FROM named WHERE grp = 'contacts'), '[]'::jsonb)),
           'first_visits', jsonb_build_object(
              'count', (SELECT count(*) FROM first_visits),
              'names', coalesce((SELECT jsonb_agg(first ORDER BY ord) FROM named WHERE grp = 'first_visits'), '[]'::jsonb)),
           'came_back', jsonb_build_object(
              'count', (SELECT count(*) FROM came_back),
              'names', coalesce((SELECT jsonb_agg(first ORDER BY ord) FROM named WHERE grp = 'came_back'), '[]'::jsonb)))
    INTO v_out;

  RETURN v_out;
END;
$fn$;

COMMENT ON FUNCTION public.av_coach_tribe_brought(date) IS
  'T-AV31 (P1-4). Read only. For the calling instructor: contacts, confirmed first visits and came-back within 30 days in one Bogota calendar month, with first names. Definitions in migration 8003.';

REVOKE ALL ON FUNCTION public.av_coach_tribe_brought(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.av_coach_tribe_brought(date) TO authenticated;

DO $$
DECLARE v_fn regprocedure := to_regprocedure('public.av_coach_tribe_brought(date)');
BEGIN
  IF v_fn IS NULL
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn)
     OR (SELECT proconfig FROM pg_proc WHERE oid = v_fn) IS NULL
     OR (SELECT provolatile FROM pg_proc WHERE oid = v_fn) <> 's'
     OR has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '8003 ABORTED: av_coach_tribe_brought is missing, not a pinned STABLE SECURITY DEFINER, or has the wrong grants.';
  END IF;
  RAISE NOTICE '8003: av_coach_tribe_brought installed (read only).';
END $$;

COMMIT;

-- NOT A migrations_applied ROW. The 8000 block is renumbered at the merge
-- gate; the record belongs to the renumbered file.

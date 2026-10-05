-- 200_recap_photo_report_function_REHEARSAL.sql. Dry run of 200 on top of 199. Applies nothing.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/rehearsals/200_recap_photo_report_function_REHEARSAL.sql
--
-- A psql script: it includes 199 and 200 VERBATIM with \ir, in one
-- transaction ended by ROLLBACK. On the local stack, F0 recreates production's
-- storage state first (as in 199's rehearsal); on production F0 creates
-- nothing. Every row must read PASS.
--
-- FIXTURE (199's): host H, confirmed participant P, pending Q, outsider O,
-- admin A; session S hosted by H; recap rows by P and by H.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT SELECT ON reh_ids TO authenticated, anon;

-- Runs one statement as a role, returns a count or the error. Role and claims
-- are set and reset around the statement; the result is recorded only after
-- RESET ROLE, as postgres.
CREATE FUNCTION pg_temp.reh_case(p_arm text, p_actor text, p_expect text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_uid uuid;
  v_n bigint;
  v_got text;
BEGIN
  IF p_actor <> 'anon' THEN
    SELECT v INTO v_uid FROM reh_ids WHERE k = p_actor;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', CASE WHEN p_actor = 'anon' THEN 'anon' ELSE 'authenticated' END)::text, true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_uid::text, ''), true);
    EXECUTE CASE WHEN p_actor = 'anon' THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
    EXECUTE p_sql INTO v_n;
    EXECUTE 'RESET ROLE';
    v_got := 'rows=' || v_n;
  EXCEPTION WHEN others THEN
    v_got := 'error=' || SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO reh (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got = p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('actor=%s expected %s, got %s', p_actor, p_expect, v_got));
END $f$;

INSERT INTO reh (arm, verdict, detail)
SELECT 'E0 ENV session_user and current_user', 'PASS',
       format('session_user=%s current_user=%s', session_user, current_user);

-- ── F0. Production's storage state, only where it is missing ───────────────
DO $f0$
DECLARE
  v_local boolean := NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'session-photos');
BEGIN
  IF v_local THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('session-photos', 'session-photos', true);
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('session-stories', 'session-stories', true, 52428800,
            ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']);
    CREATE POLICY "Users can delete own session stories media" ON storage.objects FOR DELETE TO public
      USING ((bucket_id = 'session-stories'::text) AND ((auth.uid())::text = (storage.foldername(name))[2]));
    CREATE POLICY "Users can delete own story files" ON storage.objects FOR DELETE TO public
      USING ((bucket_id = 'session-stories'::text) AND ((auth.uid())::text = (storage.foldername(name))[2]));
    CREATE POLICY "Users can delete their own session photos" ON storage.objects FOR DELETE TO public
      USING ((bucket_id = 'session-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
    CREATE POLICY "Auth users can upload session stories" ON storage.objects FOR INSERT TO public
      WITH CHECK ((bucket_id = 'session-stories'::text) AND (auth.role() = 'authenticated'::text));
    CREATE POLICY "Authenticated users can upload session photos" ON storage.objects FOR INSERT TO public
      WITH CHECK ((bucket_id = 'session-photos'::text) AND (auth.role() = 'authenticated'::text));
    CREATE POLICY "Authenticated users can upload session stories media" ON storage.objects FOR INSERT TO public
      WITH CHECK ((bucket_id = 'session-stories'::text) AND (auth.role() = 'authenticated'::text));
    CREATE POLICY "Anyone can view session photos" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'session-photos'::text);
    CREATE POLICY "Anyone can view session stories" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'session-stories'::text);
    CREATE POLICY "Anyone can view session stories media" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'session-stories'::text);
    CREATE POLICY "Users can update their own session photos" ON storage.objects FOR UPDATE TO public
      USING ((bucket_id = 'session-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
  END IF;
  INSERT INTO reh (arm, verdict, detail)
  VALUES ('F0 fixture: production storage state recreated here', 'PASS',
          CASE WHEN v_local THEN 'yes (local stack: buckets and the ten 2026-10-04 storage policies created in this transaction)'
               ELSE 'no (buckets already present; nothing created)' END);
END $f0$;


-- ── F1. Users, session, rows, files ────────────────────────────────────────
DO $f1$
DECLARE
  u uuid[];
  u_a uuid;
  s uuid;
BEGIN
  SELECT id INTO u_a FROM public.users
   WHERE is_admin AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT array_agg(id) INTO u FROM (
    SELECT id FROM public.users
     WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL
     ORDER BY created_at LIMIT 4) x;
  IF u_a IS NULL OR coalesce(cardinality(u), 0) < 4 THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need one admin and four non-admin, non-deleted users.';
  END IF;

  INSERT INTO public.sessions (creator_id, sport, date, start_time, duration, location, max_participants)
  VALUES (u[1], 'Running', current_date - 1, '07:00', 60, 'Rehearsal 199', 10)
  RETURNING id INTO s;
  INSERT INTO public.session_participants (session_id, user_id, status)
  VALUES (s, u[2], 'confirmed'), (s, u[3], 'pending');

  INSERT INTO reh_ids VALUES ('H', u[1]), ('P', u[2]), ('Q', u[3]), ('O', u[4]), ('A', u_a), ('S', s);

  INSERT INTO public.session_recap_photos (session_id, user_id, photo_url) VALUES
    (s, u[2], 'https://x.supabase.co/storage/v1/object/public/session-recap-photos/' || s || '/' || u[2] || '/p.jpg'),
    (s, u[1], 'https://x.supabase.co/storage/v1/object/public/session-photos/' || u[1] || '/1-recap-0.jpg');
  INSERT INTO public.session_stories (session_id, user_id, media_url, media_type, expires_at) VALUES
    (s, u[2], 'https://x.supabase.co/storage/v1/object/public/session-stories/' || s || '/' || u[2] || '/live.jpg', 'image', now() + interval '1 hour'),
    (s, u[2], 'https://x.supabase.co/storage/v1/object/public/session-stories/' || s || '/' || u[2] || '/old.jpg', 'image', now() - interval '1 hour'),
    (s, u[3], 'https://x.supabase.co/storage/v1/object/public/session-stories/' || s || '/' || u[3] || '/q.jpg', 'image', now() + interval '1 hour');
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('session-stories', s || '/' || u[2] || '/live.jpg'),
    ('session-photos', u[1] || '/listing-0.jpg');
END $f1$;

INSERT INTO reh (arm, verdict, detail)
SELECT 'F1 fixture built', CASE WHEN count(*) = 6 THEN 'PASS' ELSE 'FAIL' END, count(*) || ' ids recorded'
  FROM reh_ids;

\ir ../migrations/199_session_media_participants_only.sql

-- ── B. AFTER 199, BEFORE 200: the hole exists ──────────────────────────────
DO $b$
DECLARE s text := (SELECT v FROM reh_ids WHERE k = 'S');
        h text := (SELECT v FROM reh_ids WHERE k = 'H');
BEGIN
  PERFORM pg_temp.reh_case('B1 BEFORE 200: a participant can rewrite the host''s photo_url', 'P', 'rows=1',
    format('WITH x AS (UPDATE public.session_recap_photos SET photo_url = %L WHERE session_id = %L AND user_id = %L RETURNING 1) SELECT count(*) FROM x',
           'https://evil.example/x.jpg', s, h));
END $b$;
-- Put the row back, so every later arm starts from the real state.
UPDATE public.session_recap_photos SET photo_url = 'https://x.supabase.co/storage/v1/object/public/session-photos/'
       || (SELECT v FROM reh_ids WHERE k = 'H') || '/1-recap-0.jpg'
 WHERE user_id = (SELECT v FROM reh_ids WHERE k = 'H');

\ir ../migrations/200_recap_photo_report_function.sql

DO $c$
DECLARE s text := (SELECT v FROM reh_ids WHERE k = 'S');
        h text := (SELECT v FROM reh_ids WHERE k = 'H');
        p text := (SELECT v FROM reh_ids WHERE k = 'P');
        r_h text := (SELECT id FROM public.session_recap_photos WHERE user_id = (SELECT v FROM reh_ids WHERE k = 'H'));
        r_p text := (SELECT id FROM public.session_recap_photos WHERE user_id = (SELECT v FROM reh_ids WHERE k = 'P'));
        rep text := 'WITH x AS (SELECT coalesce(public.report_recap_photo(%L, %L)->>''error'', ''ok'') AS v) SELECT CASE WHEN v = ''ok'' THEN 1 ELSE 0 END FROM x';
        rewrite text;
BEGIN
  rewrite := format('WITH x AS (UPDATE public.session_recap_photos SET photo_url = %L WHERE id = %L RETURNING 1) SELECT count(*) FROM x', 'https://evil.example/y.jpg', r_h);
  PERFORM pg_temp.reh_case('C1 a participant can no longer rewrite photo_url', 'P', 'rows=0', rewrite);
  PERFORM pg_temp.reh_case('C2 nor clear someone''s report directly', 'P', 'rows=0',
    format('WITH x AS (UPDATE public.session_recap_photos SET reported = false WHERE id = %L RETURNING 1) SELECT count(*) FROM x', r_h));
  PERFORM pg_temp.reh_case('C3 the host cannot rewrite a participant''s photo either', 'H', 'rows=0',
    format('WITH x AS (UPDATE public.session_recap_photos SET photo_url = %L WHERE id = %L RETURNING 1) SELECT count(*) FROM x', 'https://evil.example/z.jpg', r_p));
  PERFORM pg_temp.reh_case('C4 an outsider cannot report a photo they cannot see', 'O', 'rows=0', format(rep, r_h, 'spam'));
  PERFORM pg_temp.reh_case('C5 a pending participant cannot either', 'Q', 'rows=0', format(rep, r_h, 'spam'));
  PERFORM pg_temp.reh_case('C6 anon cannot report', 'anon', 'error=42501', format(rep, r_h, 'spam'));
  PERFORM pg_temp.reh_case('C7 an unknown photo reads like an unseen one', 'P', 'rows=0', format(rep, gen_random_uuid(), 'x'));

  PERFORM pg_temp.reh_case('S1 a confirmed participant reports the host''s photo', 'P', 'rows=1', format(rep, r_h, '  No es de esta sesión  '));
  PERFORM pg_temp.reh_case('S2 the host reports a participant''s photo', 'H', 'rows=1', format(rep, r_p, ''));
  -- Read before S3 overwrites the reason: the empty reason became the default.
  PERFORM pg_temp.reh_case('S2b an empty reason stores the app''s default', 'P', 'rows=1',
    format('SELECT count(*) FROM public.session_recap_photos WHERE id = %L AND reported_reason = %L', r_p, 'No reason provided'));
  PERFORM pg_temp.reh_case('S3 the uploader can report their own photo', 'P', 'rows=1', format(rep, r_p, repeat('a', 600)));
  PERFORM pg_temp.reh_case('S4 an admin can still moderate directly (clear a report)', 'A', 'rows=1',
    format('WITH x AS (UPDATE public.session_recap_photos SET reported = false WHERE id = %L RETURNING 1) SELECT count(*) FROM x', r_h));
END $c$;

INSERT INTO reh (arm, verdict, detail)
SELECT 'S5 the report wrote only its three columns: photo_url untouched, reason trimmed, reporter is the caller',
       CASE WHEN r.photo_url LIKE '%/session-photos/%/1-recap-0.jpg' AND r.reported_reason = 'No es de esta sesión'
             AND r.reported_by = (SELECT v FROM reh_ids WHERE k = 'P') THEN 'PASS' ELSE 'FAIL' END,
       format('photo_url=%s reason=%s by_P=%s', right(r.photo_url, 20), r.reported_reason, r.reported_by = (SELECT v FROM reh_ids WHERE k = 'P'))
  FROM public.session_recap_photos r WHERE r.user_id = (SELECT v FROM reh_ids WHERE k = 'H');
INSERT INTO reh (arm, verdict, detail)
SELECT 'S6 a reason longer than 500 characters stops at 500',
       CASE WHEN r.reported AND char_length(r.reported_reason) = 500 THEN 'PASS' ELSE 'FAIL' END,
       format('reported=%s length=%s', r.reported, char_length(r.reported_reason))
  FROM public.session_recap_photos r WHERE r.user_id = (SELECT v FROM reh_ids WHERE k = 'P');

SELECT seq, arm, verdict, detail FROM reh ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh;

ROLLBACK;

-- 199_session_media_participants_only_REHEARSAL.sql. Dry run of 199. Applies nothing.
--
-- A psql script, not an SQL-editor paste: it includes the migration file
-- VERBATIM with \ir, guards and pre-flight included, so what is rehearsed is
-- the file that will be pasted and not a hand copy of it. One transaction,
-- ended by ROLLBACK; with ON_ERROR_STOP a failure aborts it.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/rehearsals/199_session_media_participants_only_REHEARSAL.sql
--
-- Every row of the final result must read PASS (or SKIP, explained in its
-- detail). Reaching that result at all is the success arm for 199's pre-flight
-- and guards: had either raised, the script would have stopped there.
--
-- LOCAL STACK. The local dump is public-schema only, so it has no storage
-- buckets or storage policies. When session-photos is absent, F0 recreates
-- production's storage state as read on 2026-10-04 (two public buckets, the
-- ten storage policies on them) inside this transaction. On production F0
-- finds the buckets and creates nothing; its row says which happened.
--
-- FIXTURE, all inside the transaction: five existing users (host H, confirmed
-- participant P, pending participant Q, outsider O, admin A), one session S
-- hosted by H, recap rows by P and H, a live and an expired story by P, a
-- live story by Q, and storage rows for each file. No file bytes.

\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE reh_199 (seq serial, arm text, verdict text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE reh_199_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT SELECT ON reh_199_ids TO authenticated, anon;

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
    SELECT v INTO v_uid FROM reh_199_ids WHERE k = p_actor;
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
  INSERT INTO reh_199 (arm, verdict, detail)
  VALUES (p_arm, CASE WHEN v_got = p_expect THEN 'PASS' ELSE 'FAIL' END,
          format('actor=%s expected %s, got %s', p_actor, p_expect, v_got));
END $f$;

INSERT INTO reh_199 (arm, verdict, detail)
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
  INSERT INTO reh_199 (arm, verdict, detail)
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

  INSERT INTO reh_199_ids VALUES ('H', u[1]), ('P', u[2]), ('Q', u[3]), ('O', u[4]), ('A', u_a), ('S', s);

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

INSERT INTO reh_199 (arm, verdict, detail)
SELECT 'F1 fixture built', CASE WHEN count(*) = 6 THEN 'PASS' ELSE 'FAIL' END, count(*) || ' ids recorded'
  FROM reh_199_ids;

-- ── B. BEFORE 199: the holes exist (each must reproduce) ───────────────────
DO $b$
DECLARE s text := (SELECT v FROM reh_199_ids WHERE k = 'S');
        h text := (SELECT v FROM reh_199_ids WHERE k = 'H');
BEGIN
  PERFORM pg_temp.reh_case('B1 BEFORE: an outsider reads every recap row of a session', 'O', 'rows=2',
    format('SELECT count(*) FROM public.session_recap_photos WHERE session_id = %L', s));
  PERFORM pg_temp.reh_case('B2 BEFORE: anon reads a live story row', 'anon', 'rows=2',
    format('SELECT count(*) FROM public.session_stories WHERE session_id = %L', s));
  PERFORM pg_temp.reh_case('B3 BEFORE: anon lists story files', 'anon', 'rows=1',
    format('SELECT count(*) FROM storage.objects WHERE bucket_id = ''session-stories'' AND name LIKE %L', s || '/%'));
  PERFORM pg_temp.reh_case('B4 BEFORE: anon lists the session-photos bucket', 'anon', 'rows=1',
    format('SELECT count(*) FROM storage.objects WHERE bucket_id = ''session-photos'' AND name LIKE %L', h || '/%'));
END $b$;

-- ── M. THE MIGRATION, verbatim ─────────────────────────────────────────────
\ir ../migrations/199_session_media_participants_only.sql

INSERT INTO reh_199 (arm, verdict, detail)
SELECT 'M1 199 applied in this transaction: pre-flight and guards passed, recorded',
       CASE WHEN EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration = '199_session_media_participants_only')
            THEN 'PASS' ELSE 'FAIL' END,
       'reached after the migration file; a raise would have stopped the script';

-- Recap files exist only once their bucket does.
INSERT INTO storage.objects (bucket_id, name)
SELECT 'session-recap-photos', s.v || '/' || p.v || '/p.jpg'
  FROM reh_199_ids s, reh_199_ids p WHERE s.k = 'S' AND p.k = 'P'
UNION ALL
SELECT 'session-recap-photos', s.v || '/' || h.v || '/h.jpg'
  FROM reh_199_ids s, reh_199_ids h WHERE s.k = 'S' AND h.k = 'H';

-- ── C. AFTER 199: every hole closed, and nothing wider ────────────────────
DO $c$
DECLARE s text := (SELECT v FROM reh_199_ids WHERE k = 'S');
        h text := (SELECT v FROM reh_199_ids WHERE k = 'H');
        p text := (SELECT v FROM reh_199_ids WHERE k = 'P');
        o text := (SELECT v FROM reh_199_ids WHERE k = 'O');
        recap_rows text := format('SELECT count(*) FROM public.session_recap_photos WHERE session_id = %L', s);
        story_rows text := format('SELECT count(*) FROM public.session_stories WHERE session_id = %L', s);
        story_files text := format('SELECT count(*) FROM storage.objects WHERE bucket_id = ''session-stories'' AND name LIKE %L', s || '/%');
        recap_files text := format('SELECT count(*) FROM storage.objects WHERE bucket_id = ''session-recap-photos'' AND name LIKE %L', s || '/%');
        listing_files text := format('SELECT count(*) FROM storage.objects WHERE bucket_id = ''session-photos'' AND name LIKE %L', h || '/%');
BEGIN
  PERFORM pg_temp.reh_case('C1 outsider: no recap rows', 'O', 'rows=0', recap_rows);
  PERFORM pg_temp.reh_case('C2 pending participant: no recap rows', 'Q', 'rows=0', recap_rows);
  PERFORM pg_temp.reh_case('C3 anon: no recap rows', 'anon', 'rows=0', recap_rows);
  PERFORM pg_temp.reh_case('C4 anon: no story rows', 'anon', 'rows=0', story_rows);
  PERFORM pg_temp.reh_case('C5 outsider: no story rows', 'O', 'rows=0', story_rows);
  PERFORM pg_temp.reh_case('C6 anon: cannot list story files', 'anon', 'rows=0', story_files);
  PERFORM pg_temp.reh_case('C7 outsider: cannot read story files (so cannot sign them)', 'O', 'rows=0', story_files);
  PERFORM pg_temp.reh_case('C8 anon: cannot list the session-photos bucket', 'anon', 'rows=0', listing_files);
  PERFORM pg_temp.reh_case('C9 outsider: cannot list another user''s session photos', 'O', 'rows=0', listing_files);
  PERFORM pg_temp.reh_case('C10 outsider: cannot read recap files', 'O', 'rows=0', recap_files);
  PERFORM pg_temp.reh_case('C11 pending participant: cannot read recap files', 'Q', 'rows=0', recap_files);
  PERFORM pg_temp.reh_case('C12 outsider: cannot upload a recap file into the session', 'O', 'error=42501',
    format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''session-recap-photos'', %L) RETURNING 1) SELECT count(*) FROM x', s || '/' || o || '/o.jpg'));
  PERFORM pg_temp.reh_case('C13 participant: cannot upload into the host''s folder', 'P', 'error=42501',
    format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''session-recap-photos'', %L) RETURNING 1) SELECT count(*) FROM x', s || '/' || h || '/p2.jpg'));
  PERFORM pg_temp.reh_case('C14 a non-UUID folder is refused, not raised', 'P', 'error=42501',
    format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''session-recap-photos'', %L) RETURNING 1) SELECT count(*) FROM x', 'not-a-uuid/' || p || '/p3.jpg'));
  PERFORM pg_temp.reh_case('C15 outsider: cannot delete a participant''s recap file', 'O', 'rows=0',
    format('WITH x AS (DELETE FROM storage.objects WHERE bucket_id = ''session-recap-photos'' AND name = %L RETURNING 1) SELECT count(*) FROM x', s || '/' || p || '/p.jpg'));
  PERFORM pg_temp.reh_case('C16 participant: cannot delete the host''s recap file', 'P', 'rows=0',
    format('WITH x AS (DELETE FROM storage.objects WHERE bucket_id = ''session-recap-photos'' AND name = %L RETURNING 1) SELECT count(*) FROM x', s || '/' || h || '/h.jpg'));
  PERFORM pg_temp.reh_case('C17 outsider: cannot flag a recap row it cannot see', 'O', 'rows=0',
    format('WITH x AS (UPDATE public.session_recap_photos SET reported = true WHERE session_id = %L RETURNING 1) SELECT count(*) FROM x', s));
  -- The call's result must be USED. count(*) over a subquery whose column is
  -- unused lets the planner drop the call, so no EXECUTE check ever runs: the
  -- first local run of this arm returned rows=1 for anon for exactly that reason.
  PERFORM pg_temp.reh_case('C18 anon: cannot run the helper', 'anon', 'error=42501',
    format('SELECT public.can_view_session_media(%L)::int', s));
  PERFORM pg_temp.reh_case('C19 signed in: can run the helper (control for C18)', 'O', 'rows=0',
    format('SELECT public.can_view_session_media(%L)::int', s));

  -- ── S. Everyone who should still see it, does ───────────────────────────
  PERFORM pg_temp.reh_case('S1 host: both recap rows', 'H', 'rows=2', recap_rows);
  PERFORM pg_temp.reh_case('S2 confirmed participant: both recap rows', 'P', 'rows=2', recap_rows);
  PERFORM pg_temp.reh_case('S3 admin: both recap rows', 'A', 'rows=2', recap_rows);
  PERFORM pg_temp.reh_case('S4 confirmed participant: the two live stories, not the expired one', 'P', 'rows=2', story_rows);
  PERFORM pg_temp.reh_case('S5 host: the two live stories', 'H', 'rows=2', story_rows);
  PERFORM pg_temp.reh_case('S6 pending participant: only their own live story', 'Q', 'rows=1', story_rows);
  PERFORM pg_temp.reh_case('S7 confirmed participant: reads (so can sign) the story file', 'P', 'rows=1', story_files);
  PERFORM pg_temp.reh_case('S8 host: reads both recap files', 'H', 'rows=2', recap_files);
  PERFORM pg_temp.reh_case('S9 admin: reads both recap files', 'A', 'rows=2', recap_files);
  PERFORM pg_temp.reh_case('S10 owner: still lists their own session photos (remove() needs it)', 'H', 'rows=1', listing_files);
  PERFORM pg_temp.reh_case('S11 confirmed participant: uploads into their own folder', 'P', 'rows=1',
    format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''session-recap-photos'', %L) RETURNING 1) SELECT count(*) FROM x', s || '/' || p || '/new.jpg'));
  PERFORM pg_temp.reh_case('S12 host: uploads into their own folder', 'H', 'rows=1',
    format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''session-recap-photos'', %L) RETURNING 1) SELECT count(*) FROM x', s || '/' || h || '/new.jpg'));
  PERFORM pg_temp.reh_case('S13 participant: deletes their own recap file', 'P', 'rows=1',
    format('WITH x AS (DELETE FROM storage.objects WHERE bucket_id = ''session-recap-photos'' AND name = %L RETURNING 1) SELECT count(*) FROM x', s || '/' || p || '/p.jpg'));
  PERFORM pg_temp.reh_case('S14 host: deletes a participant''s recap file (moderation)', 'H', 'rows=1',
    format('WITH x AS (DELETE FROM storage.objects WHERE bucket_id = ''session-recap-photos'' AND name = %L RETURNING 1) SELECT count(*) FROM x', s || '/' || p || '/new.jpg'));
  PERFORM pg_temp.reh_case('S15 participant: can still flag a recap row (report flow)', 'P', 'rows=1',
    format('WITH x AS (UPDATE public.session_recap_photos SET reported = true WHERE session_id = %L AND user_id = %L RETURNING 1) SELECT count(*) FROM x', s, h));
END $c$;

INSERT INTO reh_199 (arm, verdict, detail)
SELECT 'S16 buckets: stories and recap private, listing photos still public',
       CASE WHEN (SELECT NOT public FROM storage.buckets WHERE id = 'session-stories')
             AND (SELECT NOT public FROM storage.buckets WHERE id = 'session-recap-photos')
             AND (SELECT public FROM storage.buckets WHERE id = 'session-photos')
            THEN 'PASS' ELSE 'FAIL' END,
       (SELECT string_agg(id || '=' || public, ' ' ORDER BY id) FROM storage.buckets
         WHERE id IN ('session-photos', 'session-stories', 'session-recap-photos'));

SELECT seq, arm, verdict, detail FROM reh_199 ORDER BY seq;
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS pass, count(*) FILTER (WHERE verdict <> 'PASS') AS not_pass FROM reh_199;

ROLLBACK;

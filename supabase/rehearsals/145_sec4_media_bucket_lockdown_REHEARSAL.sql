-- ============================================================================
-- 145_sec4_media_bucket_lockdown_REHEARSAL.sql  —  NOT A MIGRATION. DO NOT let
-- this file be auto-applied by any migration runner. Lives outside
-- supabase/migrations/.
--
-- Purpose: paste this whole file into the Supabase SQL Editor and Run once. It
-- opens a transaction, applies migration 145's body verbatim, PROVES the RLS
-- BEHAVIOR by attempting real writes/deletes under simulated identities, then
-- returns a SINGLE final result set and ROLLS BACK, leaving ZERO changes.
--
-- WHY behavioral checks: the whole risk in 145 is the foldername[] index
-- (uid at [2] for storefront-videos, [3] for community-posts). A policy with the
-- wrong index still "exists" and still has the right MIME list, so schema-shape
-- checks pass while every production upload is silently blocked. Only an actual
-- INSERT/DELETE/UPDATE attempt under a chosen auth.uid() catches that. This
-- rehearsal keeps the 9 schema checks (ord 1-9) AND adds 9 behavioral ones
-- (ord 10-18: writes, deletes, updates across both prefixes + the 057 banner).
--
-- HOW identity is simulated: SET LOCAL ROLE authenticated + set_config on
-- request.jwt.claims makes auth.uid() return the uuid we choose (the standard
-- Supabase pattern). A pg_temp function performs the attempt inside a
-- subtransaction and reports ALLOWED / DENIED / ERROR, then restores the role.
-- Successful test-writes are undone via a sentinel RAISE so no row persists;
-- everything rolls back regardless.
--
-- Read the ALL_CHECKS row: pass = true means every check passed.
-- Columns: check_name text | actual text | expected text | pass boolean.
--
-- NOTE ON EXECUTION: I have NOT run this against the database — my own access is
-- service-role REST, which BYPASSES RLS and cannot simulate the `authenticated`
-- role the way the SQL Editor can, so I cannot self-verify it. You must run it.
-- Two things to watch when you do:
--   * The behavioral checks raw-INSERT into storage.objects. If a storage
--     trigger or a NOT NULL column I did not account for interferes, that check
--     shows 'ERROR: ...' (not ALLOWED/DENIED) — visible, never a silent pass.
--   * Seeding the delete fixtures assumes the SQL Editor role bypasses RLS
--     (it does for the 143/144 rehearsals, which wrote to RLS-protected
--     public.sessions). If any behavioral check returns ERROR, the fallback
--     proof is a manual UI test: as one instructor, upload a storefront video
--     (should work) and confirm a second account cannot overwrite it.
-- ============================================================================

BEGIN;

-- ── MIGRATION 145 BODY (verbatim) ──────────────────────────────────────────
UPDATE storage.buckets
   SET file_size_limit    = 52428800,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
 WHERE id = 'media';

DROP POLICY IF EXISTS "Users can upload own media" ON storage.objects;
CREATE POLICY "Users can upload own media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;
CREATE POLICY "Users can update own media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
CREATE POLICY "Users can delete own media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      ((storage.foldername(name))[1] = 'storefront-videos' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR
      ((storage.foldername(name))[1] = 'community-posts'   AND (storage.foldername(name))[3] = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Anyone can read media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update media" ON storage.objects;

-- ── Fixtures for the DELETE + UPDATE checks (seeded as the editor role,
-- bypassing RLS). Owner is uid A. Distinct paths so the delete checks are
-- independent of UNION evaluation order; the update checks share one fixture
-- (a self-assign leaves the row intact, so owner+stranger UPDATE are order-safe).
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('media', 'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/del-owner.mp4',    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('media', 'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/del-stranger.mp4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('media', 'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/upd-fixture.mp4',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ── Behavioral helpers (temp; vanish on ROLLBACK) ──────────────────────────
-- try_write: attempt an INSERT as p_actor; undo on success via sentinel RAISE.
CREATE FUNCTION pg_temp.try_write(p_actor uuid, p_path text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE v_orig text := current_user; v_result text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('media', p_path, p_actor);
    RAISE EXCEPTION 'REHEARSAL_ALLOWED';   -- reached only if RLS permitted the row
  EXCEPTION
    WHEN insufficient_privilege THEN v_result := 'DENIED';   -- 42501 = RLS violation
    WHEN others THEN
      IF SQLERRM = 'REHEARSAL_ALLOWED' THEN v_result := 'ALLOWED';
      ELSE v_result := 'ERROR: ' || SQLERRM; END IF;
  END;
  EXECUTE format('SET LOCAL ROLE %I', v_orig);
  RETURN v_result;
END; $fn$;

-- try_delete: attempt a DELETE as p_actor; RLS filters non-owned rows silently
-- (0 rows = DENIED, >0 = ALLOWED), it does not raise.
CREATE FUNCTION pg_temp.try_delete(p_actor uuid, p_path text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE v_orig text := current_user; v_cnt int; v_result text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM storage.objects WHERE bucket_id = 'media' AND name = p_path;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_result := CASE WHEN v_cnt > 0 THEN 'ALLOWED' ELSE 'DENIED' END;
  EXCEPTION WHEN others THEN v_result := 'ERROR: ' || SQLERRM;
  END;
  EXECUTE format('SET LOCAL ROLE %I', v_orig);
  RETURN v_result;
END; $fn$;

-- try_update: attempt a harmless self-assign UPDATE as p_actor. This is the
-- upsert-replacement path (VideoUploadSection uploads with upsert:true, so a
-- re-record is an UPDATE). Like DELETE, an RLS-filtered UPDATE matches 0 rows
-- rather than raising, so measure via ROW_COUNT.
CREATE FUNCTION pg_temp.try_update(p_actor uuid, p_path text) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE v_orig text := current_user; v_cnt int; v_result text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE storage.objects SET name = name WHERE bucket_id = 'media' AND name = p_path;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_result := CASE WHEN v_cnt > 0 THEN 'ALLOWED' ELSE 'DENIED' END;
  EXCEPTION WHEN others THEN v_result := 'ERROR: ' || SQLERRM;
  END;
  EXECUTE format('SET LOCAL ROLE %I', v_orig);
  RETURN v_result;
END; $fn$;

-- ── Run behavioral checks, recording verdicts (each function restores the role
--    before returning, so these INSERTs run as the editor role) ──────────────
CREATE TEMP TABLE rehearsal_results (ord int, check_name text, actual text, expected text, pass boolean) ON COMMIT DROP;

INSERT INTO rehearsal_results
SELECT 10, 'owner_can_write_video', v, 'ALLOWED', v = 'ALLOWED' FROM (SELECT pg_temp.try_write(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/w-owner.mp4') AS v) t;

INSERT INTO rehearsal_results
SELECT 11, 'stranger_cannot_write_video', v, 'DENIED', v = 'DENIED' FROM (SELECT pg_temp.try_write(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/w-stranger.mp4') AS v) t;

INSERT INTO rehearsal_results
SELECT 12, 'owner_can_write_community', v, 'ALLOWED', v = 'ALLOWED' FROM (SELECT pg_temp.try_write(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'community-posts/cccccccc-cccc-cccc-cccc-cccccccccccc/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/w-owner.jpg') AS v) t;

INSERT INTO rehearsal_results
SELECT 13, 'stranger_cannot_write_community', v, 'DENIED', v = 'DENIED' FROM (SELECT pg_temp.try_write(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'community-posts/cccccccc-cccc-cccc-cccc-cccccccccccc/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/w-stranger.jpg') AS v) t;

INSERT INTO rehearsal_results
SELECT 14, 'stranger_cannot_delete_video', v, 'DENIED', v = 'DENIED' FROM (SELECT pg_temp.try_delete(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/del-stranger.mp4') AS v) t;

INSERT INTO rehearsal_results
SELECT 15, 'owner_can_delete_video', v, 'ALLOWED', v = 'ALLOWED' FROM (SELECT pg_temp.try_delete(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/del-owner.mp4') AS v) t;

-- Proves migration 057's banner policies still work (uid at foldername[2]).
INSERT INTO rehearsal_results
SELECT 16, 'owner_can_write_banner_057', v, 'ALLOWED', v = 'ALLOWED' FROM (SELECT pg_temp.try_write(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'storefront-banners/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/w-banner.jpg') AS v) t;

-- UPDATE path (upsert replacement / re-record). Wrong index here would let the
-- FIRST upload succeed but silently block every re-upload.
INSERT INTO rehearsal_results
SELECT 17, 'owner_can_update_video', v, 'ALLOWED', v = 'ALLOWED' FROM (SELECT pg_temp.try_update(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/upd-fixture.mp4') AS v) t;

INSERT INTO rehearsal_results
SELECT 18, 'stranger_cannot_update_video', v, 'DENIED', v = 'DENIED' FROM (SELECT pg_temp.try_update(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'storefront-videos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/upd-fixture.mp4') AS v) t;

RESET ROLE;   -- ensure the summary query below runs as the editor role (postgres)

-- ── SINGLE FINAL RESULT SET: 9 schema checks + 9 behavioral + ALL_CHECKS ────
WITH b AS (
  SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'media'
),
pol AS (
  SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
),
sc(ord, check_name, actual, expected, pass) AS (
  SELECT 1, 'bucket_size_limit'::text,
    COALESCE((SELECT file_size_limit FROM b)::text, '(null)'), '52428800'::text,
    COALESCE((SELECT file_size_limit FROM b) = 52428800, false)
  UNION ALL SELECT 2, 'bucket_mime_allowlist'::text,
    COALESCE(array_to_string((SELECT allowed_mime_types FROM b), ','), '(null)'),
    'image/jpeg,image/png,image/webp,video/mp4'::text,
    COALESCE((SELECT allowed_mime_types FROM b) = ARRAY['image/jpeg','image/png','image/webp','video/mp4'], false)
  UNION ALL SELECT 3, 'policy_upload_own_media_added'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can upload own media'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can upload own media')
  UNION ALL SELECT 4, 'policy_update_own_media_added'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can update own media'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can update own media')
  UNION ALL SELECT 5, 'policy_delete_own_media_added'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can delete own media'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can delete own media')
  UNION ALL SELECT 6, 'broad_read_policy_dropped'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Anyone can read media'))::text, 'false'::text,
    NOT EXISTS (SELECT 1 FROM pol WHERE policyname = 'Anyone can read media')
  UNION ALL SELECT 7, 'broad_upload_policy_dropped'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can upload media'))::text, 'false'::text,
    NOT EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can upload media')
  UNION ALL SELECT 8, 'broad_update_policy_dropped'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can update media'))::text, 'false'::text,
    NOT EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can update media')
  UNION ALL SELECT 9, 'storefront_banner_057_policies_intact'::text,
    (SELECT count(*) FROM pol WHERE policyname IN (
      'Storefront banners are publicly readable','Instructors can upload own storefront banner',
      'Instructors can update own storefront banner','Instructors can delete own storefront banner'))::text,
    '4'::text,
    (SELECT count(*) FROM pol WHERE policyname IN (
      'Storefront banners are publicly readable','Instructors can upload own storefront banner',
      'Instructors can update own storefront banner','Instructors can delete own storefront banner')) = 4
),
allrows AS (
  SELECT ord, check_name, actual, expected, pass FROM sc
  UNION ALL
  SELECT ord, check_name, actual, expected, pass FROM rehearsal_results
)
SELECT check_name, actual, expected, pass
FROM (
  SELECT ord, check_name, actual, expected, pass FROM allrows
  UNION ALL
  SELECT 99, 'ALL_CHECKS'::text,
         (count(*) FILTER (WHERE pass))::text || ' of ' || count(*)::text || ' passed',
         'all true'::text, bool_and(pass)
    FROM allrows
) q
ORDER BY q.ord;

ROLLBACK;

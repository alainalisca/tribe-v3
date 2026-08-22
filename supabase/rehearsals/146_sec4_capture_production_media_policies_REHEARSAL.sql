-- ============================================================================
-- 146_sec4_capture_production_media_policies_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 146's body verbatim, returns a SINGLE final result set, and ROLLS BACK —
-- ZERO changes persist.
--
-- SCOPE OF PROOF — READ THIS, IT IS NOT A SILENT SUBSTITUTION:
-- These are SCHEMA-STATE checks only (bucket limits + policy presence/absence).
-- They deliberately do NOT attempt behavioral write tests, because Supabase
-- blocks direct INSERT/UPDATE/DELETE on storage.objects from SQL (established in
-- the 145 rehearsal: DELETE raises "Direct deletion ... not allowed", UPDATE is
-- silently suppressed). The real behavioral proof for these policies is the
-- PRODUCTION behavior already observed: uploads work with the broad INSERT +
-- authenticated SELECT restored, and the owner-scoped INSERT does not match.
-- That mystery is parked (T-SEC4-B); this rehearsal only confirms the captured
-- STATE matches what the migration intends.
--
-- Read the ALL_CHECKS row: pass = true means the captured state is correct.
-- Columns: check_name text | actual text | expected text | pass boolean.
-- ============================================================================

BEGIN;

-- ── MIGRATION 146 BODY (verbatim) ──────────────────────────────────────────
UPDATE storage.buckets
   SET file_size_limit    = 52428800,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
 WHERE id = 'media';

DROP POLICY IF EXISTS "Anyone can read media" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated can read media" ON storage.objects;
CREATE POLICY "Authenticated can read media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
CREATE POLICY "Authenticated users can upload media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "Authenticated users can update media" ON storage.objects;

-- ── SINGLE FINAL RESULT SET ────────────────────────────────────────────────
WITH b AS (
  SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'media'
),
pol AS (
  SELECT policyname, cmd, roles::text AS roles
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
),
sc(ord, check_name, actual, expected, pass) AS (
  SELECT 1, 'bucket_size_limit'::text,
    COALESCE((SELECT file_size_limit FROM b)::text, '(null)'), '52428800'::text,
    COALESCE((SELECT file_size_limit FROM b) = 52428800, false)
  UNION ALL SELECT 2, 'bucket_mime_allowlist'::text,
    COALESCE(array_to_string((SELECT allowed_mime_types FROM b), ','), '(null)'),
    'image/jpeg,image/png,image/webp,video/mp4'::text,
    COALESCE((SELECT allowed_mime_types FROM b) = ARRAY['image/jpeg','image/png','image/webp','video/mp4'], false)
  UNION ALL SELECT 3, 'broad_public_read_dropped'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Anyone can read media'))::text, 'false'::text,
    NOT EXISTS (SELECT 1 FROM pol WHERE policyname = 'Anyone can read media')
  UNION ALL SELECT 4, 'authenticated_read_present'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated can read media' AND cmd = 'SELECT'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated can read media' AND cmd = 'SELECT')
  UNION ALL SELECT 5, 'broad_upload_present'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can upload media' AND cmd = 'INSERT'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can upload media' AND cmd = 'INSERT')
  UNION ALL SELECT 6, 'broad_update_absent'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can update media'))::text, 'false'::text,
    NOT EXISTS (SELECT 1 FROM pol WHERE policyname = 'Authenticated users can update media')
  UNION ALL SELECT 7, 'owner_delete_145_intact'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can delete own media' AND cmd = 'DELETE'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can delete own media' AND cmd = 'DELETE')
)
SELECT check_name, actual, expected, pass
FROM (
  SELECT ord, check_name, actual, expected, pass FROM sc
  UNION ALL
  SELECT 99, 'ALL_CHECKS'::text,
         (count(*) FILTER (WHERE pass))::text || ' of ' || count(*)::text || ' passed',
         'all true'::text, bool_and(pass)
    FROM sc
) q
ORDER BY q.ord;

ROLLBACK;

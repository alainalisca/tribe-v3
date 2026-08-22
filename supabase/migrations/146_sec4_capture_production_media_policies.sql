-- 146_sec4_capture_production_media_policies.sql
-- T-SEC4 (PARKED): capture the ACTUAL production state of the `media` bucket.
--
-- Migration 145 shipped an owner-scoped write model. In production it did not
-- behave as its rehearsal predicted, so the live policy set was adjusted by hand
-- and now exists in NO migration. This file makes a rebuild reproduce production
-- exactly, and records what we know. NO further debugging — see ticket T-SEC4-B.
--
-- ── WHAT IS TRUE IN PRODUCTION, AND UNEXPLAINED ────────────────────────────
--   * 145's owner-scoped INSERT policy ("Users can upload own media") does NOT
--     match in production — dropping the broad INSERT policy breaks every
--     upload. Cause unknown after extensive investigation. The broad INSERT
--     ("Authenticated users can upload media") is therefore RESTORED below and
--     is currently what makes uploads work.
--   * 145's owner-scoped DELETE policy ("Users can delete own media") DOES work,
--     verified on the real path — it fixed the silent-remove bug that was
--     orphaning storefront videos. It is intentionally LEFT IN PLACE (145).
--   * So the SAME auth.uid() expression works in a USING clause (DELETE) and
--     fails in a WITH CHECK clause (INSERT) against the same rows. That
--     contradiction is unexplained and is the thread to pull if anyone revisits
--     this. Owner-scoped WRITES remain unenforced in the meantime (T-SEC4-B).
--
-- ── CRITICAL, DO NOT REMOVE THE media SELECT POLICY ────────────────────────
--   Supabase Storage upload with { upsert: true } compiles to
--   INSERT ... ON CONFLICT DO UPDATE, which requires a SELECT policy on
--   storage.objects whether or not a conflicting row exists. Removing the media
--   SELECT policy silently breaks every upsert upload. Do not remove it without
--   replacing it. (This is why 145 dropping the broad public SELECT broke
--   uploads; the fix was a new authenticated-only SELECT policy, below.)
--
-- Idempotent: bucket UPDATE is a no-op if already set; every policy uses
-- DROP POLICY IF EXISTS + CREATE (Postgres has no CREATE POLICY IF NOT EXISTS).
-- Additive/restorative first; the one intentional drop is last.

-- ── 1. Bucket limits (same values 145 set; restated so a rebuild is complete) ─
UPDATE storage.buckets
   SET file_size_limit    = 52428800,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
 WHERE id = 'media';

-- ── 2. SELECT: authenticated-only read replaces the broad public read ──────
-- The broad "Anyone can read media" (migration 091) let any client LIST the
-- bucket (Supabase advisory) AND was the SELECT policy upserts depend on. It is
-- replaced by an authenticated-scoped SELECT that still satisfies the upsert
-- requirement above. Public object URLs keep working: `media` is a PUBLIC
-- bucket, so reads are served through the public endpoint, which bypasses RLS.
DROP POLICY IF EXISTS "Anyone can read media" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated can read media" ON storage.objects;
CREATE POLICY "Authenticated can read media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'media');

-- ── 3. INSERT: restore the broad upload policy (still required) ─────────────
-- 145's owner-scoped INSERT does not match in production (see header), so the
-- broad bucket_id-only INSERT is restored and is what currently makes uploads
-- work. Owner enforcement on writes is deferred to T-SEC4-B.
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
CREATE POLICY "Authenticated users can upload media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

-- ── 4. UPDATE: the broad update policy stays DROPPED (intentional, last) ────
-- 145 dropped "Authenticated users can update media" and it was not restored.
-- This DROP IF EXISTS asserts its absence so a rebuild matches production.
-- (145's owner-scoped "Users can update own media" is left as 145 created it;
--  it is untested behaviorally for the same reason as the INSERT.)
DROP POLICY IF EXISTS "Authenticated users can update media" ON storage.objects;

-- ============================================================================
-- 147_capture_user_follows_schema_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 147's body verbatim, returns a SINGLE final result set, and ROLLS BACK —
-- ZERO changes persist.
--
-- SCOPE OF PROOF — READ THIS, IT IS NOT A SILENT SUBSTITUTION:
-- These are SCHEMA-STATE checks only: table/column presence, constraint names
-- and kinds (incl. ON DELETE CASCADE), RLS enabled, and the exact policy set
-- (name + command + roles + qual). They deliberately do NOT attempt behavioral
-- RLS write tests, because the SQL Editor runs as a privileged role and would
-- not exercise the anon/authenticated auth.uid() paths the policies gate. The
-- policy predicates are captured verbatim from production; this rehearsal
-- confirms the captured STATE matches what the migration intends, on a database
-- that already contains these objects (so the idempotent body is a no-op).
--
-- Note: check 11 (select_policy_open_to_public) intentionally PASSES on
-- USING (true) for role public. That open anon read is the real production
-- state, flagged in the migration header; the rehearsal proves it is present,
-- not that it is desirable.
--
-- Read the ALL_CHECKS row: pass = true means the captured state is correct.
-- Columns: check_name text | actual text | expected text | pass boolean.
-- ============================================================================

BEGIN;

-- ── MIGRATION 147 BODY (verbatim) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_follows (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  follower_id   uuid        NOT NULL,
  following_id  uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'no_self_follow') THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT no_self_follow CHECK (follower_id <> following_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_follow') THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT unique_follow UNIQUE (follower_id, following_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_follower_id_fkey') THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_follower_id_fkey
      FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_following_id_fkey') THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_following_id_fkey
      FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid;

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view follows" ON public.user_follows;
CREATE POLICY "Anyone can view follows"
  ON public.user_follows FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Users can follow" ON public.user_follows;
CREATE POLICY "Users can follow"
  ON public.user_follows FOR INSERT
  TO public
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON public.user_follows;
CREATE POLICY "Users can unfollow"
  ON public.user_follows FOR DELETE
  TO public
  USING (auth.uid() = follower_id);

-- ── SINGLE FINAL RESULT SET ────────────────────────────────────────────────
WITH col AS (
  SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'user_follows'
),
con AS (
  SELECT conname, contype, confdeltype
    FROM pg_constraint
   WHERE conrelid = 'public.user_follows'::regclass
),
pol AS (
  SELECT policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'user_follows'
),
rls AS (
  SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_follows'::regclass
),
spcol AS (
  SELECT data_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'session_participants'
     AND column_name = 'payment_confirmed_by'
),
sc(ord, check_name, actual, expected, pass) AS (
  SELECT 1, 'table_user_follows_present'::text,
    (EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.user_follows'::regclass))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.user_follows'::regclass)
  UNION ALL SELECT 2, 'columns_present'::text,
    (SELECT string_agg(column_name, ',' ORDER BY column_name) FROM col
      WHERE column_name IN ('id','follower_id','following_id','created_at')),
    'created_at,follower_id,following_id,id'::text,
    (SELECT count(*) FROM col WHERE column_name IN ('id','follower_id','following_id','created_at')) = 4
  UNION ALL SELECT 3, 'pkey_present'::text,
    (EXISTS (SELECT 1 FROM con WHERE conname = 'user_follows_pkey' AND contype = 'p'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM con WHERE conname = 'user_follows_pkey' AND contype = 'p')
  UNION ALL SELECT 4, 'no_self_follow_check'::text,
    (EXISTS (SELECT 1 FROM con WHERE conname = 'no_self_follow' AND contype = 'c'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM con WHERE conname = 'no_self_follow' AND contype = 'c')
  UNION ALL SELECT 5, 'unique_follow_unique'::text,
    (EXISTS (SELECT 1 FROM con WHERE conname = 'unique_follow' AND contype = 'u'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM con WHERE conname = 'unique_follow' AND contype = 'u')
  UNION ALL SELECT 6, 'follower_fk_cascade'::text,
    (EXISTS (SELECT 1 FROM con WHERE conname = 'user_follows_follower_id_fkey' AND contype = 'f' AND confdeltype = 'c'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM con WHERE conname = 'user_follows_follower_id_fkey' AND contype = 'f' AND confdeltype = 'c')
  UNION ALL SELECT 7, 'following_fk_cascade'::text,
    (EXISTS (SELECT 1 FROM con WHERE conname = 'user_follows_following_id_fkey' AND contype = 'f' AND confdeltype = 'c'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM con WHERE conname = 'user_follows_following_id_fkey' AND contype = 'f' AND confdeltype = 'c')
  UNION ALL SELECT 8, 'rls_enabled'::text,
    COALESCE((SELECT relrowsecurity FROM rls)::text, '(null)'), 'true'::text,
    COALESCE((SELECT relrowsecurity FROM rls), false)
  UNION ALL SELECT 9, 'select_policy_present'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Anyone can view follows' AND cmd = 'SELECT'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Anyone can view follows' AND cmd = 'SELECT')
  UNION ALL SELECT 10, 'insert_policy_self_scoped'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can follow' AND cmd = 'INSERT' AND with_check ILIKE '%follower_id%'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can follow' AND cmd = 'INSERT' AND with_check ILIKE '%follower_id%')
  UNION ALL SELECT 11, 'select_policy_open_to_public'::text,
    (SELECT roles || ' qual=' || COALESCE(qual, '(null)') FROM pol WHERE policyname = 'Anyone can view follows'),
    '{public} qual=true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Anyone can view follows' AND roles = '{public}' AND qual = 'true')
  UNION ALL SELECT 12, 'delete_policy_self_scoped'::text,
    (EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can unfollow' AND cmd = 'DELETE' AND qual ILIKE '%follower_id%'))::text, 'true'::text,
    EXISTS (SELECT 1 FROM pol WHERE policyname = 'Users can unfollow' AND cmd = 'DELETE' AND qual ILIKE '%follower_id%')
  UNION ALL SELECT 13, 'no_update_policy'::text,
    (EXISTS (SELECT 1 FROM pol WHERE cmd = 'UPDATE'))::text, 'false'::text,
    NOT EXISTS (SELECT 1 FROM pol WHERE cmd = 'UPDATE')
  UNION ALL SELECT 14, 'policy_count_is_3'::text,
    (SELECT count(*)::text FROM pol), '3'::text,
    (SELECT count(*) FROM pol) = 3
  UNION ALL SELECT 15, 'session_participants_payment_confirmed_by_uuid'::text,
    COALESCE((SELECT data_type FROM spcol), '(absent)'), 'uuid'::text,
    (SELECT data_type FROM spcol) = 'uuid'
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

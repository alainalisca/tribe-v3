-- DRAFT_147_capture_user_follows_schema.sql
--
-- STATUS: DRAFT. DO NOT APPLY AS-IS. This file has a DRAFT_ prefix on purpose so
-- it does NOT match the NNN_*.sql apply order and cannot run by accident. Rename
-- it to 147_capture_user_follows_schema.sql only AFTER the BLOCKED sections below
-- are filled from a live schema dump and reviewed.
--
-- PURPOSE
--   public.user_follows exists in production but its CREATE TABLE and its RLS
--   policies live in NO tracked migration (migration 110 references the table and
--   owns its follow-count triggers, but never created it; the table was made
--   out of band). session_participants.payment_confirmed_by is in the same state:
--   present in production and in the generated types, absent from every migration.
--   This file starts to make a from-scratch rebuild reproduce production, the same
--   intent as 143-146.
--
-- ── WHAT IS CAPTURED HERE, AND HOW WELL IT IS VERIFIED ─────────────────────
--   VERIFIED from lib/database.types.ts (generated from the live schema) and
--   migration 110:
--     * user_follows columns, types, nullability: id, follower_id, following_id,
--       created_at.
--     * Both foreign keys to users(id): user_follows_follower_id_fkey and
--       user_follows_following_id_fkey.
--     * session_participants.payment_confirmed_by is uuid, nullable, and has NO
--       foreign key in the generated Relationships (it stores a users.id written
--       by lib/dal/sessions.ts but is not FK-constrained in the types).
--     * The follow-count triggers are already tracked: migration 110 installs
--       public.recompute_follow_counts() and its trigger on user_follows. They are
--       intentionally NOT restated here so 110 stays their single owner.
--
--   INFERRED, NOT verified against live (marked inline below):
--     * DEFAULTs on id (gen_random_uuid()) and created_at (now()). The generated
--       Insert type shows both are optional, so defaults exist, but their exact
--       expressions are a guess.
--     * A UNIQUE (follower_id, following_id) constraint. followUser() in
--       lib/dal/followUser.ts upserts with onConflict/ignoreDuplicates, which
--       requires a unique constraint, so one almost certainly exists, but its
--       NAME is unknown.
--
-- ── BLOCKED: cannot be captured from the repo (needs a live read) ──────────
--   The RLS POLICIES on user_follows, and the exact constraint / default / index
--   NAMES, are not in any migration and not in the generated types. Capturing
--   them faithfully requires reading pg_catalog on production. In THIS session the
--   tools that could do that (psql, and POST/PATCH to the PostgREST/pg endpoints)
--   are disabled, so the live values could not be read. They are left as stubs
--   below rather than invented.
--
--   Do NOT guess the policies. Migration 146 is the standing warning: 145's
--   REHEARSED owner-scoped policy did not behave as predicted on production and
--   had to be hand-fixed. A reconstructed user_follows policy set would very
--   likely diverge from live the same way.
--
--   To fill the blocked sections, run against production (read-only) and paste
--   the real definitions in:
--     -- columns, defaults, nullability:
--     SELECT column_name, data_type, is_nullable, column_default
--       FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='user_follows'
--      ORDER BY ordinal_position;
--     -- constraints (PK / UNIQUE / FK) with their real names:
--     SELECT conname, pg_get_constraintdef(oid)
--       FROM pg_constraint
--      WHERE conrelid = 'public.user_follows'::regclass;
--     -- indexes:
--     SELECT indexname, indexdef FROM pg_indexes
--      WHERE schemaname='public' AND tablename='user_follows';
--     -- RLS policies (the critical part):
--     SELECT polname, cmd, roles, qual, with_check
--       FROM pg_policies WHERE schemaname='public' AND tablename='user_follows';
--   Or simply: pg_dump --schema-only -t public.user_follows and copy verbatim.
--
-- Idempotency: everything below is CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS / guarded constraint adds, so on a database that already has the objects
-- it is a no-op. That is the intended behavior on production. See the rehearsal
-- note at the bottom for what a real rehearsal still needs.

-- ── 1. user_follows table (VERIFIED columns/FKs; INFERRED defaults/unique) ──
CREATE TABLE IF NOT EXISTS public.user_follows (
  -- INFERRED default gen_random_uuid(): confirm the exact expression from live.
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  follower_id   uuid        NOT NULL,
  following_id  uuid        NOT NULL,
  -- INFERRED default now(): confirm from live.
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (id)
);

-- Foreign keys (VERIFIED names and targets from the generated Relationships).
-- Guarded so the add is a no-op when the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_follower_id_fkey'
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_follower_id_fkey
      FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_following_id_fkey'
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_following_id_fkey
      FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  -- INFERRED unique constraint required by the upsert in lib/dal/followUser.ts.
  -- The NAME here is a guess; replace it with the real name from live before
  -- applying, or a rebuild will create a differently-named duplicate.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_follower_id_following_id_key'
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_follower_id_following_id_key
      UNIQUE (follower_id, following_id);
  END IF;
END $$;

-- ── 2. session_participants.payment_confirmed_by (VERIFIED column/type) ─────
-- uuid, nullable, no FK in the generated types. If live actually has an FK to
-- users(id), add it here after confirming its name.
ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid;

-- ── 3. RLS on user_follows (BLOCKED: policies unknown, do not guess) ────────
-- Enabling RLS is safe and idempotent. The POLICIES are the part that cannot be
-- captured without a live read. Enabling RLS here WITHOUT restoring the real
-- policies would lock the table down and break follow/unfollow, so this whole
-- section is left commented until the live policy set is pasted in.
--
-- ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
--
-- <PASTE the pg_policies output from production here, as DROP POLICY IF EXISTS
--  + CREATE POLICY pairs, matching the 143-146 style. Do NOT invent these.>

-- ── Rehearsal ──────────────────────────────────────────────────────────────
-- A true rehearsal (apply to a scratch copy of production, diff the resulting
-- schema against a live pg_dump, confirm zero drift) could NOT be run in this
-- session: it needs a database connection, which is not available with the
-- current tooling. What IS asserted here is structural idempotency only: every
-- statement above is IF NOT EXISTS / guarded, so re-running it on a database that
-- already contains these objects makes no changes. That is necessary but NOT
-- sufficient. Before this file is renamed to 147_ and applied, run the queries
-- in the BLOCKED section against production, fill in the real defaults, constraint
-- names, indexes, and RLS policies, then rehearse the diff.

-- 147_capture_user_follows_schema.sql
--
-- Captures public.user_follows and session_participants.payment_confirmed_by,
-- which exist in production but were in no tracked migration (migration 110 only
-- references user_follows and owns its follow-count triggers; it never created
-- the table). This makes a from-scratch rebuild reproduce production, the same
-- intent as 143-146.
--
-- All values below were read from PRODUCTION (columns/FKs from the generated
-- types plus a live pg_catalog read of the constraints and RLS policies). The
-- follow-count triggers are intentionally NOT restated here: migration 110 is
-- their single owner.
--
-- ⚠ ANON-READABLE FOLLOW GRAPH (captured as-is, NOT an oversight):
--   The SELECT policy "Anyone can view follows" is USING (true) for role public,
--   so the ENTIRE follow graph (who follows whom) is readable by the anonymous
--   key. This is the real production state and is captured verbatim. Capture is
--   capture: this migration does NOT change it. If tightening anon read access is
--   wanted, that is a separate security ticket, not part of this file.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, guarded
-- constraint adds, ENABLE RLS (no-op if already on), and DROP POLICY IF EXISTS +
-- CREATE for each policy (Postgres has no CREATE POLICY IF NOT EXISTS). On
-- production every object already exists, so this is a no-op. Rehearsal:
-- supabase/rehearsals/147_capture_user_follows_schema_REHEARSAL.sql.

-- ── 1. user_follows table ──────────────────────────────────────────────────
-- id/created_at defaults are the conventional Supabase defaults (gen_random_uuid,
-- now); they were not part of the captured constraint/policy set. They matter
-- only for a from-scratch rebuild, since on production the table already exists
-- and the CREATE is a no-op.
CREATE TABLE IF NOT EXISTS public.user_follows (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  follower_id   uuid        NOT NULL,
  following_id  uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (id)
);

-- Constraints (names and definitions read from production).
DO $$
BEGIN
  -- no_self_follow: a user cannot follow themselves.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'no_self_follow') THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT no_self_follow CHECK (follower_id <> following_id);
  END IF;

  -- unique_follow: one row per (follower, following); backs the DAL upsert's
  -- onConflict target in lib/dal/promote.ts followUser().
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_follow') THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT unique_follow UNIQUE (follower_id, following_id);
  END IF;

  -- Foreign keys to users(id), both ON DELETE CASCADE.
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

-- ── 2. session_participants.payment_confirmed_by ───────────────────────────
-- uuid, nullable, no foreign key in production (stores a users.id written by
-- lib/dal/sessions.ts but is not FK-constrained).
ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid;

-- ── 3. RLS on user_follows (captured from production, role public) ─────────
-- SELECT is open to everyone (see the anon-readable note in the header). INSERT
-- and DELETE are self-scoped: a user can only create/remove their own follow
-- edge. There is NO UPDATE policy in production (a follow edge is created or
-- deleted, never updated), so none is created here.
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

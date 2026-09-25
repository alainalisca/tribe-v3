-- 191_close_open_community_comments_read.sql
--
-- Comments on posts in PRIVATE communities are readable by anyone, including
-- anon, because a policy that is literally `USING (true)` sits next to the
-- scoped one. RLS policies are OR'd: the open one satisfies every read, so the
-- scoped one never gets a say. This drops the open one. Nothing is added.
--
-- NUMBER: 191 was the next free number on origin/main at 64873b3. Re-check
-- against origin/main immediately before merge; a number belongs to whichever
-- branch merges first.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HOW IT GOT HERE, AND WHY THE REPO SAYS IT WAS ALREADY FIXED
-- ═══════════════════════════════════════════════════════════════════════════
--
--   011 created "Users can read comments on visible posts" USING (true).
--   013 (013_fix_social_rls_policies, one of the two duplicate-013 files from
--       the 2026-04-19 bulk import) dropped it by that exact name and added a
--       scoped replacement. Production has neither the drop nor the
--       replacement, so 013 did not run there.
--   048 added the correct scoped policy, community_post_comments_select, but
--       its DROP targeted "Anyone can view comments", a name that never
--       existed, so the open policy survived and cancelled 048's work.
--
-- Read from production on 2026-09-25 (pg_policies), not inferred from the
-- files above: the table has exactly two SELECT policies, the open one and
-- community_post_comments_select. anon and authenticated both hold SELECT.
--
-- IMPACT TODAY: 0 comments exist in the whole table, and 3 private
-- communities exist. The hole has leaked nothing yet. It would have leaked the
-- first comment anyone wrote in a private community.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT STAYS THE SAME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Comments on PUBLIC communities stay readable by anon and everyone else,
-- through community_post_comments_select. Members of a private community keep
-- reading its comments through is_community_member(). The table grant is not
-- touched. INSERT and DELETE policies are not touched.
--
-- The same production scan found other tables with a `true` SELECT policy
-- beside a narrower one: sessions, users, instructor_posts, popular_routes,
-- post_comments, session_recap_photos, storefront_media. Each of those is
-- public or authenticated-wide by recorded design (138/140 for sessions, the
-- 066/067 column grants for users, 048's "truly public" list for the rest), so
-- none of them is changed here.

-- ── 0. Pre-flight ──────────────────────────────────────────────────────────
--
-- Dropping the open policy is only safe if the scoped one is there to take
-- over. Without it, EVERY comment read would start failing, public ones
-- included. So the scoped policy is asserted first, by its content, and the
-- migration aborts before touching anything if it is missing or changed.
DO $pre$
DECLARE
  v_scoped text;
  v_open   text;
BEGIN
  SELECT regexp_replace(qual, '\s+', ' ', 'g') INTO v_scoped
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'community_post_comments'
     AND policyname = 'community_post_comments_select' AND cmd = 'SELECT';

  IF v_scoped IS NULL THEN
    RAISE EXCEPTION
      '191 ABORTED: community_post_comments_select is missing. Dropping the open policy now would make every comment unreadable.';
  END IF;

  IF position('is_private = false' IN v_scoped) = 0
     OR position('is_community_member' IN v_scoped) = 0 THEN
    RAISE EXCEPTION
      '191 ABORTED: community_post_comments_select no longer has the public-or-member shape read on 2026-09-25. Live: %', v_scoped;
  END IF;

  SELECT regexp_replace(qual, '\s+', '', 'g') INTO v_open
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'community_post_comments'
     AND policyname = 'Users can read comments on visible posts';

  -- Absent is fine (a re-run). Present with anything other than `true` means
  -- someone scoped it since 2026-09-25, and dropping it would discard that.
  IF v_open IS NOT NULL AND v_open NOT IN ('true', '(true)') THEN
    RAISE EXCEPTION
      '191 ABORTED: "Users can read comments on visible posts" is no longer USING (true). Live: %', v_open;
  END IF;
END $pre$;

-- ── 1. The fix ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read comments on visible posts" ON public.community_post_comments;

-- ── 2. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n bigint;
BEGIN
  -- The arm that matters: no SELECT (or ALL) policy on this table is open.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'community_post_comments'
     AND cmd IN ('SELECT', 'ALL')
     AND regexp_replace(coalesce(qual, ''), '\s+', '', 'g') IN ('true', '(true)');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '191 ABORTED: % open SELECT policy(ies) still on community_post_comments.', v_n;
  END IF;

  -- And the other direction: the scoped policy is the ONE read path left.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'community_post_comments'
     AND cmd IN ('SELECT', 'ALL');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '191 ABORTED: expected exactly 1 read policy on community_post_comments, found %.', v_n;
  END IF;

  -- Public comments must stay readable to signed-out visitors.
  IF NOT has_table_privilege('anon', 'public.community_post_comments', 'SELECT') THEN
    RAISE EXCEPTION '191 ABORTED: anon lost SELECT on community_post_comments; public comments would stop rendering.';
  END IF;

  RAISE NOTICE '191: open comments read policy dropped; community_post_comments_select is the only read path.';
END $$;

-- ── 3. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('191_close_open_community_comments_read', 'dropped USING(true) SELECT policy shadowing community_post_comments_select')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'community_post_comments'
      AND cmd IN ('SELECT', 'ALL')
      AND regexp_replace(coalesce(qual, ''), '\s+', '', 'g') IN ('true', '(true)')) = 0 AS no_open_read_policy_ok,
  EXISTS (SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'community_post_comments'
             AND policyname = 'community_post_comments_select')                        AS scoped_policy_present_ok,
  has_table_privilege('anon', 'public.community_post_comments', 'SELECT')               AS anon_can_read_public_ok,
  (SELECT count(*) FROM public.community_post_comments)                                  AS comments_total,
  EXISTS (SELECT 1 FROM public.migrations_applied
           WHERE migration = '191_close_open_community_comments_read')                  AS recorded_ok;

-- 048_community_rls_tightening.sql
-- SEC-01: tighten USING(true) read policies on tables that tie back to
-- potentially-private parent records. After classification against every
-- migration that contained a blanket SELECT policy, only TWO tables needed
-- scoping — the rest are genuinely public by design (see classification
-- comment at the bottom of this file).
--
-- Classification:
--
--   Needs scoping (covered by this migration):
--     community_post_comments   — comments on private-community posts leak
--     community_post_likes      — likes on private-community posts leak
--     challenge_participants    — participants of private challenges leak
--
--   Truly public (no change):
--     post_comments             — comments on instructor_posts, which are a
--                                 public feed by product design
--     external_events           — city-wide fitness events directory
--     popular_venues            — city-wide venue directory
--     strava_routes             — city-wide route library
--     popular_routes            — city-wide route library (migration 016)
--     area_first_sessions       — cold-start/marketing showcase
--
-- We also add a helper function `is_community_member` used by the rewritten
-- policies and by future community-scoped features.

-- ── Helper: is_community_member ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_community_member(p_community_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community_id
      AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION is_community_member(uuid, uuid) TO authenticated;


-- ── community_post_comments ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view comments" ON community_post_comments;
DROP POLICY IF EXISTS "community_post_comments_select" ON community_post_comments;
CREATE POLICY "community_post_comments_select"
  ON community_post_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      JOIN communities c ON c.id = p.community_id
      WHERE p.id = community_post_comments.post_id
        AND (c.is_private = false OR is_community_member(c.id, auth.uid()))
    )
  );


-- ── community_post_likes ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view likes" ON community_post_likes;
DROP POLICY IF EXISTS "community_post_likes_select" ON community_post_likes;
CREATE POLICY "community_post_likes_select"
  ON community_post_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      JOIN communities c ON c.id = p.community_id
      WHERE p.id = community_post_likes.post_id
        AND (c.is_private = false OR is_community_member(c.id, auth.uid()))
    )
  );


-- ── challenge_participants ──────────────────────────────────────────────
-- Challenges have `is_public` (migration 011 line 301). Private challenges
-- should only expose their participant list to the creator or to other
-- participants.

DROP POLICY IF EXISTS "Anyone can view challenge participants" ON challenge_participants;
DROP POLICY IF EXISTS "challenge_participants_select" ON challenge_participants;
CREATE POLICY "challenge_participants_select"
  ON challenge_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM challenges ch
      WHERE ch.id = challenge_participants.challenge_id
        AND (
          ch.is_public = true
          OR ch.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM challenge_participants cp
            WHERE cp.challenge_id = ch.id
              AND cp.user_id = auth.uid()
          )
        )
    )
  );


-- ── Kept public (documented for future maintainers) ─────────────────────
-- No policy changes needed for these, but we keep explicit CREATE POLICY
-- statements so the intent is obvious in pg_policies.
--
-- post_comments — comments on instructor_posts.
--   instructor_posts are a public feed (storefront-adjacent). Comments are
--   intended to be visible to anyone browsing a storefront. Leaving the
--   policy USING (true) is a conscious product decision.
--
-- external_events, popular_venues, strava_routes, popular_routes,
-- area_first_sessions — city-wide directories with no user-specific data.
--   These are effectively static content. USING (true) is correct.
--
-- We don't drop/recreate these policies to keep this migration focused
-- and minimize risk of breaking read paths.

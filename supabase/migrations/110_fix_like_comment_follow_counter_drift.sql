-- 110_fix_like_comment_follow_counter_drift.sql
-- T-COUNT2: counter drift on post_likes, post_comments, user_follows — the same
-- double-trigger / delta pattern fixed for session_participants in 109.
--
-- LIVE DIAGNOSIS (function bodies fetched from prod before writing):
--
--   post_likes -> instructor_posts.like_count
--     TWO delta triggers both += 1 the SAME column on every like:
--       post_like_count_trigger -> update_post_like_count()  (migration 031)
--       trg_post_like_insert / trg_post_like_delete -> on_post_like()  (untracked)
--     Result: like_count is counted twice (~2x the real number).
--
--   post_comments -> instructor_posts.comment_count AND comments_count
--     update_post_comment_count() (031) deltas comment_count (singular);
--     recompute_post_comments_count() (100) recomputes comments_count (plural).
--     Two columns, two triggers, read by different parts of the app
--     (instructorPosts.ts reads comment_count; comments.ts reads comments_count),
--     so they can disagree.
--
--   user_follows -> users.follower_count / following_count
--     on_user_follow() / on_user_unfollow() (untracked) are the ONLY writers,
--     single +/-1 deltas with no recompute — drift-prone under any non-trigger
--     path, RLS-blocked write, or race.
--
-- FIX: one self-recomputing trigger per table (count from the real rows every
-- time — can't double or drift), drop the legacy/duplicate triggers + their
-- functions, and backfill existing drift. The comments recompute writes BOTH
-- columns so no app code needs to change.
--
-- ROLLING-SAFE: dropping the delta triggers is safe with any client version —
-- nothing depends on them, and the recompute becomes the single authority.

-- ─────────────────────────── post_likes ───────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_post_like_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid;
BEGIN
  v_pid := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE instructor_posts
  SET like_count = (SELECT count(*) FROM post_likes WHERE post_id = v_pid)
  WHERE id = v_pid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_post_like_insert ON public.post_likes;
DROP TRIGGER IF EXISTS trg_post_like_delete ON public.post_likes;
DROP TRIGGER IF EXISTS post_like_count_trigger ON public.post_likes;
DROP FUNCTION IF EXISTS public.on_post_like();
DROP FUNCTION IF EXISTS public.update_post_like_count();

DROP TRIGGER IF EXISTS trg_post_like_count ON public.post_likes;
CREATE TRIGGER trg_post_like_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.recompute_post_like_count();

-- ────────────────────────── post_comments ─────────────────────────
-- Single recompute writes BOTH columns so every existing reader stays correct.
CREATE OR REPLACE FUNCTION public.recompute_post_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid; v_n int;
BEGIN
  v_pid := COALESCE(NEW.post_id, OLD.post_id);
  SELECT count(*) INTO v_n FROM post_comments WHERE post_id = v_pid;
  UPDATE instructor_posts SET comments_count = v_n, comment_count = v_n WHERE id = v_pid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS post_comment_count_trigger ON public.post_comments;
DROP FUNCTION IF EXISTS public.update_post_comment_count();

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.recompute_post_comments_count();

-- ────────────────────────── user_follows ──────────────────────────
-- Recompute both affected users' counts from the real follow rows.
CREATE OR REPLACE FUNCTION public.recompute_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_following uuid; v_follower uuid;
BEGIN
  v_following := COALESCE(NEW.following_id, OLD.following_id);
  v_follower  := COALESCE(NEW.follower_id,  OLD.follower_id);
  -- followed user's follower_count
  UPDATE users SET follower_count = (
    SELECT count(*) FROM user_follows WHERE following_id = v_following
  ) WHERE id = v_following;
  -- following user's following_count
  UPDATE users SET following_count = (
    SELECT count(*) FROM user_follows WHERE follower_id = v_follower
  ) WHERE id = v_follower;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_user_follow_insert ON public.user_follows;
DROP TRIGGER IF EXISTS trg_user_follow_delete ON public.user_follows;
DROP FUNCTION IF EXISTS public.on_user_follow();
DROP FUNCTION IF EXISTS public.on_user_unfollow();

DROP TRIGGER IF EXISTS trg_user_follow_count ON public.user_follows;
CREATE TRIGGER trg_user_follow_count
AFTER INSERT OR DELETE ON public.user_follows
FOR EACH ROW EXECUTE FUNCTION public.recompute_follow_counts();

-- ─────────────────────────── backfill drift ───────────────────────
UPDATE public.instructor_posts p
SET like_count = (SELECT count(*) FROM public.post_likes WHERE post_id = p.id)
WHERE like_count IS DISTINCT FROM (SELECT count(*) FROM public.post_likes WHERE post_id = p.id);

UPDATE public.instructor_posts p
SET comments_count = (SELECT count(*) FROM public.post_comments WHERE post_id = p.id),
    comment_count  = (SELECT count(*) FROM public.post_comments WHERE post_id = p.id)
WHERE comments_count IS DISTINCT FROM (SELECT count(*) FROM public.post_comments WHERE post_id = p.id)
   OR comment_count  IS DISTINCT FROM (SELECT count(*) FROM public.post_comments WHERE post_id = p.id);

UPDATE public.users u
SET follower_count  = (SELECT count(*) FROM public.user_follows WHERE following_id = u.id),
    following_count = (SELECT count(*) FROM public.user_follows WHERE follower_id  = u.id)
WHERE follower_count  IS DISTINCT FROM (SELECT count(*) FROM public.user_follows WHERE following_id = u.id)
   OR following_count IS DISTINCT FROM (SELECT count(*) FROM public.user_follows WHERE follower_id  = u.id);

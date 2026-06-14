-- 100_post_comments_count_trigger.sql
--
-- instructor_posts.comments_count was maintained by THREE competing app-side
-- writers in insertPostComment (perf audit C-2):
--   1. .update({ comments_count: supabase.rpc('increment_column', ...) }) —
--      embeds an rpc() builder as a column value (writes garbage / errors),
--   2. rpc('increment_post_comments', ...) — function never deployed,
--   3. a read-modify-write fallback (currentCount + 1) — lost-update race.
-- deletePostComment used the same read-modify-write to decrement.
--
-- instructor_posts.like_count is already maintained correctly by a trigger
-- (031). This adds the missing sibling for comments_count, recomputed from
-- post_comments (self-healing), and the app-side writers are removed in the
-- same PR. Includes a one-time backfill to heal existing drift.

CREATE OR REPLACE FUNCTION public.recompute_post_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid;
BEGIN
  v_pid := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE instructor_posts SET comments_count = (
    SELECT count(*) FROM post_comments WHERE post_id = v_pid
  ) WHERE id = v_pid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_post_comments_count();

-- One-time backfill to heal whatever the triple-writer left behind.
UPDATE instructor_posts p SET comments_count = (
  SELECT count(*) FROM post_comments c WHERE c.post_id = p.id
);

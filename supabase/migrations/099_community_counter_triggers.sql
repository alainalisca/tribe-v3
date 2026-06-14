-- 099_community_counter_triggers.sql
--
-- The community counters (communities.member_count, community_posts.likes_count,
-- community_posts.comments_count) were maintained by the app via
-- `supabase.rpc('increment'/'decrement', {table, column, value, id})` — a
-- generic dynamic-SQL helper that WAS NEVER DEPLOYED (confirmed via pg_proc).
-- So every call errored. Worst case: joinCommunity inserts the member, the
-- increment errors, the code rolls the member back, and JOINING A COMMUNITY
-- FAILS ENTIRELY. Likes/comments counts simply never moved.
--
-- A generic increment(table, column, ...) RPC granted to authenticated would
-- itself be a privilege-escalation footgun (dynamic SQL on any table/column),
-- so we do NOT create it. Instead the counts are maintained by triggers that
-- RECOMPUTE from the source rows — the same self-healing pattern as
-- 087_session_participant_count_trigger. The matching app-side rpc() calls are
-- removed in the same PR.

-- ── communities.member_count ← community_members ─────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_community_member_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid;
BEGIN
  v_cid := COALESCE(NEW.community_id, OLD.community_id);
  UPDATE communities SET member_count = (
    SELECT count(*) FROM community_members WHERE community_id = v_cid
  ) WHERE id = v_cid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_community_member_count ON public.community_members;
CREATE TRIGGER trg_community_member_count
  AFTER INSERT OR DELETE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.recompute_community_member_count();

-- ── community_posts.likes_count ← community_post_likes ───────────────────
CREATE OR REPLACE FUNCTION public.recompute_community_post_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid;
BEGIN
  v_pid := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE community_posts SET likes_count = (
    SELECT count(*) FROM community_post_likes WHERE post_id = v_pid
  ) WHERE id = v_pid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_community_post_likes_count ON public.community_post_likes;
CREATE TRIGGER trg_community_post_likes_count
  AFTER INSERT OR DELETE ON public.community_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.recompute_community_post_likes_count();

-- ── community_posts.comments_count ← community_post_comments ─────────────
CREATE OR REPLACE FUNCTION public.recompute_community_post_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid;
BEGIN
  v_pid := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE community_posts SET comments_count = (
    SELECT count(*) FROM community_post_comments WHERE post_id = v_pid
  ) WHERE id = v_pid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_community_post_comments_count ON public.community_post_comments;
CREATE TRIGGER trg_community_post_comments_count
  AFTER INSERT OR DELETE ON public.community_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_community_post_comments_count();

-- ── One-time backfill: heal whatever drift the broken RPCs left behind ───
UPDATE communities c SET member_count = (
  SELECT count(*) FROM community_members m WHERE m.community_id = c.id
);
UPDATE community_posts p SET
  likes_count = (SELECT count(*) FROM community_post_likes l WHERE l.post_id = p.id),
  comments_count = (SELECT count(*) FROM community_post_comments cm WHERE cm.post_id = p.id);

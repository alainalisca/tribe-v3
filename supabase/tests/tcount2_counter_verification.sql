-- T-COUNT2 verification: like / comment / follow counts are correct after the
-- single-recompute consolidation, and the legacy delta functions are gone.
--
-- Run in the Supabase SQL editor AFTER deploying migration 110. Returns a small
-- PASS/FAIL table (the editor doesn't surface RAISE NOTICE, so results come back
-- as rows). Every write is undone via a savepoint or an explicit cleanup, so
-- production data is untouched.

CREATE OR REPLACE FUNCTION pg_temp._tcount2_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_a uuid; v_b uuid; v_post uuid;
  v_c1 int; v_c2 int;
BEGIN
  SELECT id INTO v_a FROM users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM users WHERE id <> v_a ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'Need at least two users'; END IF;

  -- throwaway post (deleted at the end)
  INSERT INTO instructor_posts (id, author_id, content, like_count, comment_count, comments_count, view_count, is_pinned, created_at, updated_at)
  VALUES (gen_random_uuid(), v_a, 'tcount2 probe', 0, 0, 0, 0, false, now(), now())
  RETURNING id INTO v_post;

  -- 1. one like -> like_count = 1 (not 2, which the old double-trigger produced)
  check_name := '1. like counted once (not doubled)';
  BEGIN
    INSERT INTO post_likes (post_id, user_id) VALUES (v_post, v_b) ON CONFLICT DO NOTHING;
    SELECT like_count INTO v_c1 FROM instructor_posts WHERE id = v_post;
    result := CASE WHEN v_c1 = 1 THEN 'PASS' ELSE 'FAIL (like_count=' || v_c1 || ', expected 1)' END;
    RAISE EXCEPTION 'RB1';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'RB1' THEN result := 'FAIL: ' || SQLERRM; END IF;
  END;
  RETURN NEXT;

  -- 2. one comment -> BOTH columns = 1 (single recompute keeps them in sync)
  check_name := '2. comment sets comment_count AND comments_count to 1';
  BEGIN
    INSERT INTO post_comments (post_id, author_id, content) VALUES (v_post, v_b, 'x');
    SELECT comment_count, comments_count INTO v_c1, v_c2 FROM instructor_posts WHERE id = v_post;
    result := CASE WHEN v_c1 = 1 AND v_c2 = 1 THEN 'PASS'
                   ELSE 'FAIL (comment_count=' || v_c1 || ', comments_count=' || v_c2 || ')' END;
    RAISE EXCEPTION 'RB2';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'RB2' THEN result := 'FAIL: ' || SQLERRM; END IF;
  END;
  RETURN NEXT;

  -- 3. A follows B -> B.follower_count and A.following_count equal the real counts
  check_name := '3. follow recomputes follower/following counts';
  BEGIN
    INSERT INTO user_follows (follower_id, following_id) VALUES (v_a, v_b) ON CONFLICT DO NOTHING;
    SELECT follower_count INTO v_c1 FROM users WHERE id = v_b;
    SELECT following_count INTO v_c2 FROM users WHERE id = v_a;
    result := CASE WHEN v_c1 = (SELECT count(*) FROM user_follows WHERE following_id = v_b)
                    AND v_c2 = (SELECT count(*) FROM user_follows WHERE follower_id  = v_a)
                   THEN 'PASS'
                   ELSE 'FAIL (follower_count=' || v_c1 || ', following_count=' || v_c2 || ')' END;
    RAISE EXCEPTION 'RB3';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'RB3' THEN result := 'FAIL: ' || SQLERRM; END IF;
  END;
  RETURN NEXT;

  -- 4. the legacy delta functions are gone (single writer per table)
  check_name := '4. legacy delta functions dropped';
  result := CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('on_post_like','update_post_like_count','update_post_comment_count',
                        'on_user_follow','on_user_unfollow')
    ) THEN 'PASS' ELSE 'FAIL (a legacy function still exists)' END;
  RETURN NEXT;

  -- cleanup the throwaway post (the like/comment/follow inserts were already
  -- rolled back via their savepoints)
  DELETE FROM instructor_posts WHERE id = v_post;
  RETURN;
END $$;

SELECT * FROM pg_temp._tcount2_verify();

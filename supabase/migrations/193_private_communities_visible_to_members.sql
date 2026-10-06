-- 193_private_communities_visible_to_members.sql
--
-- T-COMM4. A private community is visible only to its creator. Its members,
-- admins included, cannot read the row at all, so they cannot open the
-- community page, it does not appear in their lists, and an admin's edit or
-- banner save updates zero rows (UPDATE has to SELECT the row first) and the
-- edit page says "refused". This adds membership to the SELECT policy.
--
-- NUMBER: 193 was the next free number on origin/main at 6ff6eee, and no
-- remote branch carries a 193. Re-check against origin/main immediately before
-- merge; a number belongs to whichever branch merges first.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT PRODUCTION HAS (read 2026-09-25)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   communities has ONE read policy, "Public communities are visible to all":
--     (deleted_at IS NULL) AND ((is_private = false) OR (creator_id = auth.uid()))
--   (190 recreated it with deleted_at; the shape is otherwise 048's.)
--
--   2 live private communities, each with 1 member (its creator, as admin).
--   So nobody is locked out today. The first person to join either one would
--   be, and so would every admin of a private community created from now on.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE CHANGE, AND WHY THIS SHAPE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Same policy name, one arm added:
--     OR public.is_community_member(id, auth.uid())
--
-- is_community_member() (048) is SECURITY DEFINER, so it reads
-- community_members without that table's RLS. That matters: the
-- community_members read policy itself queries communities, and a plain
-- subquery here would put the two policies in a loop (the recursion 092
-- fixed for posts). The same function already gates community posts and, since
-- 191, community comments, so a member now sees the community, its posts and
-- its comments by one rule.
--
-- deleted_at IS NULL stays outside the OR: a soft-deleted community stays
-- hidden from everyone, members included.
--
-- WHO GAINS AND WHO LOSES:
--   * member (any role) of a private community: GAINS read of that community.
--     An admin's edit and banner saves stop being refused.
--   * everyone else: unchanged. Public communities stay visible to all,
--     including signed out; a private one stays hidden from non-members and
--     from anon (auth.uid() is NULL, so the new arm is false).
--   * writes: unchanged. The UPDATE policy, the column grants from 190 and
--     soft_delete_community are not touched.

-- ── 0. Pre-flight ──────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_qual text;
  v_n    int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities' AND cmd IN ('SELECT', 'ALL');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '193 ABORTED: expected exactly 1 read policy on communities (read 2026-09-25), found %.', v_n;
  END IF;

  SELECT regexp_replace(qual, '\s+', ' ', 'g') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities'
     AND policyname = 'Public communities are visible to all' AND cmd = 'SELECT';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION '193 ABORTED: "Public communities are visible to all" is missing.';
  END IF;

  -- Either the shape read on 2026-09-25, or this migration's own (a re-run).
  IF v_qual <> '((deleted_at IS NULL) AND ((is_private = false) OR (creator_id = auth.uid())))'
     AND position('is_community_member' IN v_qual) = 0 THEN
    RAISE EXCEPTION '193 ABORTED: the communities read policy changed since 2026-09-25. Live: %', v_qual;
  END IF;

  IF to_regprocedure('public.is_community_member(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '193 ABORTED: public.is_community_member(uuid, uuid) does not exist.';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.is_community_member(uuid, uuid)')) THEN
    RAISE EXCEPTION '193 ABORTED: is_community_member is not SECURITY DEFINER; using it here would loop through community_members RLS.';
  END IF;

  -- Signed-out visitors read public communities through this policy, so the
  -- function must be executable by anon, or every signed-out read fails.
  IF NOT has_function_privilege('anon', 'public.is_community_member(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_community_member(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '193 ABORTED: anon or authenticated cannot execute is_community_member; public community reads would fail.';
  END IF;
END $pre$;

-- ── 1. The fix ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public communities are visible to all" ON public.communities;
CREATE POLICY "Public communities are visible to all"
  ON public.communities FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      is_private = false
      OR creator_id = auth.uid()
      OR public.is_community_member(id, auth.uid())
    )
  );

-- ── 2. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_qual text;
  v_n    int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities' AND cmd IN ('SELECT', 'ALL');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '193 ABORTED: expected exactly 1 read policy on communities, found %.', v_n;
  END IF;

  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities'
     AND policyname = 'Public communities are visible to all';

  IF position('is_community_member' IN v_qual) = 0 THEN
    RAISE EXCEPTION '193 ABORTED: the read policy does not include members.';
  END IF;
  IF position('deleted_at IS NULL' IN v_qual) = 0 THEN
    RAISE EXCEPTION '193 ABORTED: the read policy no longer hides deleted communities.';
  END IF;
  IF position('is_private = false' IN v_qual) = 0 THEN
    RAISE EXCEPTION '193 ABORTED: the read policy no longer shows public communities.';
  END IF;

  RAISE NOTICE '193: private communities are now visible to their members.';
END $$;

-- ── 3. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('193_private_communities_visible_to_members', 'T-COMM4: communities read policy admits members via is_community_member')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'communities' AND cmd IN ('SELECT', 'ALL')) = 1
                                                                                    AS one_read_policy_ok,
  EXISTS (SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'communities'
             AND policyname = 'Public communities are visible to all'
             AND position('is_community_member' IN qual) > 0
             AND position('deleted_at IS NULL' IN qual) > 0)                          AS members_and_deleted_ok,
  (SELECT count(*) FROM public.communities WHERE is_private AND deleted_at IS NULL)  AS live_private_communities,
  EXISTS (SELECT 1 FROM public.migrations_applied
           WHERE migration = '193_private_communities_visible_to_members')           AS recorded_ok;

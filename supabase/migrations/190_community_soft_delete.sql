-- 190_community_soft_delete.sql
--
-- T-COMM2, the data half. Soft delete for communities, creator only, and the
-- column-level UPDATE grant that makes "creator only" true.
--
-- NUMBER: 190 was the next free number on the local main at 672355e6. It MUST
-- be re-checked against origin/main immediately before merge. A number belongs
-- to whichever branch merges first (CLAUDE.md, and the uniqueness test in
-- verify-migration-state.test.ts). If 190 is taken, renumber this file, its
-- rehearsal, its verifier probes and the migrations_applied row below.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT PRODUCTION SAID, 2026-09-23 (pg_policies, information_schema, pg_proc)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- public.communities has exactly three policies and no DELETE policy:
--
--   SELECT "Public communities are visible to all"
--          USING (is_private = false OR creator_id = auth.uid())
--   INSERT "Authenticated users can create communities"
--          WITH CHECK (auth.uid() IS NOT NULL AND creator_id = auth.uid())
--   UPDATE "Admins can update their communities"
--          USING (creator_id = auth.uid()
--                 OR id IN (SELECT community_id FROM community_members
--                            WHERE user_id = auth.uid() AND role = 'admin'))
--          no WITH CHECK
--
-- No view reads communities. The only function that writes it is
-- recompute_community_member_count(), SECURITY DEFINER, which touches
-- member_count and nothing else. Measured, not inferred from the repo: the
-- repo and production disagreed four times the week this was written.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE HOLE THIS CLOSES BEFORE IT ADDS ANYTHING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The UPDATE policy lets an admin member update the WHOLE ROW, and RLS cannot
-- compare NEW to OLD. So today an admin can PATCH creator_id to their own id
-- and become the creator. "Creator only" delete is worth exactly as much as
-- creator_id is trustworthy, so shipping soft delete on top of that policy
-- would have shipped a delete that any admin can take.
--
-- The same policy would let an admin (or the creator) write deleted_at
-- directly, skipping the typed-name confirmation.
--
-- WHY A COLUMN GRANT AND NOT A GUARD TRIGGER. The obvious fix is a BEFORE
-- UPDATE trigger that refuses creator_id and deleted_at changes "unless the
-- write came through the delete function". CLAUDE.md records why that does not
-- work: a trigger cannot tell "reached through SECURITY DEFINER" from "SET
-- ROLE", session_user differs between the SQL editor and PostgREST, and an
-- app.* flag the trigger trusts is a flag the caller can set. 178 hit exactly
-- this. The answer there was to remove the need for the signal, and it is the
-- answer here: authenticated simply has no UPDATE privilege on creator_id,
-- deleted_at, member_count, id or created_at. The definer function writes
-- deleted_at because it runs as the owner. Nothing asks who anyone is.
--
-- This is the same shape 066/067 use on public.users and 173 uses on
-- pass_leads: the policy says WHICH ROWS, the grant says WHICH COLUMNS.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THE SELECT POLICY, NOT ONLY THE APPLICATION, HIDES A DELETED ROW
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Filtered from every read" is only true if it is enforced where every read
-- passes. Every child policy that asks "is this community public" does so with
-- a subquery on communities, which runs under the caller's RLS, so hiding the
-- row here also hides it from those subqueries without rewriting them. The
-- application filter still gets added (T-COMM2 code half) for service-role
-- reads, which bypass RLS.
--
-- A consequence worth knowing: once deleted, the row is invisible to its own
-- creator through PostgREST. That is why deletion is a function and not a
-- client UPDATE. PostgREST asks for the updated row back, and a row the caller
-- can no longer see fails that read.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES NOT DO
-- ═══════════════════════════════════════════════════════════════════════════
--
--   * No DELETE policy and no hard delete. A hard delete stays a deliberate
--     admin decision made once, with storage cleaned up on purpose.
--   * No change to child-table policies (posts, comments, likes, events,
--     members). Hiding the parent row covers the public branch of each; the
--     member branch is covered in the application.
--   * No change to the moderator's rights. The UPDATE policy already excludes
--     moderators; the client is being narrowed to match it, not the reverse.
--   * No storage change. The community-banners leak and its two wide-open
--     INSERT/UPDATE policies are T-COMM1 and T-SEC4-B.

-- ── 0. Pre-flight: refuse to run over policies that are not what was read ──
--
-- The policy rewrites below are DROP + CREATE. If either policy has changed
-- since 2026-09-23, recreating it from this file would silently revert that
-- change. So the live text is compared first and the migration aborts on a
-- mismatch. Whitespace is normalised because pg_get_expr's line breaks are
-- formatting, not meaning. A re-run over 190's own shapes is allowed.
DO $pre$
DECLARE
  v_sel text;
  v_upd text;
  v_upd_check text;
  k_sel_pre  constant text := '((is_private = false) OR (creator_id = auth.uid()))';
  k_upd_pre  constant text := '((creator_id = auth.uid()) OR (id IN ( SELECT community_members.community_id FROM community_members WHERE ((community_members.user_id = auth.uid()) AND (community_members.role = ''admin''::text)))))';
BEGIN
  SELECT regexp_replace(qual, '\s+', ' ', 'g') INTO v_sel
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities'
     AND policyname = 'Public communities are visible to all' AND cmd = 'SELECT';

  SELECT regexp_replace(qual, '\s+', ' ', 'g'), with_check INTO v_upd, v_upd_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities'
     AND policyname = 'Admins can update their communities' AND cmd = 'UPDATE';

  IF v_sel IS NULL OR v_upd IS NULL THEN
    RAISE EXCEPTION
      '190 ABORTED: expected SELECT and UPDATE policies on communities by name; found select=% update=%. '
      'Something renamed or dropped them after 2026-09-23. Re-read production before running this.',
      coalesce(v_sel, '(absent)'), coalesce(v_upd, '(absent)');
  END IF;

  -- Either the pre-190 shape (first run) or a shape that already names
  -- deleted_at (re-run). Anything else is a change this file did not see.
  IF v_sel <> k_sel_pre AND position('deleted_at' IN v_sel) = 0 THEN
    RAISE EXCEPTION
      '190 ABORTED: the communities SELECT policy changed after 2026-09-23. Live: %', v_sel;
  END IF;
  IF v_upd <> k_upd_pre AND position('deleted_at' IN v_upd) = 0 THEN
    RAISE EXCEPTION
      '190 ABORTED: the communities UPDATE policy changed after 2026-09-23. Live: %', v_upd;
  END IF;
  IF v_upd_check IS NOT NULL AND position('deleted_at' IN v_upd) = 0 THEN
    RAISE EXCEPTION
      '190 ABORTED: the communities UPDATE policy gained a WITH CHECK after 2026-09-23. Live: %', v_upd_check;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'communities' AND cmd IN ('DELETE', 'ALL')) THEN
    RAISE EXCEPTION
      '190 ABORTED: communities now has a DELETE or ALL policy, which production did not have on 2026-09-23. '
      'Soft delete assumes no client can hard-delete a community.';
  END IF;
END $pre$;

-- ── 1. The column ──────────────────────────────────────────────────────────
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.communities.deleted_at IS
  'Soft delete (migration 190). Set only by soft_delete_community(), which '
  'only the creator can call. A row with this set is invisible to every client '
  'role through the SELECT policy. No client role holds UPDATE on this column. '
  'Hard delete is a separate, deliberate admin action.';

-- Partial index for the one question every read asks.
CREATE INDEX IF NOT EXISTS idx_communities_not_deleted
  ON public.communities (created_at DESC)
  WHERE deleted_at IS NULL;

-- ── 2. The grant: which COLUMNS a client can write ─────────────────────────
--
-- Supabase grants every public table to anon and authenticated by default, so
-- each role is named. anon gets no UPDATE at all: the policy already refuses
-- it (auth.uid() is NULL), and a privilege nobody should use is one less thing
-- a later policy change can accidentally expose.
--
-- The authenticated list is exactly what the app writes today:
--   cover_image_url                     updateCommunityCoverImage (banner)
--   name, description, sport,           updateCommunity (/communities/[id]/edit)
--   location_name, location_lat,
--   location_lng, is_private
-- NOT granted: id, creator_id, member_count, created_at, deleted_at.
REVOKE UPDATE ON public.communities FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name, description, sport, location_name, location_lat, location_lng,
              is_private, cover_image_url)
  ON public.communities TO authenticated;

-- ── 3. The policies: which ROWS ────────────────────────────────────────────
--
-- Same shapes production has, each with deleted_at IS NULL added, and nothing
-- else changed. The UPDATE policy keeps no WITH CHECK, so its USING applies to
-- the new row too, exactly as today.
DROP POLICY IF EXISTS "Public communities are visible to all" ON public.communities;
CREATE POLICY "Public communities are visible to all"
  ON public.communities FOR SELECT
  USING (deleted_at IS NULL AND (is_private = false OR creator_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update their communities" ON public.communities;
CREATE POLICY "Admins can update their communities"
  ON public.communities FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      creator_id = auth.uid()
      OR id IN (SELECT community_members.community_id
                  FROM community_members
                 WHERE community_members.user_id = auth.uid()
                   AND community_members.role = 'admin')
    )
  );

-- ── 4. The only way to delete ──────────────────────────────────────────────
--
-- Creator only, not admins: an admin is someone the creator promoted, and
-- destroying the creator's community with everyone's posts in it is a
-- different grant from moderating it.
--
-- The typed name is checked HERE as well as in the browser. The browser check
-- is the experience; this one is the rule. Exact match after trimming, case
-- sensitive, because the point of typing it is to prove you know which
-- community you are about to delete.
--
-- Error codes are distinct so the client can say something precise:
--   28000  not signed in
--   P0002  no such community
--   55000  already deleted
--   42501  signed in, not the creator
--   22023  the typed name does not match
CREATE OR REPLACE FUNCTION public.soft_delete_community(p_community_id uuid, p_confirm_name text)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_creator    uuid;
  v_name       text;
  v_deleted_at timestamptz;
  v_now        timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to delete a community.' USING ERRCODE = '28000';
  END IF;

  -- FOR UPDATE: two clicks racing each other both read "not deleted" without it.
  SELECT creator_id, name, deleted_at
    INTO v_creator, v_name, v_deleted_at
    FROM public.communities
   WHERE id = p_community_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This community was already deleted.' USING ERRCODE = '55000';
  END IF;

  IF v_creator IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the creator can delete this community.' USING ERRCODE = '42501';
  END IF;

  IF p_confirm_name IS NULL OR btrim(p_confirm_name) <> btrim(v_name) THEN
    RAISE EXCEPTION 'The name you typed does not match the community name.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.communities SET deleted_at = v_now WHERE id = p_community_id;
  RETURN v_now;
END;
$fn$;

COMMENT ON FUNCTION public.soft_delete_community(uuid, text) IS
  'Migration 190. The only path that sets communities.deleted_at. Creator only, '
  'typed-name confirmation enforced server side. SECURITY DEFINER because '
  'authenticated holds no UPDATE on deleted_at, by design.';

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and Supabase re-grants
-- to anon. Both named.
REVOKE ALL ON FUNCTION public.soft_delete_community(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_community(uuid, text) TO authenticated;

-- ── 5. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rows bigint;
  v_col  text;
BEGIN
  -- NON-VACUITY. Every privilege assertion below is true of a table that does
  -- not exist, and the policy checks are true of a table with no policies.
  SELECT count(*) INTO v_rows FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities';
  IF v_rows <> 3 THEN
    RAISE EXCEPTION '190 ABORTED: communities should have exactly 3 policies (select, insert, update); it has %.', v_rows;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'communities'
                    AND column_name = 'deleted_at' AND data_type = 'timestamp with time zone') THEN
    RAISE EXCEPTION '190 ABORTED: communities.deleted_at is missing or not timestamptz.';
  END IF;

  -- THE ARM THAT MATTERS. Each protected column, asked one at a time, so a
  -- later GRANT on any single one of them turns this red by name.
  FOREACH v_col IN ARRAY ARRAY['id', 'creator_id', 'member_count', 'created_at', 'deleted_at'] LOOP
    IF has_column_privilege('authenticated', 'public.communities', v_col, 'UPDATE') THEN
      RAISE EXCEPTION '190 ABORTED: authenticated can UPDATE communities.%. That column must only change through the database.', v_col;
    END IF;
    IF has_column_privilege('anon', 'public.communities', v_col, 'UPDATE') THEN
      RAISE EXCEPTION '190 ABORTED: anon can UPDATE communities.%.', v_col;
    END IF;
  END LOOP;

  -- And the other direction: a guard that only checks what is refused would
  -- stay green if the REVOKE had taken everything, which would break the
  -- banner and the edit page with 42501 and look like success here.
  FOREACH v_col IN ARRAY ARRAY['name', 'description', 'sport', 'location_name',
                               'location_lat', 'location_lng', 'is_private', 'cover_image_url'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.communities', v_col, 'UPDATE') THEN
      RAISE EXCEPTION '190 ABORTED: authenticated lost UPDATE on communities.%, which the app writes.', v_col;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.communities', 'UPDATE') THEN
    RAISE EXCEPTION '190 ABORTED: anon still holds table-level UPDATE on communities.';
  END IF;

  IF position('deleted_at' IN (SELECT qual FROM pg_policies
                                 WHERE schemaname = 'public' AND tablename = 'communities'
                                   AND cmd = 'SELECT')) = 0 THEN
    RAISE EXCEPTION '190 ABORTED: the SELECT policy does not hide deleted rows.';
  END IF;
  IF position('deleted_at' IN (SELECT qual FROM pg_policies
                                 WHERE schemaname = 'public' AND tablename = 'communities'
                                   AND cmd = 'UPDATE')) = 0 THEN
    RAISE EXCEPTION '190 ABORTED: the UPDATE policy still reaches deleted rows.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.soft_delete_community(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '190 ABORTED: authenticated cannot call soft_delete_community.';
  END IF;
  IF has_function_privilege('anon', 'public.soft_delete_community(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '190 ABORTED: anon can call soft_delete_community.';
  END IF;

  -- Nothing should be deleted by the act of adding the column.
  SELECT count(*) INTO v_rows FROM public.communities WHERE deleted_at IS NOT NULL;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION '190 ABORTED: % communities are already marked deleted immediately after adding the column.', v_rows;
  END IF;

  RAISE NOTICE '190: deleted_at added, 5 columns locked, 8 writable, 2 policies scoped, delete function live.';
END $$;

-- ── 6. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('190_community_soft_delete', 'communities.deleted_at, column-level UPDATE grant, soft_delete_community()')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM public.communities)                                          AS communities_total,
  (SELECT count(*) FROM public.communities WHERE deleted_at IS NOT NULL)             AS communities_deleted,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'communities'
             AND column_name = 'deleted_at')                                         AS deleted_at_column_ok,
  NOT has_column_privilege('authenticated', 'public.communities', 'creator_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.communities', 'deleted_at', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.communities', 'member_count', 'UPDATE') AS protected_columns_locked_ok,
  has_column_privilege('authenticated', 'public.communities', 'name', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.communities', 'cover_image_url', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.communities', 'location_lat', 'UPDATE') AS editable_columns_writable_ok,
  NOT has_table_privilege('anon', 'public.communities', 'UPDATE')                   AS anon_no_update_ok,
  (SELECT count(*) = 2 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'communities'
      AND cmd IN ('SELECT', 'UPDATE') AND position('deleted_at' IN qual) > 0)        AS policies_hide_deleted_ok,
  has_function_privilege('authenticated', 'public.soft_delete_community(uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.soft_delete_community(uuid, text)', 'EXECUTE') AS delete_function_grants_ok,
  EXISTS (SELECT 1 FROM public.migrations_applied
           WHERE migration = '190_community_soft_delete')                            AS recorded_ok;

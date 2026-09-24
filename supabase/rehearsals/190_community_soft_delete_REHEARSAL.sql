-- 190_community_soft_delete_REHEARSAL.sql. Dry run of 190. Applies nothing.
--
-- Same construction as rehearse_189.sql: no BEGIN/ROLLBACK, because the
-- editor shows only the last statement's result and a ROLLBACK would be that
-- statement. The unwind is a plpgsql subtransaction ended by a deliberate
-- RAISE; plpgsql variables are not transactional, so the verdicts survive it.
-- Z1 at the end proves the unwind happened, which is evidence rather than an
-- assurance.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IS WORTH REHEARSING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 190's load-bearing claim is "creator only", and it rests on the column
-- grant, not on the policy. So the arms that matter are the ones that try to
-- get around it as a real caller would: an admin member PATCHing creator_id,
-- the creator PATCHing deleted_at directly, anon calling the function.
--
-- Each refusal is paired with a success arm on the same actor. A rehearsal
-- with only refusals cannot tell "190 blocks the bad write" from "190 blocks
-- every write", and the second would break the banner and the edit page with
-- 42501 while every arm here read PASS (CLAUDE.md: mutation arms prove a guard
-- can fire, only a success arm proves it will not).
--
-- B1 runs BEFORE 190 and must SUCCEED: it proves the takeover is real on this
-- database today, so C4 refusing it afterwards is evidence of 190 rather than
-- of a fixture that could never have worked.
--
-- ROLES. E0 prints session_user and current_user before any arm depends on
-- them. Every actor arm switches with SET LOCAL ROLE plus request.jwt.claims,
-- which is how 178's rehearsal reaches the same RLS path PostgREST does.
--
-- FIXTURE. Three real, non-admin, non-deleted users, chosen from live data so
-- the arms run through the same foreign keys a real caller would. The fixture
-- community and its rows exist only inside the subtransaction.

DROP TABLE IF EXISTS reh_190;
CREATE TEMP TABLE reh_190 (seq int, arm text, verdict text, detail text);

DO $reh$
DECLARE
  v_res     text[] := '{}';
  v_seq     int    := 0;
  u_a       uuid;   -- creator
  u_b       uuid;   -- admin member
  u_m       uuid;   -- moderator
  c_id      uuid;
  k_name    constant text := 'Rehearsal 190 Fixture';
  k_sel_pre constant text := '((is_private = false) OR (creator_id = auth.uid()))';
  k_upd_pre constant text := '((creator_id = auth.uid()) OR (id IN ( SELECT community_members.community_id FROM community_members WHERE ((community_members.user_id = auth.uid()) AND (community_members.role = ''admin''::text)))))';
  v_sel     text;
  v_upd     text;
  v_ok      boolean;
  v_n       bigint;
  v_got     text;
  v_detail  text;
  v_case    text;
  v_cases   text[];
  c_label   text;
  c_actor   text;
  c_kind    text;
  c_expect  text;
  c_sql     text;
  c_uid     uuid;
  v_mc_before int;
  v_mc_after  int;
BEGIN
  -- ── E0: who is connected. Stated before anything depends on it. ─────────
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^E0 ENV session_user and current_user (PostgREST connects as authenticator)^^PASS^^session_user=%s  current_user=%s',
    v_seq, session_user, current_user);

  -- ── Fixture users ────────────────────────────────────────────────────────
  SELECT id INTO u_a FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL
   ORDER BY created_at LIMIT 1;
  SELECT id INTO u_b FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL AND id <> u_a
   ORDER BY created_at LIMIT 1;
  SELECT id INTO u_m FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL AND id NOT IN (u_a, u_b)
   ORDER BY created_at LIMIT 1;

  -- ── A1: baseline. 190 not applied, the hole present, three users found. ──
  SELECT regexp_replace(qual, '\s+', ' ', 'g') INTO v_sel FROM pg_policies
   WHERE schemaname='public' AND tablename='communities' AND cmd='SELECT';
  SELECT regexp_replace(qual, '\s+', ' ', 'g') INTO v_upd FROM pg_policies
   WHERE schemaname='public' AND tablename='communities' AND cmd='UPDATE';
  v_ok := u_a IS NOT NULL AND u_b IS NOT NULL AND u_m IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='communities' AND column_name='deleted_at')
      AND to_regprocedure('public.soft_delete_community(uuid, text)') IS NULL
      AND v_sel = k_sel_pre AND v_upd = k_upd_pre
      AND has_column_privilege('authenticated', 'public.communities', 'creator_id', 'UPDATE');
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^A1 baseline: 190 not applied, policies as read on 2026-09-23, creator_id writable (the hole)^^%s^^users=%s, deleted_at=%s, function=%s, select_policy_match=%s, update_policy_match=%s, authenticated_update_creator_id=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    (u_a IS NOT NULL)::int + (u_b IS NOT NULL)::int + (u_m IS NOT NULL)::int,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='communities' AND column_name='deleted_at')
         THEN 'ALREADY PRESENT' ELSE 'absent' END,
    coalesce(to_regprocedure('public.soft_delete_community(uuid, text)')::text, 'absent'),
    (v_sel = k_sel_pre), (v_upd = k_upd_pre),
    has_column_privilege('authenticated', 'public.communities', 'creator_id', 'UPDATE'));

  IF u_a IS NULL OR u_b IS NULL OR u_m IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need three non-admin, non-deleted users and did not find them.';
  END IF;

  -- ══ THE SUBTRANSACTION. Everything below is discarded at its end. ═══════
  BEGIN
    -- ── Fixture: one public community, creator A, admin B, moderator M. ───
    INSERT INTO public.communities (name, creator_id, is_private)
    VALUES (k_name, u_a, false)
    RETURNING id INTO c_id;
    INSERT INTO public.community_members (community_id, user_id, role) VALUES
      (c_id, u_a, 'admin'), (c_id, u_b, 'admin'), (c_id, u_m, 'moderator');
    INSERT INTO public.community_posts (community_id, author_id, content)
    VALUES (c_id, u_a, 'rehearsal 190 fixture post');

    -- ── BEFORE 190 ────────────────────────────────────────────────────────
    v_cases := ARRAY[
      format('B1 BEFORE: an admin member CAN take over creator_id today (proves the hole is real)^^B^^exec^^rows=1^^UPDATE public.communities SET creator_id = %L WHERE id = %L', u_b, c_id),
      format('B2 BEFORE: a moderator cannot update (the policy already excludes moderators)^^M^^exec^^rows=0^^UPDATE public.communities SET name = name || %L WHERE id = %L', ' x', c_id),
      format('B3 BEFORE: anon can see the fixture post while the community is public^^anon^^count^^rows=1^^SELECT count(*) FROM public.community_posts WHERE community_id = %L', c_id)
    ];

    FOREACH v_case IN ARRAY v_cases LOOP
      c_label  := split_part(v_case, '^^', 1);
      c_actor  := split_part(v_case, '^^', 2);
      c_kind   := split_part(v_case, '^^', 3);
      c_expect := split_part(v_case, '^^', 4);
      c_sql    := split_part(v_case, '^^', 5);
      c_uid    := CASE c_actor WHEN 'A' THEN u_a WHEN 'B' THEN u_b WHEN 'M' THEN u_m ELSE NULL END;
      v_got := '(never ran)'; v_detail := '';
      BEGIN
        IF c_actor = 'anon' THEN
          PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
          SET LOCAL ROLE anon;
        ELSE
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', c_uid::text, 'role', 'authenticated')::text, true);
          SET LOCAL ROLE authenticated;
        END IF;
        IF c_kind = 'count' THEN
          EXECUTE c_sql INTO v_n;
        ELSE
          EXECUTE c_sql;
          GET DIAGNOSTICS v_n = ROW_COUNT;
        END IF;
        v_got := 'rows=' || v_n;
        RAISE EXCEPTION 'CASE_UNWIND';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'CASE_UNWIND' THEN
          -- 42501 has two causes and they prove different things. "permission
          -- denied" is the GRANT refusing; "new row violates" is RLS. C5 is
          -- refused by both after 190, and only the grant is the claim, so the
          -- two are told apart rather than both reading err=42501.
          v_got := CASE
                     WHEN SQLSTATE = '42501' AND SQLERRM LIKE 'permission denied%' THEN 'err=grant'
                     WHEN SQLSTATE = '42501' AND SQLERRM LIKE 'new row violates%'  THEN 'err=rls'
                     ELSE 'err=' || SQLSTATE
                   END;
          v_detail := SQLERRM;
        END IF;
      END;
      RESET ROLE;
      v_seq := v_seq + 1;
      v_res := v_res || format('%s^^%s^^%s^^expected %s, got %s %s',
        v_seq, c_label, CASE WHEN v_got = c_expect THEN 'PASS' ELSE 'FAIL' END, c_expect, v_got, v_detail);
    END LOOP;

    -- ══ 190's BODY, sections 1 to 4, verbatim. ═══════════════════════════
    ALTER TABLE public.communities
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

    COMMENT ON COLUMN public.communities.deleted_at IS
      'Soft delete (migration 190). Set only by soft_delete_community(), which '
      'only the creator can call. A row with this set is invisible to every client '
      'role through the SELECT policy. No client role holds UPDATE on this column. '
      'Hard delete is a separate, deliberate admin action.';

    CREATE INDEX IF NOT EXISTS idx_communities_not_deleted
      ON public.communities (created_at DESC)
      WHERE deleted_at IS NULL;

    REVOKE UPDATE ON public.communities FROM PUBLIC, anon, authenticated;
    GRANT UPDATE (name, description, sport, location_name, location_lat, location_lng,
                  is_private, cover_image_url)
      ON public.communities TO authenticated;

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

    REVOKE ALL ON FUNCTION public.soft_delete_community(uuid, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.soft_delete_community(uuid, text) TO authenticated;

    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^A2 190 sections 1 to 4 applied inside the subtransaction^^PASS^^column, index, grants, policies, function', v_seq);

    -- ── G1: 190's GUARD BODY VERBATIM, wrapper stripped. Must NOT raise.
    --        Run here, before the fixture is deleted, because its last check
    --        (nothing is already deleted) is true of production at apply time
    --        and would be false after D1 below.
    v_detail := 'did not raise';
    DECLARE
      v_rows bigint;
      v_col  text;
    BEGIN
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

      FOREACH v_col IN ARRAY ARRAY['id', 'creator_id', 'member_count', 'created_at', 'deleted_at'] LOOP
        IF has_column_privilege('authenticated', 'public.communities', v_col, 'UPDATE') THEN
          RAISE EXCEPTION '190 ABORTED: authenticated can UPDATE communities.%. That column must only change through the database.', v_col;
        END IF;
        IF has_column_privilege('anon', 'public.communities', v_col, 'UPDATE') THEN
          RAISE EXCEPTION '190 ABORTED: anon can UPDATE communities.%.', v_col;
        END IF;
      END LOOP;

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

      SELECT count(*) INTO v_rows FROM public.communities WHERE deleted_at IS NOT NULL;
      IF v_rows <> 0 THEN
        RAISE EXCEPTION '190 ABORTED: % communities are already marked deleted immediately after adding the column.', v_rows;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_detail := SQLSTATE || ': ' || SQLERRM;
    END;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^G1 190''s OWN GUARD BODY runs green on this database^^%s^^%s',
      v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

    -- ── AFTER 190, before any delete. Each case is unwound on its own. ────
    v_cases := ARRAY[
      format('C1 SUCCESS: the creator edits every column the edit page owns^^A^^exec^^rows=1^^UPDATE public.communities SET name = name || %L, description = %L, sport = sport, location_name = %L, location_lat = 6.2447, location_lng = -75.5896, is_private = is_private WHERE id = %L', ' (edited)', 'rehearsal', 'Laureles', c_id),
      format('C2 SUCCESS: an admin member edits the same columns^^B^^exec^^rows=1^^UPDATE public.communities SET name = name || %L, description = %L, location_name = %L WHERE id = %L', ' (edited)', 'rehearsal', 'Laureles', c_id),
      format('C3 SUCCESS: an admin member changes the banner (cover_image_url)^^B^^exec^^rows=1^^UPDATE public.communities SET cover_image_url = %L WHERE id = %L', 'https://example.invalid/banner.jpg', c_id),
      format('C4 MUTATION: an admin member taking over creator_id is REFUSED (same write as B1)^^B^^exec^^err=grant^^UPDATE public.communities SET creator_id = %L WHERE id = %L', u_b, c_id),
      format('C5 MUTATION: the creator writing deleted_at directly is REFUSED^^A^^exec^^err=grant^^UPDATE public.communities SET deleted_at = now() WHERE id = %L', c_id),
      format('C6 MUTATION: a client writing member_count is REFUSED^^A^^exec^^err=grant^^UPDATE public.communities SET member_count = 999 WHERE id = %L', c_id),
      format('C7 a moderator still updates nothing (the client is narrowed to match this)^^M^^exec^^rows=0^^UPDATE public.communities SET name = name || %L WHERE id = %L', ' x', c_id),
      format('C8 anon holds no UPDATE at all^^anon^^exec^^err=grant^^UPDATE public.communities SET name = name || %L WHERE id = %L', ' x', c_id),
      format('C9 anon cannot call soft_delete_community^^anon^^exec^^err=grant^^SELECT public.soft_delete_community(%L, %L)', c_id, k_name),
      format('C10 an admin member cannot delete (creator only)^^B^^exec^^err=42501^^SELECT public.soft_delete_community(%L, %L)', c_id, k_name),
      format('C11 the creator with the wrong name is refused^^A^^exec^^err=22023^^SELECT public.soft_delete_community(%L, %L)', c_id, 'Rehearsal 190 fixture'),
      format('C12 the creator with an empty name is refused^^A^^exec^^err=22023^^SELECT public.soft_delete_community(%L, %L)', c_id, ''),
      format('C13 a community that does not exist^^A^^exec^^err=P0002^^SELECT public.soft_delete_community(%L, %L)', gen_random_uuid(), k_name)
    ];

    FOREACH v_case IN ARRAY v_cases LOOP
      c_label  := split_part(v_case, '^^', 1);
      c_actor  := split_part(v_case, '^^', 2);
      c_kind   := split_part(v_case, '^^', 3);
      c_expect := split_part(v_case, '^^', 4);
      c_sql    := split_part(v_case, '^^', 5);
      c_uid    := CASE c_actor WHEN 'A' THEN u_a WHEN 'B' THEN u_b WHEN 'M' THEN u_m ELSE NULL END;
      v_got := '(never ran)'; v_detail := '';
      BEGIN
        IF c_actor = 'anon' THEN
          PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
          SET LOCAL ROLE anon;
        ELSE
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', c_uid::text, 'role', 'authenticated')::text, true);
          SET LOCAL ROLE authenticated;
        END IF;
        IF c_kind = 'count' THEN
          EXECUTE c_sql INTO v_n;
        ELSE
          EXECUTE c_sql;
          GET DIAGNOSTICS v_n = ROW_COUNT;
        END IF;
        v_got := 'rows=' || v_n;
        RAISE EXCEPTION 'CASE_UNWIND';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'CASE_UNWIND' THEN
          -- 42501 has two causes and they prove different things. "permission
          -- denied" is the GRANT refusing; "new row violates" is RLS. C5 is
          -- refused by both after 190, and only the grant is the claim, so the
          -- two are told apart rather than both reading err=42501.
          v_got := CASE
                     WHEN SQLSTATE = '42501' AND SQLERRM LIKE 'permission denied%' THEN 'err=grant'
                     WHEN SQLSTATE = '42501' AND SQLERRM LIKE 'new row violates%'  THEN 'err=rls'
                     ELSE 'err=' || SQLSTATE
                   END;
          v_detail := SQLERRM;
        END IF;
      END;
      RESET ROLE;
      v_seq := v_seq + 1;
      v_res := v_res || format('%s^^%s^^%s^^expected %s, got %s %s',
        v_seq, c_label, CASE WHEN v_got = c_expect THEN 'PASS' ELSE 'FAIL' END, c_expect, v_got, v_detail);
    END LOOP;

    -- ── C14: leaving still recomputes member_count. The counter trigger is
    --         SECURITY DEFINER, so the REVOKE should not touch it, but "should
    --         not" is a guess until a real member leaves as authenticated.
    SELECT member_count INTO v_mc_before FROM public.communities WHERE id = c_id;
    v_got := '(never ran)'; v_detail := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', u_m::text, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      DELETE FROM public.community_members WHERE community_id = c_id AND user_id = u_m;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      SELECT member_count INTO v_mc_after FROM public.communities WHERE id = c_id;
      v_got := 'deleted=' || v_n;
      RAISE EXCEPTION 'CASE_UNWIND';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'CASE_UNWIND' THEN
        v_got := 'err=' || SQLSTATE; v_detail := SQLERRM;
      END IF;
    END;
    RESET ROLE;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^C14 a member leaving still recomputes member_count through the definer trigger^^%s^^%s, member_count %s -> %s %s',
      v_seq,
      CASE WHEN v_got = 'deleted=1' AND v_mc_after = v_mc_before - 1 THEN 'PASS' ELSE 'FAIL' END,
      v_got, v_mc_before, v_mc_after, v_detail);

    -- ── D1: SUCCESS ARM. The creator deletes with the typed name. KEPT. ───
    --        Surrounding spaces on purpose: the function trims, and so must
    --        the browser, or a stray space from autocomplete refuses a valid
    --        confirmation.
    v_got := '(never ran)'; v_detail := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', u_a::text, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      PERFORM public.soft_delete_community(c_id, '  ' || k_name || ' ');
      RESET ROLE;
      v_got := 'ok';
    EXCEPTION WHEN OTHERS THEN
      v_got := 'err=' || SQLSTATE; v_detail := SQLERRM;
    END;
    RESET ROLE;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^D1 SUCCESS ARM: the creator deletes with the typed name (trimmed)^^%s^^%s, deleted_at=%s %s',
      v_seq,
      CASE WHEN v_got = 'ok' AND (SELECT deleted_at IS NOT NULL FROM public.communities WHERE id = c_id)
           THEN 'PASS' ELSE 'FAIL' END,
      v_got, coalesce((SELECT deleted_at::text FROM public.communities WHERE id = c_id), 'NULL'), v_detail);

    -- ── AFTER the delete. ─────────────────────────────────────────────────
    v_cases := ARRAY[
      format('D2 the deleted community is invisible to its own creator^^A^^count^^rows=0^^SELECT count(*) FROM public.communities WHERE id = %L', c_id),
      format('D3 ... to an admin member^^B^^count^^rows=0^^SELECT count(*) FROM public.communities WHERE id = %L', c_id),
      format('D4 ... and to anon, although it was public^^anon^^count^^rows=0^^SELECT count(*) FROM public.communities WHERE id = %L', c_id),
      format('D5 anon no longer sees its posts (the child policy subquery runs under RLS; compare B3)^^anon^^count^^rows=0^^SELECT count(*) FROM public.community_posts WHERE community_id = %L', c_id),
      format('D6 KNOWN: a member still reads its posts through is_community_member (the app hides the community, see header)^^B^^count^^rows=1^^SELECT count(*) FROM public.community_posts WHERE community_id = %L', c_id),
      format('D7 a second delete is refused as already deleted^^A^^exec^^err=55000^^SELECT public.soft_delete_community(%L, %L)', c_id, k_name),
      format('D8 an admin member cannot edit a deleted community^^B^^exec^^rows=0^^UPDATE public.communities SET name = name || %L WHERE id = %L', ' x', c_id)
    ];

    FOREACH v_case IN ARRAY v_cases LOOP
      c_label  := split_part(v_case, '^^', 1);
      c_actor  := split_part(v_case, '^^', 2);
      c_kind   := split_part(v_case, '^^', 3);
      c_expect := split_part(v_case, '^^', 4);
      c_sql    := split_part(v_case, '^^', 5);
      c_uid    := CASE c_actor WHEN 'A' THEN u_a WHEN 'B' THEN u_b WHEN 'M' THEN u_m ELSE NULL END;
      v_got := '(never ran)'; v_detail := '';
      BEGIN
        IF c_actor = 'anon' THEN
          PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
          SET LOCAL ROLE anon;
        ELSE
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', c_uid::text, 'role', 'authenticated')::text, true);
          SET LOCAL ROLE authenticated;
        END IF;
        IF c_kind = 'count' THEN
          EXECUTE c_sql INTO v_n;
        ELSE
          EXECUTE c_sql;
          GET DIAGNOSTICS v_n = ROW_COUNT;
        END IF;
        v_got := 'rows=' || v_n;
        RAISE EXCEPTION 'CASE_UNWIND';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'CASE_UNWIND' THEN
          -- 42501 has two causes and they prove different things. "permission
          -- denied" is the GRANT refusing; "new row violates" is RLS. C5 is
          -- refused by both after 190, and only the grant is the claim, so the
          -- two are told apart rather than both reading err=42501.
          v_got := CASE
                     WHEN SQLSTATE = '42501' AND SQLERRM LIKE 'permission denied%' THEN 'err=grant'
                     WHEN SQLSTATE = '42501' AND SQLERRM LIKE 'new row violates%'  THEN 'err=rls'
                     ELSE 'err=' || SQLSTATE
                   END;
          v_detail := SQLERRM;
        END IF;
      END;
      RESET ROLE;
      v_seq := v_seq + 1;
      v_res := v_res || format('%s^^%s^^%s^^expected %s, got %s %s',
        v_seq, c_label, CASE WHEN v_got = c_expect THEN 'PASS' ELSE 'FAIL' END, c_expect, v_got, v_detail);
    END LOOP;

    -- ── R1: self-recording. ──────────────────────────────────────────────
    INSERT INTO public.migrations_applied (migration, note)
    VALUES ('190_community_soft_delete', 'rehearsal, rolled back')
    ON CONFLICT (migration) DO NOTHING;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^R1 190 records itself in migrations_applied^^%s^^rows for 190=%s',
      v_seq,
      CASE WHEN EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='190_community_soft_delete')
           THEN 'PASS' ELSE 'FAIL' END,
      (SELECT count(*) FROM public.migrations_applied WHERE migration='190_community_soft_delete'));

    RAISE EXCEPTION 'REHEARSAL_UNWIND';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND' THEN
      v_seq := v_seq + 1;
      v_res := v_res || format('%s^^UNEXPECTED ERROR, the rehearsal did not finish^^FAIL^^%s: %s',
        v_seq, SQLSTATE, SQLERRM);
    END IF;
  END;
  RESET ROLE;

  -- ── Z1: proof the unwind left production exactly as A1 found it. ────────
  SELECT regexp_replace(qual, '\s+', ' ', 'g') INTO v_sel FROM pg_policies
   WHERE schemaname='public' AND tablename='communities' AND cmd='SELECT';
  SELECT regexp_replace(qual, '\s+', ' ', 'g') INTO v_upd FROM pg_policies
   WHERE schemaname='public' AND tablename='communities' AND cmd='UPDATE';
  v_ok := NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='communities' AND column_name='deleted_at')
      AND to_regprocedure('public.soft_delete_community(uuid, text)') IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.communities WHERE name = k_name)
      AND NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='190_community_soft_delete')
      AND v_sel = k_sel_pre AND v_upd = k_upd_pre
      AND has_column_privilege('authenticated', 'public.communities', 'creator_id', 'UPDATE');
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^Z1 the unwind discarded 190 and the fixture, and restored the grant^^%s^^deleted_at=%s, function=%s, fixture rows=%s, migrations_applied 190=%s, policies restored=%s, grant restored=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='communities' AND column_name='deleted_at')
         THEN 'STILL PRESENT' ELSE 'gone' END,
    coalesce(to_regprocedure('public.soft_delete_community(uuid, text)')::text, 'gone'),
    (SELECT count(*) FROM public.communities WHERE name = k_name),
    (SELECT count(*) FROM public.migrations_applied WHERE migration='190_community_soft_delete'),
    (v_sel = k_sel_pre AND v_upd = k_upd_pre),
    has_column_privilege('authenticated', 'public.communities', 'creator_id', 'UPDATE'));

  INSERT INTO reh_190 (seq, arm, verdict, detail)
  SELECT split_part(r,'^^',1)::int, split_part(r,'^^',2), split_part(r,'^^',3), split_part(r,'^^',4)
    FROM unnest(v_res) AS r;
END
$reh$;

-- The one result set. Every row must read PASS. 31 rows, E0 through Z1.
SELECT seq, verdict, arm, detail FROM reh_190 ORDER BY seq;

-- 192_community_banner_storage_scope_REHEARSAL.sql. Dry run of 192. Applies nothing.
--
-- Same construction as 190 and 191: no BEGIN/ROLLBACK (the editor shows only
-- the last statement's result), a plpgsql subtransaction unwound by a
-- deliberate RAISE, verdicts kept in a variable, and Z1 proving the unwind.
--
-- The cases write straight into storage.objects as the authenticated role,
-- which is what the Storage API itself does on upload (INSERT, or INSERT ...
-- ON CONFLICT DO UPDATE for upsert), so the policies are exercised exactly as
-- the app meets them. No file bytes are involved; only the metadata rows, and
-- those are discarded by the unwind.
--
-- WHAT IS WORTH REHEARSING. That 192 closes the hole (B1 and B2 before, C
-- arms after), and that it does not close too much: the creator, an admin member
-- (including on a PRIVATE community, where the communities SELECT policy hides
-- the row from the admin), upsert, cleanup deletes and public reads must all
-- still work (S arms). Every refusal is paired with a success on the same path.
--
-- DELETE ARMS. Newer Supabase storage refuses a direct SQL DELETE on
-- storage.objects with a trigger. E1 reports whether that trigger is here. The
-- runner sets storage.allow_delete_query for delete cases; if the trigger still
-- refuses, those arms read SKIP (the policy is not what refused), and every
-- other row must read PASS.
--
-- FIXTURE: four real non-admin users. A creates three communities (public,
-- private, and one soft-deleted) and O creates one. B is an admin member of
-- A's three; M is a moderator of the public one. O is an outsider to A's.
-- Everything exists only inside the unwind.

DROP TABLE IF EXISTS reh_192;
CREATE TEMP TABLE reh_192 (seq int, arm text, verdict text, detail text);

DO $reh$
DECLARE
  v_res    text[] := '{}';
  v_seq    int    := 0;
  u_a uuid; u_b uuid; u_m uuid; u_o uuid;
  c_pub uuid; c_priv uuid; c_del uuid; c_o uuid;
  v_n      bigint;
  v_got    text;
  v_detail text;
  v_case   text;
  v_cases  text[];
  c_label  text;
  c_actor  text;
  c_expect text;
  c_sql    text;
  c_uid    uuid;
  v_ok     boolean;
  v_verdict text;
  v_names_before text[];
  v_fn_before boolean;
  v_limit_before bigint;
  v_types_before text[];
  v_protect boolean;
  v_names  text[];
  v_open   text;
BEGIN
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^E0 ENV session_user and current_user^^PASS^^session_user=%s  current_user=%s',
    v_seq, session_user, current_user);

  v_protect := EXISTS (SELECT 1 FROM pg_trigger t
                        WHERE t.tgrelid = 'storage.objects'::regclass AND NOT t.tgisinternal
                          AND (t.tgtype & 8) <> 0);  -- 8 = DELETE
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^E1 ENV a DELETE trigger exists on storage.objects (information only)^^PASS^^delete trigger=%s',
    v_seq, v_protect);

  SELECT id INTO u_a FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO u_b FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL AND id <> u_a ORDER BY created_at LIMIT 1;
  SELECT id INTO u_m FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL AND id NOT IN (u_a, u_b) ORDER BY created_at LIMIT 1;
  SELECT id INTO u_o FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL AND id NOT IN (u_a, u_b, u_m) ORDER BY created_at LIMIT 1;

  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_names_before
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
     AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%community-banners%';
  v_fn_before := to_regprocedure('public.can_manage_community_banner(text)') IS NOT NULL;
  SELECT file_size_limit, allowed_mime_types INTO v_limit_before, v_types_before
    FROM storage.buckets WHERE id = 'community-banners';

  v_ok := u_o IS NOT NULL AND cardinality(v_names_before) = 5 AND NOT v_fn_before;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^A1 baseline: the five write policies of 2026-09-25, no helper yet, four users found^^%s^^policies=%s, helper=%s, users=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, v_names_before, v_fn_before,
    (u_a IS NOT NULL)::int + (u_b IS NOT NULL)::int + (u_m IS NOT NULL)::int + (u_o IS NOT NULL)::int);

  IF u_o IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need four non-admin, non-deleted users.';
  END IF;

  BEGIN
    -- ── Fixture ─────────────────────────────────────────────────────────
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 192 Public', u_a, false) RETURNING id INTO c_pub;
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 192 Private', u_a, true) RETURNING id INTO c_priv;
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 192 Deleted', u_a, false) RETURNING id INTO c_del;
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 192 Other', u_o, false) RETURNING id INTO c_o;
    INSERT INTO public.community_members (community_id, user_id, role) VALUES
      (c_pub, u_a, 'admin'), (c_priv, u_a, 'admin'), (c_del, u_a, 'admin'), (c_o, u_o, 'admin'),
      (c_pub, u_b, 'admin'), (c_priv, u_b, 'admin'), (c_del, u_b, 'admin'),
      (c_pub, u_m, 'moderator');
    UPDATE public.communities SET deleted_at = now() WHERE id = c_del;
    INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
      ('community-banners', c_pub  || '/banner.jpg',      '{"size":1000,"mimetype":"image/jpeg"}'),
      ('community-banners', c_pub  || '/banner-123.jpg',  '{"size":1000,"mimetype":"image/jpeg"}'),
      ('community-banners', c_priv || '/banner.jpg',      '{"size":1000,"mimetype":"image/jpeg"}'),
      ('community-banners', c_del  || '/banner.jpg',      '{"size":1000,"mimetype":"image/jpeg"}');

    FOR pass IN 1..2 LOOP
      IF pass = 1 THEN
        v_cases := ARRAY[
          format('B1 BEFORE: an outsider CAN upload into another community''s folder (proves the hole)^^O^^rows=1^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_pub || '/vandal.jpg'),
          format('B2 BEFORE: an outsider CAN overwrite that community''s banner in place^^O^^rows=1^^UPDATE storage.objects SET metadata = ''{"vandal":true}'' WHERE bucket_id = ''community-banners'' AND name = %L', c_pub || '/banner.jpg')
        ];
      ELSE
        -- ══ 192's pre-flight body, wrapper stripped. Must NOT raise. ══════
        v_detail := 'did not raise';
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'community-banners') THEN
            RAISE EXCEPTION '192 ABORTED: the community-banners bucket does not exist.';
          END IF;
          SELECT array_agg(policyname::text ORDER BY policyname) INTO v_names
            FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
             AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-banners%';
          IF v_names IS DISTINCT FROM ARRAY[
               'Authenticated users can update community banners',
               'Authenticated users can upload community banners',
               'Community owners can delete banners',
               'Community owners can update banners',
               'Community owners can upload banners'] THEN
            RAISE EXCEPTION '192 ABORTED: the write policies on community-banners are not the five read on 2026-09-25. Live: %', v_names;
          END IF;
          FOR v_open IN
            SELECT regexp_replace(coalesce(with_check, qual, ''), '\s+', '', 'g')
              FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname IN ('Authenticated users can upload community banners',
                                  'Authenticated users can update community banners')
          LOOP
            IF v_open <> '(bucket_id=''community-banners''::text)' THEN
              RAISE EXCEPTION '192 ABORTED: an open banner policy is no longer bucket-only. Live: %', v_open;
            END IF;
          END LOOP;
        EXCEPTION WHEN OTHERS THEN
          v_detail := SQLSTATE || ': ' || SQLERRM;
        END;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^P1 192''s OWN PRE-FLIGHT passes on this database^^%s^^%s',
          v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

        -- ══ 192 sections 1 to 3, verbatim. ════════════════════════════════
        CREATE OR REPLACE FUNCTION public.can_manage_community_banner(p_folder text)
        RETURNS boolean
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $fn$
        DECLARE
          v_uid uuid := auth.uid();
        BEGIN
          IF v_uid IS NULL OR p_folder IS NULL
             OR p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN false;
          END IF;

          RETURN EXISTS (
            SELECT 1 FROM public.communities c
             WHERE c.id = p_folder::uuid
               AND c.deleted_at IS NULL
               AND (c.creator_id = v_uid
                    OR EXISTS (SELECT 1 FROM public.community_members m
                                WHERE m.community_id = c.id
                                  AND m.user_id = v_uid
                                  AND m.role = 'admin'))
          );
        END;
        $fn$;
        REVOKE ALL ON FUNCTION public.can_manage_community_banner(text) FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.can_manage_community_banner(text) TO authenticated;

        DROP POLICY IF EXISTS "Authenticated users can upload community banners" ON storage.objects;
        DROP POLICY IF EXISTS "Authenticated users can update community banners" ON storage.objects;
        DROP POLICY IF EXISTS "Community owners can upload banners" ON storage.objects;
        DROP POLICY IF EXISTS "Community owners can update banners" ON storage.objects;
        DROP POLICY IF EXISTS "Community owners can delete banners" ON storage.objects;

        DROP POLICY IF EXISTS "Community managers can upload banners" ON storage.objects;
        CREATE POLICY "Community managers can upload banners"
          ON storage.objects FOR INSERT
          TO authenticated
          WITH CHECK (
            bucket_id = 'community-banners'
            AND public.can_manage_community_banner((storage.foldername(name))[1])
          );
        DROP POLICY IF EXISTS "Community managers can update banners" ON storage.objects;
        CREATE POLICY "Community managers can update banners"
          ON storage.objects FOR UPDATE
          TO authenticated
          USING (
            bucket_id = 'community-banners'
            AND public.can_manage_community_banner((storage.foldername(name))[1])
          )
          WITH CHECK (
            bucket_id = 'community-banners'
            AND public.can_manage_community_banner((storage.foldername(name))[1])
          );
        DROP POLICY IF EXISTS "Community managers can delete banners" ON storage.objects;
        CREATE POLICY "Community managers can delete banners"
          ON storage.objects FOR DELETE
          TO authenticated
          USING (
            bucket_id = 'community-banners'
            AND public.can_manage_community_banner((storage.foldername(name))[1])
          );

        UPDATE storage.buckets
           SET file_size_limit = 5242880,
               allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
         WHERE id = 'community-banners';

        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^A2 192 sections 1 to 3 applied inside the subtransaction^^PASS^^helper, 3 policies, bucket limits', v_seq);

        -- ══ 192's guard body, wrapper stripped. Must NOT raise. ════════════
        v_detail := 'did not raise';
        BEGIN
          SELECT count(*) INTO v_n FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
             AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-banners%'
             AND position('can_manage_community_banner' IN coalesce(qual, '') || coalesce(with_check, '')) = 0;
          IF v_n <> 0 THEN
            RAISE EXCEPTION '192 ABORTED: % write policy(ies) on community-banners do not check can_manage_community_banner.', v_n;
          END IF;
          SELECT count(*) INTO v_n FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
             AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-banners%';
          IF v_n <> 3 THEN
            RAISE EXCEPTION '192 ABORTED: expected 3 write policies on community-banners, found %.', v_n;
          END IF;
          IF (SELECT count(DISTINCT cmd) FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname LIKE 'Community managers can % banners') <> 3 THEN
            RAISE EXCEPTION '192 ABORTED: the INSERT, UPDATE and DELETE banner policies are not all present.';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'storage' AND tablename = 'objects'
                            AND policyname = 'Community managers can update banners'
                            AND position('can_manage_community_banner' IN coalesce(with_check, '')) > 0) THEN
            RAISE EXCEPTION '192 ABORTED: the banner UPDATE policy has no WITH CHECK.';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'storage' AND tablename = 'objects'
                            AND policyname = 'Anyone can read community banners' AND cmd = 'SELECT')
             OR NOT (SELECT public FROM storage.buckets WHERE id = 'community-banners') THEN
            RAISE EXCEPTION '192 ABORTED: community banners are no longer publicly readable.';
          END IF;
          IF NOT has_function_privilege('authenticated', 'public.can_manage_community_banner(text)', 'EXECUTE') THEN
            RAISE EXCEPTION '192 ABORTED: authenticated cannot execute can_manage_community_banner; every banner upload would fail.';
          END IF;
          IF has_function_privilege('anon', 'public.can_manage_community_banner(text)', 'EXECUTE') THEN
            RAISE EXCEPTION '192 ABORTED: anon can execute can_manage_community_banner.';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM storage.buckets
                          WHERE id = 'community-banners'
                            AND file_size_limit = 5242880
                            AND allowed_mime_types @> ARRAY['image/jpeg']
                            AND NOT allowed_mime_types && ARRAY['image/svg+xml', 'text/html']) THEN
            RAISE EXCEPTION '192 ABORTED: the community-banners bucket limits did not apply.';
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_detail := SQLSTATE || ': ' || SQLERRM;
        END;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^G1 192''s OWN GUARD BODY runs green on this database^^%s^^%s',
          v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

        v_cases := ARRAY[
          -- Refusals. Each has a matching success below.
          format('C1 outsider can NO LONGER upload into another community''s folder (same write as B1)^^O^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_pub || '/vandal.jpg'),
          format('C2 outsider can NO LONGER overwrite that banner (same write as B2)^^O^^rows=0^^UPDATE storage.objects SET metadata = ''{"vandal":true}'' WHERE bucket_id = ''community-banners'' AND name = %L', c_pub || '/banner.jpg'),
          format('C3 outsider cannot upsert over that banner (the Storage API upsert path)^^O^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L) ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = ''{"vandal":true}''', c_pub || '/banner.jpg'),
          format('C4 outsider cannot delete that banner^^O^^rows=0^^DELETE FROM storage.objects WHERE bucket_id = ''community-banners'' AND name = %L', c_pub || '/banner.jpg'),
          format('C5 a moderator cannot upload (matches the UI since T-COMM2)^^M^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_pub || '/mod.jpg'),
          format('C6 a moderator cannot overwrite^^M^^rows=0^^UPDATE storage.objects SET metadata = ''{"m":1}'' WHERE bucket_id = ''community-banners'' AND name = %L', c_pub || '/banner.jpg'),
          format('C7 an admin of one community cannot upload into a community they do not manage^^B^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_o || '/b.jpg'),
          format('C8 the creator cannot upload to a SOFT-DELETED community^^A^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_del || '/new.jpg'),
          format('C9 the creator cannot overwrite a soft-deleted community''s banner^^A^^rows=0^^UPDATE storage.objects SET metadata = ''{"a":1}'' WHERE bucket_id = ''community-banners'' AND name = %L', c_del || '/banner.jpg'),
          'C10 a folder that is not a UUID is refused, not a cast error^^A^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', ''not-a-uuid/x.jpg'')',
          'C11 a file at the bucket root (no folder) is refused^^A^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', ''x.jpg'')',
          format('C12 an admin cannot move a banner into a folder they do not manage (UPDATE WITH CHECK)^^B^^err=rls^^UPDATE storage.objects SET name = %L WHERE bucket_id = ''community-banners'' AND name = %L', c_o || '/moved.jpg', c_pub || '/banner-123.jpg'),
          format('C13 signed out (anon) cannot upload^^anon^^err=rls^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_pub || '/anon.jpg'),
          -- Successes.
          format('S1 the creator uploads a new banner^^A^^rows=1^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_pub || '/banner-new.jpg'),
          format('S2 the creator upserts over the fixed banner path (what the app now does every time)^^A^^rows=1^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L) ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = ''{"a":2}''', c_pub || '/banner.jpg'),
          format('S3 an admin member (not creator) now uploads into the public community (gained)^^B^^rows=1^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_pub || '/by-admin.jpg'),
          format('S4 an admin member of a PRIVATE community overwrites its banner (the communities SELECT policy hides that row from them)^^B^^rows=1^^UPDATE storage.objects SET metadata = ''{"b":2}'' WHERE bucket_id = ''community-banners'' AND name = %L', c_priv || '/banner.jpg'),
          format('S5 an admin upserts over a private community''s banner^^B^^rows=1^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L) ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = ''{"b":3}''', c_priv || '/banner.jpg'),
          format('S6 the creator deletes an old banner file (the app''s cleanup after a save)^^A^^rows=1^^DELETE FROM storage.objects WHERE bucket_id = ''community-banners'' AND name = %L', c_pub || '/banner-123.jpg'),
          format('S7 an admin deletes an old file in a private community^^B^^rows=1^^DELETE FROM storage.objects WHERE bucket_id = ''community-banners'' AND name = %L', c_priv || '/banner.jpg'),
          format('S8 an admin renames within the same community (UPDATE WITH CHECK passes)^^B^^rows=1^^UPDATE storage.objects SET name = %L WHERE bucket_id = ''community-banners'' AND name = %L', c_pub || '/renamed.jpg', c_pub || '/banner-123.jpg'),
          format('S9 signed out (anon) still reads a banner (bucket stays public)^^anon^^rows=1^^SELECT 1 FROM storage.objects WHERE bucket_id = ''community-banners'' AND name = %L', c_pub || '/banner.jpg'),
          format('S10 the outsider still manages their OWN community''s banner^^O^^rows=1^^INSERT INTO storage.objects (bucket_id, name) VALUES (''community-banners'', %L)', c_o || '/banner.jpg')
        ];
      END IF;

      FOREACH v_case IN ARRAY v_cases LOOP
        c_label  := split_part(v_case, '^^', 1);
        c_actor  := split_part(v_case, '^^', 2);
        c_expect := split_part(v_case, '^^', 3);
        c_sql    := split_part(v_case, '^^', 4);
        c_uid    := CASE c_actor WHEN 'A' THEN u_a WHEN 'B' THEN u_b WHEN 'M' THEN u_m WHEN 'O' THEN u_o ELSE NULL END;
        v_got := '(never ran)'; v_detail := '';
        BEGIN
          -- Lets a delete case reach the policy on storage versions that
          -- block direct SQL deletes. Transaction-local, unwound with the case.
          PERFORM set_config('storage.allow_delete_query', 'true', true);
          IF c_actor = 'anon' THEN
            PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
            SET LOCAL ROLE anon;
          ELSE
            PERFORM set_config('request.jwt.claims',
              json_build_object('sub', c_uid::text, 'role', 'authenticated')::text, true);
            SET LOCAL ROLE authenticated;
          END IF;
          EXECUTE c_sql;
          GET DIAGNOSTICS v_n = ROW_COUNT;
          v_got := 'rows=' || v_n;
          RAISE EXCEPTION 'CASE_UNWIND';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM <> 'CASE_UNWIND' THEN
            v_got := CASE
                       WHEN SQLSTATE = '42501' AND SQLERRM LIKE '%row-level security%' THEN 'err=rls'
                       WHEN SQLSTATE = '42501' AND SQLERRM LIKE 'permission denied%' THEN 'err=grant'
                       ELSE 'err=' || SQLSTATE
                     END;
            v_detail := SQLERRM;
          END IF;
        END;
        RESET ROLE;
        v_verdict := CASE
                       WHEN v_got = c_expect THEN 'PASS'
                       WHEN c_sql LIKE 'DELETE%' AND v_detail ILIKE '%direct deletion%' THEN 'SKIP'
                       ELSE 'FAIL'
                     END;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^%s^^%s^^expected %s, got %s %s',
          v_seq, c_label, v_verdict, c_expect, v_got, v_detail);
      END LOOP;
    END LOOP;

    INSERT INTO public.migrations_applied (migration, note)
    VALUES ('192_community_banner_storage_scope', 'rehearsal, rolled back')
    ON CONFLICT (migration) DO NOTHING;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^R1 192 records itself in migrations_applied^^%s^^rows for 192=%s', v_seq,
      CASE WHEN EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='192_community_banner_storage_scope')
           THEN 'PASS' ELSE 'FAIL' END,
      (SELECT count(*) FROM public.migrations_applied WHERE migration='192_community_banner_storage_scope'));

    RAISE EXCEPTION 'REHEARSAL_UNWIND';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND' THEN
      v_seq := v_seq + 1;
      v_res := v_res || format('%s^^UNEXPECTED ERROR, the rehearsal did not finish^^FAIL^^%s: %s', v_seq, SQLSTATE, SQLERRM);
    END IF;
  END;
  RESET ROLE;

  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_names
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
     AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%community-banners%';
  v_ok := v_names IS NOT DISTINCT FROM v_names_before
      AND (to_regprocedure('public.can_manage_community_banner(text)') IS NOT NULL) = v_fn_before
      AND (SELECT file_size_limit FROM storage.buckets WHERE id = 'community-banners') IS NOT DISTINCT FROM v_limit_before
      AND (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'community-banners') IS NOT DISTINCT FROM v_types_before
      AND NOT EXISTS (SELECT 1 FROM public.communities WHERE name LIKE 'Rehearsal 192 %')
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'community-banners'
                         AND o.name IN (c_pub || '/banner.jpg', c_o || '/banner.jpg', 'not-a-uuid/x.jpg', 'x.jpg'))
      AND NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='192_community_banner_storage_scope');
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^Z1 the unwind restored policies, helper, bucket limits, and discarded the fixture^^%s^^policies back=%s, helper present=%s, size limit=%s, fixture communities=%s, migrations_applied 192=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    v_names IS NOT DISTINCT FROM v_names_before,
    to_regprocedure('public.can_manage_community_banner(text)') IS NOT NULL,
    coalesce((SELECT file_size_limit::text FROM storage.buckets WHERE id = 'community-banners'), 'none'),
    (SELECT count(*) FROM public.communities WHERE name LIKE 'Rehearsal 192 %'),
    (SELECT count(*) FROM public.migrations_applied WHERE migration='192_community_banner_storage_scope'));

  INSERT INTO reh_192 (seq, arm, verdict, detail)
  SELECT split_part(r,'^^',1)::int, split_part(r,'^^',2), split_part(r,'^^',3), split_part(r,'^^',4)
    FROM unnest(v_res) AS r;
END
$reh$;

-- The one result set. 33 rows, E0 through Z1. Every row must read PASS; the
-- three delete arms (C4, S6, S7, and no others) may read SKIP only if E1
-- says a delete trigger exists.
SELECT seq, verdict, arm, detail FROM reh_192 ORDER BY seq;

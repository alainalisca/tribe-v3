-- 193_private_communities_visible_to_members_REHEARSAL.sql. Dry run of 193. Applies nothing.
--
-- Same construction as 190 to 192: no BEGIN/ROLLBACK, a plpgsql
-- subtransaction unwound by a deliberate RAISE, verdicts kept in a variable,
-- Z1 proving the unwind.
--
-- WHAT IS WORTH REHEARSING. That members see their private community (B arms
-- show they cannot today, C1 to C4 show they can after), and that nobody else
-- gains anything: outsiders, signed-out visitors, deleted communities and
-- non-admin writes stay exactly as they are (C5 to C12). C13 reads
-- community_members as a member, because that table's read policy queries
-- communities and a loop between the two policies would show up there as an
-- error, not a wrong count.
--
-- FIXTURE: four real non-admin users. A creates a private, a public and a
-- soft-deleted private community. B is an admin member and M a plain member
-- of the private ones. O is an outsider. Everything exists only inside the
-- unwind.

DROP TABLE IF EXISTS reh_193;
CREATE TEMP TABLE reh_193 (seq int, arm text, verdict text, detail text);

DO $reh$
DECLARE
  v_res    text[] := '{}';
  v_seq    int    := 0;
  u_a uuid; u_b uuid; u_m uuid; u_o uuid;
  c_priv uuid; c_pub uuid; c_del uuid;
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
  v_qual   text;
  v_qual_before text;
BEGIN
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^E0 ENV session_user and current_user^^PASS^^session_user=%s  current_user=%s',
    v_seq, session_user, current_user);

  SELECT id INTO u_a FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO u_b FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL AND id <> u_a ORDER BY created_at LIMIT 1;
  SELECT id INTO u_m FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL AND id NOT IN (u_a, u_b) ORDER BY created_at LIMIT 1;
  SELECT id INTO u_o FROM public.users WHERE coalesce(is_admin,false) = false AND deleted_at IS NULL AND id NOT IN (u_a, u_b, u_m) ORDER BY created_at LIMIT 1;

  SELECT qual INTO v_qual_before FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities' AND policyname = 'Public communities are visible to all';
  v_ok := u_o IS NOT NULL AND v_qual_before IS NOT NULL AND position('is_community_member' IN v_qual_before) = 0;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^A1 baseline: the read policy of 2026-09-25, four users found^^%s^^policy=%s, users=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, regexp_replace(coalesce(v_qual_before,'(none)'), '\s+', ' ', 'g'),
    (u_a IS NOT NULL)::int + (u_b IS NOT NULL)::int + (u_m IS NOT NULL)::int + (u_o IS NOT NULL)::int);

  IF u_o IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need four non-admin, non-deleted users.';
  END IF;

  BEGIN
    -- ── Fixture ─────────────────────────────────────────────────────────
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 193 Private', u_a, true) RETURNING id INTO c_priv;
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 193 Public', u_a, false) RETURNING id INTO c_pub;
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 193 Deleted', u_a, true) RETURNING id INTO c_del;
    INSERT INTO public.community_members (community_id, user_id, role) VALUES
      (c_priv, u_a, 'admin'), (c_priv, u_b, 'admin'), (c_priv, u_m, 'member'),
      (c_pub, u_a, 'admin'),
      (c_del, u_a, 'admin'), (c_del, u_m, 'member');
    UPDATE public.communities SET deleted_at = now() WHERE id = c_del;

    FOR pass IN 1..2 LOOP
      IF pass = 1 THEN
        v_cases := ARRAY[
          format('B1 BEFORE: a member CANNOT see their own private community (proves the bug)^^M^^rows=0^^SELECT count(*) FROM public.communities WHERE id = %L', c_priv),
          format('B2 BEFORE: an admin (not creator) cannot edit it; the save updates nothing^^B^^rows=0^^WITH u AS (UPDATE public.communities SET description = ''b'' WHERE id = %L RETURNING id) SELECT count(*) FROM u', c_priv)
        ];
      ELSE
        -- ══ 193's pre-flight body, wrapper stripped. Must NOT raise. ══════
        v_detail := 'did not raise';
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
        EXCEPTION WHEN OTHERS THEN
          v_detail := SQLSTATE || ': ' || SQLERRM;
        END;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^P1 193''s OWN PRE-FLIGHT passes on this database^^%s^^%s',
          v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

        -- ══ 193 section 1, verbatim. ══════════════════════════════════════
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
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^A2 193 section 1 applied inside the subtransaction^^PASS^^policy recreated with the member arm', v_seq);

        -- ══ 193's guard body, wrapper stripped. Must NOT raise. ════════════
        v_detail := 'did not raise';
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
        EXCEPTION WHEN OTHERS THEN
          v_detail := SQLSTATE || ': ' || SQLERRM;
        END;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^G1 193''s OWN GUARD BODY runs green on this database^^%s^^%s',
          v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

        v_cases := ARRAY[
          -- Gains.
          format('C1 a member now sees their private community (same read as B1)^^M^^rows=1^^SELECT count(*) FROM public.communities WHERE id = %L', c_priv),
          format('C2 an admin (not creator) sees it^^B^^rows=1^^SELECT count(*) FROM public.communities WHERE id = %L', c_priv),
          format('C3 that admin''s edit now saves (same write as B2)^^B^^rows=1^^WITH u AS (UPDATE public.communities SET description = ''b'' WHERE id = %L RETURNING id) SELECT count(*) FROM u', c_priv),
          format('C4 the creator still sees it^^A^^rows=1^^SELECT count(*) FROM public.communities WHERE id = %L', c_priv),
          -- Unchanged.
          format('C5 an outsider still cannot see it^^O^^rows=0^^SELECT count(*) FROM public.communities WHERE id = %L', c_priv),
          format('C6 signed out (anon) still cannot see it^^anon^^rows=0^^SELECT count(*) FROM public.communities WHERE id = %L', c_priv),
          format('C7 signed out (anon) still sees a PUBLIC community^^anon^^rows=1^^SELECT count(*) FROM public.communities WHERE id = %L', c_pub),
          format('C8 an outsider still sees a public community^^O^^rows=1^^SELECT count(*) FROM public.communities WHERE id = %L', c_pub),
          format('C9 a member of a SOFT-DELETED private community still cannot see it^^M^^rows=0^^SELECT count(*) FROM public.communities WHERE id = %L', c_del),
          format('C10 a plain member still cannot edit (UPDATE policy unchanged)^^M^^rows=0^^WITH u AS (UPDATE public.communities SET description = ''m'' WHERE id = %L RETURNING id) SELECT count(*) FROM u', c_priv),
          format('C11 an outsider still cannot edit^^O^^rows=0^^WITH u AS (UPDATE public.communities SET description = ''o'' WHERE id = %L RETURNING id) SELECT count(*) FROM u', c_priv),
          format('C12 an outsider cannot see a private community by listing either^^O^^rows=0^^SELECT count(*) FROM public.communities WHERE name LIKE %L AND is_private', 'Rehearsal 193 %'),
          format('C13 a member reads the private community''s member list without a policy loop^^M^^rows=3^^SELECT count(*) FROM public.community_members WHERE community_id = %L', c_priv)
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
          IF c_actor = 'anon' THEN
            PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
            SET LOCAL ROLE anon;
          ELSE
            PERFORM set_config('request.jwt.claims',
              json_build_object('sub', c_uid::text, 'role', 'authenticated')::text, true);
            SET LOCAL ROLE authenticated;
          END IF;
          EXECUTE c_sql INTO v_n;
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
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^%s^^%s^^expected %s, got %s %s',
          v_seq, c_label, CASE WHEN v_got = c_expect THEN 'PASS' ELSE 'FAIL' END, c_expect, v_got, v_detail);
      END LOOP;
    END LOOP;

    INSERT INTO public.migrations_applied (migration, note)
    VALUES ('193_private_communities_visible_to_members', 'rehearsal, rolled back')
    ON CONFLICT (migration) DO NOTHING;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^R1 193 records itself in migrations_applied^^%s^^rows for 193=%s', v_seq,
      CASE WHEN EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='193_private_communities_visible_to_members')
           THEN 'PASS' ELSE 'FAIL' END,
      (SELECT count(*) FROM public.migrations_applied WHERE migration='193_private_communities_visible_to_members'));

    RAISE EXCEPTION 'REHEARSAL_UNWIND';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND' THEN
      v_seq := v_seq + 1;
      v_res := v_res || format('%s^^UNEXPECTED ERROR, the rehearsal did not finish^^FAIL^^%s: %s', v_seq, SQLSTATE, SQLERRM);
    END IF;
  END;
  RESET ROLE;

  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'communities' AND policyname = 'Public communities are visible to all';
  v_ok := v_qual IS NOT DISTINCT FROM v_qual_before
      AND NOT EXISTS (SELECT 1 FROM public.communities WHERE name LIKE 'Rehearsal 193 %')
      AND NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='193_private_communities_visible_to_members');
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^Z1 the unwind restored the policy and discarded the fixture^^%s^^policy back=%s, fixture communities=%s, migrations_applied 193=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    v_qual IS NOT DISTINCT FROM v_qual_before,
    (SELECT count(*) FROM public.communities WHERE name LIKE 'Rehearsal 193 %'),
    (SELECT count(*) FROM public.migrations_applied WHERE migration='193_private_communities_visible_to_members'));

  INSERT INTO reh_193 (seq, arm, verdict, detail)
  SELECT split_part(r,'^^',1)::int, split_part(r,'^^',2), split_part(r,'^^',3), split_part(r,'^^',4)
    FROM unnest(v_res) AS r;
END
$reh$;

-- The one result set. Every row must read PASS. 22 rows, E0 through Z1.
SELECT seq, verdict, arm, detail FROM reh_193 ORDER BY seq;

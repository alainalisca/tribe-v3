-- 191_close_open_community_comments_read_REHEARSAL.sql. Dry run of 191. Applies nothing.
--
-- Same construction as 190's rehearsal: no BEGIN/ROLLBACK (the editor shows
-- only the last statement's result), a plpgsql subtransaction unwound by a
-- deliberate RAISE, verdicts kept in variables, and Z1 proving the unwind.
--
-- WHAT IS WORTH REHEARSING. 191 only drops a policy, so the risk is not that
-- it fails to close the hole. It is that it closes too much: public comments
-- going dark for signed-out visitors, or members losing their own private
-- community's comments. So every refusal arm is paired with a success arm on
-- the public community and on the member.
--
-- B1/B2 run BEFORE 191 and must show the hole (anon and a non-member read a
-- private comment). C1/C2 run the same reads after and must show it closed.
--
-- FIXTURE: two real non-admin users. A creates two communities, one public
-- and one private, with one post and one comment each. B is a member of
-- neither and plays the outsider. Everything exists only inside the unwind.

DROP TABLE IF EXISTS reh_191;
CREATE TEMP TABLE reh_191 (seq int, arm text, verdict text, detail text);

DO $reh$
DECLARE
  v_res    text[] := '{}';
  v_seq    int    := 0;
  u_a      uuid;
  u_b      uuid;
  c_pub    uuid;
  c_priv   uuid;
  p_pub    uuid;
  p_priv   uuid;
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
  v_open_before boolean;
BEGIN
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^E0 ENV session_user and current_user (PostgREST connects as authenticator)^^PASS^^session_user=%s  current_user=%s',
    v_seq, session_user, current_user);

  SELECT id INTO u_a FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO u_b FROM public.users
   WHERE coalesce(is_admin, false) = false AND deleted_at IS NULL AND id <> u_a ORDER BY created_at LIMIT 1;

  v_open_before := EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='public' AND tablename='community_post_comments'
                              AND policyname='Users can read comments on visible posts');
  v_ok := u_a IS NOT NULL AND u_b IS NOT NULL AND v_open_before
      AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='community_post_comments' AND policyname='community_post_comments_select');
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^A1 baseline: open policy present, scoped policy present, two users found^^%s^^open=%s, users=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, v_open_before,
    (u_a IS NOT NULL)::int + (u_b IS NOT NULL)::int);

  IF u_a IS NULL OR u_b IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORTED: need two non-admin, non-deleted users.';
  END IF;

  BEGIN
    -- ── Fixture ─────────────────────────────────────────────────────────
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 191 Public', u_a, false) RETURNING id INTO c_pub;
    INSERT INTO public.communities (name, creator_id, is_private) VALUES ('Rehearsal 191 Private', u_a, true) RETURNING id INTO c_priv;
    INSERT INTO public.community_members (community_id, user_id, role) VALUES (c_pub, u_a, 'admin'), (c_priv, u_a, 'admin');
    INSERT INTO public.community_posts (community_id, author_id, content) VALUES (c_pub, u_a, 'rehearsal 191 public post') RETURNING id INTO p_pub;
    INSERT INTO public.community_posts (community_id, author_id, content) VALUES (c_priv, u_a, 'rehearsal 191 private post') RETURNING id INTO p_priv;
    INSERT INTO public.community_post_comments (post_id, author_id, content) VALUES
      (p_pub, u_a, 'rehearsal 191 public comment'), (p_priv, u_a, 'rehearsal 191 private comment');

    FOR pass IN 1..2 LOOP
      IF pass = 1 THEN
        v_cases := ARRAY[
          format('B1 BEFORE: anon CAN read a comment in a private community (proves the hole)^^anon^^rows=1^^SELECT count(*) FROM public.community_post_comments WHERE post_id = %L', p_priv),
          format('B2 BEFORE: a signed-in non-member CAN read it too^^B^^rows=1^^SELECT count(*) FROM public.community_post_comments WHERE post_id = %L', p_priv)
        ];
      ELSE
        -- ══ 191's fix, verbatim. ═════════════════════════════════════════
        DROP POLICY IF EXISTS "Users can read comments on visible posts" ON public.community_post_comments;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^A2 191 section 1 applied inside the subtransaction^^PASS^^open policy dropped', v_seq);

        -- 191's guard body, wrapper stripped. Must NOT raise.
        v_detail := 'did not raise';
        BEGIN
          SELECT count(*) INTO v_n FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'community_post_comments'
             AND cmd IN ('SELECT', 'ALL')
             AND regexp_replace(coalesce(qual, ''), '\s+', '', 'g') IN ('true', '(true)');
          IF v_n <> 0 THEN RAISE EXCEPTION '191 ABORTED: % open SELECT policy(ies) still on community_post_comments.', v_n; END IF;
          SELECT count(*) INTO v_n FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'community_post_comments' AND cmd IN ('SELECT', 'ALL');
          IF v_n <> 1 THEN RAISE EXCEPTION '191 ABORTED: expected exactly 1 read policy on community_post_comments, found %.', v_n; END IF;
          IF NOT has_table_privilege('anon', 'public.community_post_comments', 'SELECT') THEN
            RAISE EXCEPTION '191 ABORTED: anon lost SELECT on community_post_comments.';
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_detail := SQLSTATE || ': ' || SQLERRM;
        END;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^G1 191''s OWN GUARD BODY runs green on this database^^%s^^%s',
          v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

        v_cases := ARRAY[
          format('C1 AFTER: anon can NO LONGER read the private comment (same read as B1)^^anon^^rows=0^^SELECT count(*) FROM public.community_post_comments WHERE post_id = %L', p_priv),
          format('C2 AFTER: the non-member can no longer read it (same read as B2)^^B^^rows=0^^SELECT count(*) FROM public.community_post_comments WHERE post_id = %L', p_priv),
          format('C3 SUCCESS: a member of the private community still reads its comment^^A^^rows=1^^SELECT count(*) FROM public.community_post_comments WHERE post_id = %L', p_priv),
          format('C4 SUCCESS: anon still reads comments in a PUBLIC community^^anon^^rows=1^^SELECT count(*) FROM public.community_post_comments WHERE post_id = %L', p_pub),
          format('C5 SUCCESS: a signed-in non-member still reads public comments^^B^^rows=1^^SELECT count(*) FROM public.community_post_comments WHERE post_id = %L', p_pub)
        ];
      END IF;

      FOREACH v_case IN ARRAY v_cases LOOP
        c_label  := split_part(v_case, '^^', 1);
        c_actor  := split_part(v_case, '^^', 2);
        c_expect := split_part(v_case, '^^', 3);
        c_sql    := split_part(v_case, '^^', 4);
        c_uid    := CASE c_actor WHEN 'A' THEN u_a WHEN 'B' THEN u_b ELSE NULL END;
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
          IF SQLERRM <> 'CASE_UNWIND' THEN v_got := 'err=' || SQLSTATE; v_detail := SQLERRM; END IF;
        END;
        RESET ROLE;
        v_seq := v_seq + 1;
        v_res := v_res || format('%s^^%s^^%s^^expected %s, got %s %s',
          v_seq, c_label, CASE WHEN v_got = c_expect THEN 'PASS' ELSE 'FAIL' END, c_expect, v_got, v_detail);
      END LOOP;
    END LOOP;

    INSERT INTO public.migrations_applied (migration, note)
    VALUES ('191_close_open_community_comments_read', 'rehearsal, rolled back')
    ON CONFLICT (migration) DO NOTHING;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s^^R1 191 records itself in migrations_applied^^%s^^rows for 191=%s', v_seq,
      CASE WHEN EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='191_close_open_community_comments_read')
           THEN 'PASS' ELSE 'FAIL' END,
      (SELECT count(*) FROM public.migrations_applied WHERE migration='191_close_open_community_comments_read'));

    RAISE EXCEPTION 'REHEARSAL_UNWIND';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND' THEN
      v_seq := v_seq + 1;
      v_res := v_res || format('%s^^UNEXPECTED ERROR, the rehearsal did not finish^^FAIL^^%s: %s', v_seq, SQLSTATE, SQLERRM);
    END IF;
  END;
  RESET ROLE;

  v_ok := EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_post_comments'
                   AND policyname='Users can read comments on visible posts') = v_open_before
      AND NOT EXISTS (SELECT 1 FROM public.communities WHERE name LIKE 'Rehearsal 191 %')
      AND NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='191_close_open_community_comments_read');
  v_seq := v_seq + 1;
  v_res := v_res || format('%s^^Z1 the unwind restored the policy and discarded the fixture^^%s^^open policy back=%s, fixture communities=%s, migrations_applied 191=%s',
    v_seq, CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_post_comments'
             AND policyname='Users can read comments on visible posts'),
    (SELECT count(*) FROM public.communities WHERE name LIKE 'Rehearsal 191 %'),
    (SELECT count(*) FROM public.migrations_applied WHERE migration='191_close_open_community_comments_read'));

  INSERT INTO reh_191 (seq, arm, verdict, detail)
  SELECT split_part(r,'^^',1)::int, split_part(r,'^^',2), split_part(r,'^^',3), split_part(r,'^^',4)
    FROM unnest(v_res) AS r;
END
$reh$;

-- The one result set. Every row must read PASS. 13 rows, E0 through Z1.
SELECT seq, verdict, arm, detail FROM reh_191 ORDER BY seq;

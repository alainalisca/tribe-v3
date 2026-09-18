-- 172_reviews_self_review_policy.sql
--
-- T-AUD12, database half. Closes self-review and review misattribution at the
-- RLS layer, removes the one self-review row on production, and repairs the two
-- users.average_rating values that are wrong today.
--
-- WHY THIS EXISTS AT ALL: BOTH GUARDS WERE HELD SHUT BY THE SAME DATA MIGRATION.
--
-- The display guard: PostSessionFlow asks the viewer to rate the host, and its
-- call site had no !isCreator. It only failed to open for hosts because
-- `hasJoined` is computed from session_participants rows, and migration 169
-- deleted every host's row on 2026-09-17.
--
-- The RLS guard: the live INSERT policy on public.reviews requires a CONFIRMED
-- PARTICIPANT ROW for auth.uid(). Hosts had one -- until 169 deleted it.
--
-- So the same data migration was, by accident, the only thing preventing a
-- self-review at either layer. Neither was by design. Anything that gives a
-- host a participant row again reopens both. Commit 566721a made the display
-- guard explicit; this makes the database guard explicit.
--
-- MEASURED ON PRODUCTION 2026-09-18, in the live catalog:
--   policies on public.reviews mentioning host_id ......................... 0
--   rls_enabled on public.reviews ..................................... true
--   rows where reviewer_id = host_id ...................................... 1
--   live INSERT policy WITH CHECK:
--     auth.uid() = reviewer_id
--     AND EXISTS (SELECT 1 FROM session_participants
--                 WHERE session_id = reviews.session_id
--                   AND user_id = auth.uid() AND status = 'confirmed')
--
-- supabase/migrations/add_reviews.sql contains a policy carrying
-- `AND host_id != auth.uid()`. IT IS NOT IN THE DATABASE AND NEVER WAS. That
-- file sits outside the numbered series and its contents do not match
-- production, so nothing in it may be assumed applied -- including its
-- update_host_average_rating trigger. Capturing it is DB-02 work and is
-- deliberately NOT done here; see supabase/captures/capture_reviews_live.sql.
--
-- ---------------------------------------------------------------------------
-- PART A: the INSERT policy
-- ---------------------------------------------------------------------------
-- Two clauses are added, and each fails for its own reason:
--
--   host_id = the session's creator_id
--     The live policy constrains host_id NOT AT ALL, so any confirmed
--     participant can file a review against an arbitrary user -- a 1-star
--     review against someone who never hosted the session. Unexploited today
--     (all 6 rows match) but unenforced. Fixing self-review without this would
--     mean rewriting the same policy twice.
--
--   auth.uid() <> the session's creator_id
--     The host exclusion itself, stated explicitly rather than inherited from
--     the absence of a participant row.
--
-- NOTE: `sessions` has NO host_id column. The session's host is
-- sessions.creator_id; reviews.host_id is a separate denormalised column on
-- reviews. Writing `host_id != auth.uid()` alone -- as add_reviews.sql does --
-- would only check the value the client SENT, which the client controls.
--
-- FAIL-CLOSED: if reviews.session_id names no session, both subqueries return
-- NULL, the comparisons are NULL, and a NULL WITH CHECK rejects the row. That
-- is the behaviour we want and it is asserted in the rehearsal.
--
-- THE POLICY IS DROPPED BY ITS CAPTURED NAME, NOT A GUESSED ONE. The live name
-- matches no migration file in this repo, so the block below reads it from
-- pg_policies rather than assuming. If there is not exactly one INSERT policy,
-- it aborts rather than guessing which to replace.
--
-- ---------------------------------------------------------------------------
-- PART B: the one self-review row
-- ---------------------------------------------------------------------------
--   id          47e91379-e421-451c-8ade-c9b06de8d8f0
--   reviewer_id eaff348f-5df3-4df5-bd80-69ec233aad0e
--   host_id     eaff348f-5df3-4df5-bd80-69ec233aad0e   (both -- Darian)
--   session_id  21a301f1-3c77-4551-a527-00d38943362e
--   rating      5
--   created_at  2026-09-15T22:29:46.703765+00:00
--
-- That session is one of the 23 migration 169 cleaned up, which is the whole
-- mechanism in one line: the host had a participant row, so hasJoined was true,
-- so the post-session flow opened and offered them a rating of themselves.
--
-- Keyed on the REVIEW's id with the session id asserted alongside, not the
-- other way round. (The session id circulated in one hand-off as
-- ...-a297-... ; the live value is ...-a527-... . Reading it from the database
-- is why that did not become the predicate.)
--
-- ---------------------------------------------------------------------------
-- PART C: two rating repairs
-- ---------------------------------------------------------------------------
--   Darian    eaff348f  stored 5 / 1  ->  NULL / 0   (his only review is the
--                                                     self-review being deleted)
--   Caroline  1848555a  stored 0 / 0  ->  5.00 / 2   WRONG TODAY, independent
--                                                     of the self-review
--
-- Caroline Vanegas is a live instructor with two 5-star reviews whose public
-- rating reads zero right now. Same statement as Darian's repair, so it is done
-- here rather than deferred.
--
-- NULL, NOT 0, for a host with no reviews. users_discoverable exposes
-- average_rating and fetchInstructors sorts with `nullsFirst: false`, so a 0
-- would place a zero-review instructor among genuinely rated ones rather than
-- after them. NULL sorts last, which is the truth: no rating, not a bad one.
--
-- The values are RECOMPUTED from public.reviews rather than written as
-- literals, so the file cannot encode a stale average. avg() over zero rows
-- returns NULL, which is exactly Darian's case.
--
-- THE TRIGGER IS NOT FIXED HERE. add_reviews.sql declares
-- update_host_average_rating() WITHOUT SECURITY DEFINER. If that is what is
-- live, it runs as the reviewer and its `UPDATE users` targets ANOTHER user's
-- row, which the users UPDATE policy (auth.uid() = id) refuses -- a zero-row
-- update that raises nothing. One host in four measured inconsistent, which is
-- what that would look like. A repaired column under a broken trigger drifts
-- again on the next review, so the function needs its own migration and its own
-- rehearsal proving the trigger fires AND lands. Not folded in here.
--
-- ---------------------------------------------------------------------------
-- All three parts live in ONE DO block. A DO block is a single statement, so a
-- RAISE anywhere rolls back the policy swap, the delete and the repairs
-- together -- true whether or not the SQL editor wraps it in a transaction.
-- Per feedback-do-block-no-visible-output, the file ends with a verification
-- SELECT, because the editor shows only "success, no rows returned" for a DO
-- block and discards RAISE NOTICE.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  k_review   constant uuid := '47e91379-e421-451c-8ade-c9b06de8d8f0';
  k_session  constant uuid := '21a301f1-3c77-4551-a527-00d38943362e';
  k_darian   constant uuid := 'eaff348f-5df3-4df5-bd80-69ec233aad0e';
  k_caroline constant uuid := '1848555a-8405-475a-94e2-6dd4b2f6d70e';

  v_policies integer;
  v_name     text;
  v_check    text;
  v_selfs    integer;
  v_rows     integer;
  v_drift    integer;
BEGIN
  -- ── Part A ──────────────────────────────────────────────────────────────
  SELECT count(*), max(policyname), max(with_check)
    INTO v_policies, v_name, v_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'reviews' AND cmd = 'INSERT';

  IF v_policies <> 1 THEN
    RAISE EXCEPTION
      '172 ABORTED: expected exactly 1 INSERT policy on public.reviews (measured 2026-09-18) but found %. '
      'Do not guess which to replace: re-read pg_policies and re-scope this migration.', v_policies;
  END IF;

  IF v_check LIKE '%creator_id%' THEN
    RAISE NOTICE '172: the INSERT policy already references creator_id -- already applied. Skipping Part A.';
  ELSE
    EXECUTE format('DROP POLICY %I ON public.reviews', v_name);

    CREATE POLICY reviews_insert_participant_not_host
      ON public.reviews
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = reviewer_id
        AND EXISTS (
          SELECT 1 FROM public.session_participants sp
          WHERE sp.session_id = reviews.session_id
            AND sp.user_id = auth.uid()
            AND sp.status = 'confirmed'
        )
        -- The review must be filed against the session's ACTUAL host, not
        -- whatever host_id the client chose to send.
        AND host_id = (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
        -- And the reviewer must not be that host.
        AND auth.uid() <> (SELECT s.creator_id FROM public.sessions s WHERE s.id = reviews.session_id)
      );

    RAISE NOTICE '172: replaced INSERT policy % on public.reviews.', v_name;
  END IF;

  -- ── Part B ──────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_selfs FROM public.reviews WHERE reviewer_id = host_id;

  IF v_selfs = 0 THEN
    RAISE NOTICE '172: no self-review rows -- already applied, or a fresh rebuild.';
  ELSIF v_selfs <> 1 THEN
    RAISE EXCEPTION
      '172 ABORTED: expected exactly 1 self-review row (measured on production 2026-09-18) but found %. '
      'A row appeared since the measurement. Re-measure before applying; do NOT widen the predicate.', v_selfs;
  ELSE
    -- The single row must be the one that was measured, by BOTH ids.
    PERFORM 1 FROM public.reviews
     WHERE id = k_review AND session_id = k_session AND reviewer_id = host_id AND host_id = k_darian;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        '172 ABORTED: the one self-review row is not the row that was measured. '
        'Expected id % on session % for host %. Re-read the row and re-scope.', k_review, k_session, k_darian;
    END IF;

    DELETE FROM public.reviews WHERE id = k_review;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION '172 ABORTED: expected to delete 1 review but deleted %.', v_rows;
    END IF;
    RAISE NOTICE '172: deleted the self-review row.';
  END IF;

  -- ── Part C ──────────────────────────────────────────────────────────────
  -- Recomputed from public.reviews, never from literals. Runs unconditionally:
  -- it is idempotent by construction, so a rerun writes the same values.
  UPDATE public.users u
     SET average_rating = sub.avg_rating,
         total_reviews  = sub.n
    FROM (
      SELECT t.id,
             (SELECT round(avg(r.rating)::numeric, 2) FROM public.reviews r WHERE r.host_id = t.id) AS avg_rating,
             (SELECT count(*)                          FROM public.reviews r WHERE r.host_id = t.id) AS n
      FROM (VALUES (k_darian), (k_caroline)) AS t(id)
    ) sub
   WHERE u.id = sub.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 2 THEN
    RAISE EXCEPTION
      '172 ABORTED: expected to repair exactly 2 users rows (Darian and Caroline) but updated %. '
      'A target user is missing.', v_rows;
  END IF;

  -- Every host with reviews must now agree with the reviews table, not just
  -- the two that were repaired. If another host has drifted, this migration
  -- has fixed two symptoms of a cause that is still producing them.
  SELECT count(*) INTO v_drift
  FROM (SELECT DISTINCT host_id FROM public.reviews) h
  JOIN public.users u ON u.id = h.host_id
  WHERE u.total_reviews IS DISTINCT FROM (SELECT count(*) FROM public.reviews r WHERE r.host_id = h.host_id)
     OR u.average_rating IS DISTINCT FROM (SELECT round(avg(r.rating)::numeric, 2) FROM public.reviews r WHERE r.host_id = h.host_id);

  IF v_drift <> 0 THEN
    RAISE EXCEPTION
      '172 ABORTED: % host(s) still have an average_rating inconsistent with public.reviews after the repair. '
      'The repair was scoped to two rows; a third has drifted, so re-measure before applying.', v_drift;
  END IF;

  RAISE NOTICE '172: repaired 2 rating rows; all hosts now agree with public.reviews.';
END $$;

-- ---------------------------------------------------------------------------
-- Verification. Expected:
--
--   policy         reviews_insert_participant_not_host, and its WITH CHECK
--                  mentions creator_id twice
--   self_reviews   0
--   Darian         average_rating NULL, total_reviews 0
--   Caroline       average_rating 5.00, total_reviews 2
--   drifted_hosts  0
--
-- Every *_ok column must read true.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT'
      AND with_check LIKE '%creator_id%')                                 AS insert_policies_naming_creator_id,
  (SELECT count(*) FROM public.reviews WHERE reviewer_id = host_id)        AS self_reviews,
  (SELECT count(*) FROM public.reviews)                                    AS total_reviews_rows,
  (SELECT average_rating FROM public.users WHERE id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e') AS darian_avg,
  (SELECT total_reviews  FROM public.users WHERE id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e') AS darian_n,
  (SELECT average_rating FROM public.users WHERE id = '1848555a-8405-475a-94e2-6dd4b2f6d70e') AS caroline_avg,
  (SELECT total_reviews  FROM public.users WHERE id = '1848555a-8405-475a-94e2-6dd4b2f6d70e') AS caroline_n,
  coalesce((SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='reviews' AND cmd='INSERT'
      AND with_check LIKE '%creator_id%') = 1, false)                      AS policy_ok,
  coalesce((SELECT count(*) FROM public.reviews WHERE reviewer_id = host_id) = 0, false) AS self_reviews_ok,
  coalesce((SELECT average_rating IS NULL AND total_reviews = 0
              FROM public.users WHERE id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e'), false) AS darian_ok,
  coalesce((SELECT average_rating = 5.00 AND total_reviews = 2
              FROM public.users WHERE id = '1848555a-8405-475a-94e2-6dd4b2f6d70e'), false) AS caroline_ok,
  (SELECT count(*) FROM (SELECT DISTINCT host_id FROM public.reviews) h
     JOIN public.users u ON u.id = h.host_id
    WHERE u.total_reviews IS DISTINCT FROM (SELECT count(*) FROM public.reviews r WHERE r.host_id = h.host_id)
       OR u.average_rating IS DISTINCT FROM (SELECT round(avg(r.rating)::numeric,2) FROM public.reviews r WHERE r.host_id = h.host_id)
  )                                                                        AS drifted_hosts;

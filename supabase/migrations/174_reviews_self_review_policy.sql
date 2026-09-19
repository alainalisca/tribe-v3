-- 174_reviews_self_review_policy.sql
--
-- T-AUD12, database half. Closes self-review and review misattribution at the
-- RLS layer, removes the one self-review row on production, and repairs the two
-- users.average_rating values that are wrong today.
--
-- APPLIED TO PRODUCTION 2026-09-18, and verified: every *_ok column true,
-- reviews 6 rows to 5, Darian 0.00 / 0, Caroline 5.00 / 2, drifted_hosts 0.
--
-- IT WAS APPLIED UNDER THE FILENAME 172_reviews_self_review_policy.sql, and is
-- renumbered to 174 here. T-LEAD1 merged migrations 172 AND 173 to main at
-- 09:18 the same morning, from a branch cut in parallel with this one, and this
-- branch was built on a fork that predated it without re-reading main. Two
-- files named 172_*.sql is exactly the drift this series exists to prevent, so
-- the number moves rather than the record being quietly overwritten. Nothing in
-- the body changed: the only edits were 172 -> 174 in the filename, the abort
-- strings and the NOTICE prefixes, none of which executed on the applied run.
--
-- The lesson is not the number. A migration number is claimed by whichever
-- branch merges first, and a branch that never re-reads main cannot see the
-- claim. Re-read main before numbering, and again before merging.
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
--   Darian    eaff348f  stored 5 / 1  ->  0 / 0      (his only review is the
--                                                     self-review being deleted)
--   Caroline  1848555a  stored 0 / 0  ->  5.00 / 2   WRONG TODAY, independent
--                                                     of the self-review
--
-- Caroline Vanegas is a live instructor with two 5-star reviews whose public
-- rating reads zero right now. Same statement as Darian's repair, so it is done
-- here rather than deferred.
--
-- ZERO, NOT NULL, for a host with no reviews -- and this reverses an earlier
-- call, on purpose. The argument for NULL was that users_discoverable exposes
-- average_rating and fetchInstructors sorts `nullsFirst: false`, so a 0 places
-- a zero-review instructor among genuinely rated ones rather than after them.
-- That argument still holds. It is outweighed by this: the recreated trigger
-- writes COALESCE(AVG(rating)::DECIMAL(3,2), 0), so a NULL written here would
-- diverge from the trigger on Darian's very next review. Two writers
-- disagreeing about the same column is the defect this whole thread is about.
--
-- THE CONSEQUENCE THIS PARAGRAPH ORIGINALLY CLAIMED DOES NOT EXIST, and the
-- correction is kept rather than deleted. It said a zero-review instructor
-- would now sort among the 5-star ones on /instructors, and named a DAL
-- follow-up on total_reviews > 0. MEASURED 2026-09-18 across every consumer
-- of average_rating, 0 and NULL are indistinguishable:
--
--   Three places reach the column in a query. Two order it DESC NULLS LAST
--   (lib/dal/instructors.ts:79 and :187), where a 0 and a NULL both sort last.
--   The third filters .gte('average_rating', 4.0) (lib/dal/spotlight.ts:166),
--   which excludes both.
--
--   No display can tell them apart either. fetchInstructors maps
--   `row.average_rating ?? 0` (:133) before anything downstream sees it, and
--   every render is gated on a falsy rating, `> 0`, `!= null && > 0`, or
--   `reviews === 0` (InstructorCard's RatingStars returns the "no rating"
--   label on the review count, not the average).
--
-- So 0-not-NULL was the right call for the reason given -- agreeing with the
-- trigger -- and it costs nothing. The sort argument was wrong on both sides:
-- NULL would not have sorted better, because NULLS LAST puts it exactly where
-- the 0 goes. The claim was asserted from the shape of `nullsFirst: false`
-- without reading what NULLS LAST does to a zero.
--
-- The values are RECOMPUTED from public.reviews rather than written as
-- literals, so the file cannot encode a stale average. THE EXPRESSION IS THE
-- TRIGGER'S, CHARACTER FOR CHARACTER: COALESCE(avg(rating)::DECIMAL(3,2), 0).
-- A bare avg() over zero rows returns NULL, which is exactly Darian's case
-- after Part C -- and writing that NULL is the divergence this file exists to
-- prevent. The drift assertion below uses the same expression for the same
-- reason.
--
-- THE TRIGGER IS FIXED HERE, AND IT HAS TO BE.
--
-- prosecdef = false, confirmed in the live catalog. update_host_rating() runs
-- as the INVOKER, and its `UPDATE users` targets the HOST's row -- which the
-- users UPDATE policy (auth.uid() = id) refuses for every reviewer who is not
-- that host. A zero-row update raises nothing. So the normal path, an athlete
-- reviewing an instructor, cannot maintain this column at all.
--
-- WHAT THE COLUMN ACTUALLY MEANS TODAY. The column's correctness has never
-- depended on the trigger, and the one case where the trigger COULD have
-- written is a review the reviewer gave themselves.
--
-- The strongest evidence is users.updated_at, which PREDATES EVERY REVIEW in
-- all four cases:
--   Darian      updated_at 2025-10-30   self-review 2026-09-15  (10 months)
--   Salomon     updated_at 2026-06-22   review      2026-08-19
--   Alexandra   updated_at 2026-05-15   reviews     2026-05-28, 2026-07-09
--   Caroline    updated_at 2026-06-22   reviews     2026-06-26, 2026-06-29
-- So the trigger has never been OBSERVED to land -- not even on the
-- self-review, whose write would have been permitted. Three hosts read
-- correct anyway, which cannot be attributed to it.
--
-- And the apparent correctness carries less information than it looks:
-- ALL SIX REVIEWS ARE 5 STARS, so average_rating = 5 is satisfied by almost any
-- pre-existing value of 5. Only total_reviews discriminates.
--
-- (A stronger claim was considered and DISCARDED: that the only rating which
-- ever updated correctly is the fraudulent one. Salomon and Alexandra have no
-- self-review and are correct, which falsifies it. Recorded so nobody
-- rediscovers the tidier version and believes it.)
--
-- WHY IT CANNOT BE A FOLLOW-UP. Part C below deletes a review, and that DELETE
-- fires this same trigger. Repairing the column under a trigger that has never
-- worked is repairing a symptom while the cause runs. Note the subtlety: this
-- migration executes as the migration role, NOT under RLS, so even the BROKEN
-- trigger would land during the apply. The fix is for every write AFTER this
-- one -- the app path, where it has never worked.
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
      '174 ABORTED: expected exactly 1 INSERT policy on public.reviews (measured 2026-09-18) but found %. '
      'Do not guess which to replace: re-read pg_policies and re-scope this migration.', v_policies;
  END IF;

  IF v_check LIKE '%creator_id%' THEN
    RAISE NOTICE '174: the INSERT policy already references creator_id -- already applied. Skipping Part A.';
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

    RAISE NOTICE '174: replaced INSERT policy % on public.reviews.', v_name;
  END IF;

  -- ── Part B: the rating trigger's function ───────────────────────────────
  -- VERBATIM from the live catalog, with exactly ONE addition: SECURITY
  -- DEFINER. The body is not touched, the DECIMAL(3,2) cast is not touched,
  -- and the COALESCE(..., 0) is not touched -- Part D writes 0 to match it.
  --
  -- `SET search_path TO 'public'` is already on the live function; it is
  -- carried through rather than added, and it is what makes SECURITY DEFINER
  -- safe here (a definer function without a pinned search_path is a privilege
  -- escalation waiting for a schema shadow).
  --
  -- CREATE OR REPLACE keeps the OID, so trigger_update_host_rating continues to
  -- point at it and no trigger is dropped or recreated.
  CREATE OR REPLACE FUNCTION public.update_host_rating()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public'
  AS $fn$
  BEGIN
    UPDATE users
    SET 
      average_rating = (
        SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
        FROM reviews
        WHERE host_id = COALESCE(NEW.host_id, OLD.host_id)
      ),
      total_reviews = (
        SELECT COUNT(*)
        FROM reviews
        WHERE host_id = COALESCE(NEW.host_id, OLD.host_id)
      )
    WHERE id = COALESCE(NEW.host_id, OLD.host_id);
    
    RETURN COALESCE(NEW, OLD);
  END;
  $fn$;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.update_host_rating()'::regprocedure) THEN
    RAISE EXCEPTION '174 ABORTED: update_host_rating() is still not SECURITY DEFINER after the replace.';
  END IF;
  RAISE NOTICE '174: update_host_rating() recreated as SECURITY DEFINER.';

  -- ── Part C: the one self-review row ─────────────────────────────────────
  -- reviews carries UNIQUE (session_id, reviewer_id), so a person can hold at
  -- most ONE review per session. That is what makes "exactly one self-review on
  -- this session" a structural fact rather than a count that happened to be 1,
  -- and it is asserted rather than assumed.
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'public.reviews'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ILIKE '%(session_id, reviewer_id)%';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      '174 ABORTED: the UNIQUE (session_id, reviewer_id) constraint on public.reviews is missing. '
      'The one-review-per-person-per-session guarantee this migration relies on does not hold.';
  END IF;

  SELECT count(*) INTO v_selfs FROM public.reviews WHERE reviewer_id = host_id;

  IF v_selfs = 0 THEN
    RAISE NOTICE '174: no self-review rows -- already applied, or a fresh rebuild.';
  ELSIF v_selfs <> 1 THEN
    RAISE EXCEPTION
      '174 ABORTED: expected exactly 1 self-review row (measured on production 2026-09-18) but found %. '
      'A row appeared since the measurement. Re-measure before applying; do NOT widen the predicate.', v_selfs;
  ELSE
    -- The single row must be the one that was measured, by BOTH ids.
    PERFORM 1 FROM public.reviews
     WHERE id = k_review AND session_id = k_session AND reviewer_id = host_id AND host_id = k_darian;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        '174 ABORTED: the one self-review row is not the row that was measured. '
        'Expected id % on session % for host %. Re-read the row and re-scope.', k_review, k_session, k_darian;
    END IF;

    DELETE FROM public.reviews WHERE id = k_review;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION '174 ABORTED: expected to delete 1 review but deleted %.', v_rows;
    END IF;
    RAISE NOTICE '174: deleted the self-review row.';
  END IF;

  -- ── Part D: the two rating repairs ──────────────────────────────────────
  -- Recomputed from public.reviews, never from literals. Runs unconditionally:
  -- it is idempotent by construction, so a rerun writes the same values.
  UPDATE public.users u
     SET average_rating = sub.avg_rating,
         total_reviews  = sub.n
    FROM (
      SELECT t.id,
             (SELECT COALESCE(avg(r.rating)::DECIMAL(3,2), 0) FROM public.reviews r WHERE r.host_id = t.id) AS avg_rating,
             (SELECT count(*)                          FROM public.reviews r WHERE r.host_id = t.id) AS n
      FROM (VALUES (k_darian), (k_caroline)) AS t(id)
    ) sub
   WHERE u.id = sub.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 2 THEN
    RAISE EXCEPTION
      '174 ABORTED: expected to repair exactly 2 users rows (Darian and Caroline) but updated %. '
      'A target user is missing.', v_rows;
  END IF;

  -- Every host with reviews must now agree with the reviews table, not just
  -- the two that were repaired. If another host has drifted, this migration
  -- has fixed two symptoms of a cause that is still producing them.
  SELECT count(*) INTO v_drift
  FROM (SELECT DISTINCT host_id FROM public.reviews) h
  JOIN public.users u ON u.id = h.host_id
  WHERE u.total_reviews IS DISTINCT FROM (SELECT count(*) FROM public.reviews r WHERE r.host_id = h.host_id)
     OR u.average_rating IS DISTINCT FROM (SELECT COALESCE(avg(r.rating)::DECIMAL(3,2), 0) FROM public.reviews r WHERE r.host_id = h.host_id);

  IF v_drift <> 0 THEN
    RAISE EXCEPTION
      '174 ABORTED: % host(s) still have an average_rating inconsistent with public.reviews after the repair. '
      'The repair was scoped to two rows; a third has drifted, so re-measure before applying.', v_drift;
  END IF;

  -- ── Part E: TRUNCATE ────────────────────────────────────────────────────
  -- TRUNCATE ESCAPES RLS ENTIRELY. No policy can stop it, so a table-level
  -- grant is the only thing standing between a role and the whole table.
  -- PostgREST never issues TRUNCATE, so this is inert today -- and inert-but-
  -- wrong is exactly how the session_attendance grant sat until someone looked.
  -- Revoking costs nothing and removes a hole that no policy work would ever
  -- close.
  REVOKE TRUNCATE ON public.reviews FROM anon, authenticated;

  IF has_table_privilege('anon', 'public.reviews', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.reviews', 'TRUNCATE') THEN
    RAISE EXCEPTION '174 ABORTED: TRUNCATE on public.reviews is still held after the revoke.';
  END IF;

  RAISE NOTICE '174: repaired 2 rating rows, revoked TRUNCATE; all hosts now agree with public.reviews.';
END $$;

-- ---------------------------------------------------------------------------
-- Verification. Expected:
--
--   policy         reviews_insert_participant_not_host, and its WITH CHECK
--                  mentions creator_id twice
--   self_reviews   0
--   Darian         average_rating 0, total_reviews 0
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
  coalesce((SELECT average_rating = 0 AND total_reviews = 0
              FROM public.users WHERE id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e'), false) AS darian_ok,
  coalesce((SELECT prosecdef FROM pg_proc WHERE oid = 'public.update_host_rating()'::regprocedure), false) AS trigger_fn_security_definer,
  (NOT has_table_privilege('anon','public.reviews','TRUNCATE')
   AND NOT has_table_privilege('authenticated','public.reviews','TRUNCATE'))            AS truncate_revoked_ok,
  coalesce((SELECT average_rating = 5.00 AND total_reviews = 2
              FROM public.users WHERE id = '1848555a-8405-475a-94e2-6dd4b2f6d70e'), false) AS caroline_ok,
  (SELECT count(*) FROM (SELECT DISTINCT host_id FROM public.reviews) h
     JOIN public.users u ON u.id = h.host_id
    WHERE u.total_reviews IS DISTINCT FROM (SELECT count(*) FROM public.reviews r WHERE r.host_id = h.host_id)
       OR u.average_rating IS DISTINCT FROM (SELECT COALESCE(avg(r.rating)::DECIMAL(3,2), 0) FROM public.reviews r WHERE r.host_id = h.host_id)
  )                                                                        AS drifted_hosts;

-- PROGRAM: T-GROW Growth Engine
-- TICKET: T-GROW1 part B
-- TABLE: public.pass_leads OWNER: consumer
-- ALTERS: public.pass_leads (7 columns, 7 CHECKs)
-- CREATES: policy "Attribution columns are server only" (AS RESTRICTIVE, FOR INSERT, all roles)
-- RISK: MEDIUM
--
-- ════════════════════════════════════════════════════════════════════════════
-- T-GROW1 (1 of 3): where a lead came from, on the lead row
-- ════════════════════════════════════════════════════════════════════════════
--
-- 211 was free on origin/main (highest 210, 549a8fe4), every branch, every
-- worktree and all history, re-read 2026-10-08 at the moment of writing. The
-- number is chosen here and not at branch time, because the gap between
-- forking and writing is exactly where a parallel session lands (CLAUDE.md,
-- the 172 collision).
--
-- WHY THIS EXISTS
--   pass_leads already carries src and code (173). Live on 2026-10-08: 3 leads,
--   and 2 of the 3 have NEITHER. A lead with no source cannot be attributed to
--   a channel, so the question T-GROW exists to answer -- which free channel
--   sent people who showed up -- has no data behind it today.
--
-- THE SEVEN COLUMNS
--   attr_ref      the referral code from ?ref=, uppercase
--   utm_source    } the four utm_* the ad world already writes on every link,
--   utm_medium    } so a tagged link pasted from anywhere keeps its tagging
--   utm_campaign  }
--   utm_content   }
--   landing_path  the path the person FIRST landed on, which is how a lead
--                 that arrived through /, browsed, then opened the pass is
--                 told apart from one that landed on the pass directly
--   first_touch   the whole first-touch object as captured, jsonb, so a
--                 question nobody has asked yet can still be answered from the
--                 row rather than needing a new column and a backfill
--
-- WHY attr_ref AND NOT ref
--   The URL parameter is ?ref=, and that does not change: /auth/?ref=CODE is
--   already printed and lib/share.ts already builds it. The COLUMN is named
--   attr_ref for a reason that is specific to this repo's guards rather than to
--   taste. supabase/migrationAppliedBeforeCode.test.ts matches a new column's
--   name as a SUBSTRING of every source file, with no parser and no database,
--   and the string "ref" appears in 708 of them (measured, not estimated:
--   useRef, ref=, prefer, refresh, referrer). A column named ref would flag all
--   708 and the guard would have to be exempted to be usable, which is the
--   quiet hole CLAUDE.md names under "AN EXEMPTION WITHOUT A REASON".
--   ref_code was the other candidate and is taken: program_athletes.ref_code
--   (203) already means an athlete's own code, which is a different thing.
--   Measured for the same substring question: attr_ref 0 files, landing_path 0,
--   first_touch 0, utm_source 0, utm_medium 0, utm_campaign 0, utm_content 0.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY THE CHECKS BOUND SIZE AND NOT SHAPE, WHICH IS THE ONE REAL DECISION HERE
-- ════════════════════════════════════════════════════════════════════════════
--
-- A CHECK constraint binds EVERY writer, service role included. /api/pase is a
-- service-role insert, so a CHECK that a sanitized value could fail does not
-- reject a bad parameter -- it rejects the LEAD, and 173's sanitizeTag comment
-- is explicit about why that trade is wrong every time: "the lead is the thing
-- that matters, and losing it because a poster had a typo in its query string
-- would be the wrong trade".
--
-- So the two concerns are split by which failure each one can afford:
--
--   SHAPE (charset, case) lives in the route. lib/attribution.ts and
--   /api/pase's sanitizeTag drop a malformed tag TO NULL and keep the lead.
--   Failing soft is right, because a wrong src costs one row of reporting and a
--   refused insert costs a person who was standing in a gym.
--
--   SIZE lives here. An unbounded text column and an unbounded jsonb on a table
--   anon holds table-level INSERT on is a storage question, and a storage
--   question belongs to the database whatever the application believes. A 40
--   char bound cannot reject a sanitized tag because the route's own
--   MAX_CODE_LEN is 40 and it nulls anything longer -- the two numbers are the
--   same number, and lib/attribution.limits.test.ts fails if they stop being.
--
-- A tighter CHECK here would be strictly worse: it would be defence against our
-- own route's bug, bought by making that bug cost leads instead of fields.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY A SECOND RESTRICTIVE POLICY AND NOT A CLAUSE ON THE EXISTING ONES
-- ════════════════════════════════════════════════════════════════════════════
--
-- anon and authenticated hold TABLE-LEVEL INSERT on pass_leads (173 line 167),
-- so these seven columns are writable by the anon key the moment they exist,
-- the same way 201 and 204 found for theirs. The real writer is the service
-- role, which has BYPASSRLS, so nothing legitimate needs the client path.
--
-- 201 and 204 closed this by DROPPING AND RECREATING "Anyone can claim a pass"
-- with their own IS NULL clauses appended. That works and it built a trap: each
-- file's recreation is blind to the other's clauses, so re-running 201 after
-- 204 silently reopens 204's hole, and 201 needed a pre-flight (its addendum)
-- to refuse. A third file appending to the same policy would need a pre-flight
-- against the first two, and the next one against three.
--
-- A SEPARATE RESTRICTIVE POLICY HAS NO SUCH ORDERING. Restrictive policies AND
-- with each other and with every permissive one, so this constrains the client
-- path without naming, reading or recreating any existing policy -- re-running
-- 201, 204 or 208 in any order cannot touch it, and it cannot touch them.
-- 208 is the precedent for the mechanism; this is the first time it is used to
-- AVOID the recreation rather than to reach a path recreation could not.
--
-- It binds the admin too, deliberately, and for 208's reason: "Admins manage
-- pass leads" is a second PERMISSIVE policy, permissive policies OR, so an
-- admin insert passes on that policy alone. A hand-made admin row with
-- utm_campaign set would be indistinguishable from a real tagged claim, which
-- is exactly the measurement the Origen tab is supposed to be trusted for.
--
-- WHAT THIS FILE DOES NOT DO
--   * No index. The Origen read groups over every lead in a date window, and
--     at 3 live rows a grouping index would be a guess about a shape nobody has
--     measured. 175's idx_pass_leads_created already serves the window.
--   * No SELECT grant. 173 granted SELECT on pass_leads to authenticated at
--     TABLE level (line 168, not a column list), so new columns are readable by
--     the partner view with no grant here. Asserted below rather than assumed,
--     because the column-level form of that grant would have needed one.
--   * Nothing about users. Signup-side attribution (spec part C) is NOT in this
--     migration and must not be added to it: the privacy gate found that the
--     published policy v1.0 does not cover recording arrival on an ACCOUNT, and
--     v1.1 is unapproved. Part C is a separate migration after that approval.

BEGIN;

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.pass_leads
  ADD COLUMN IF NOT EXISTS attr_ref     text,
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS landing_path text,
  ADD COLUMN IF NOT EXISTS first_touch  jsonb;

COMMENT ON COLUMN public.pass_leads.attr_ref IS
  'The referral code from the ?ref= parameter, uppercased by the capture library. '
  'Named attr_ref and not ref because migrationAppliedBeforeCode.test.ts matches a '
  'column name as a substring of source text and "ref" appears in 708 source files; '
  'ref_code is taken by program_athletes. The URL parameter is still ?ref=.';
COMMENT ON COLUMN public.pass_leads.landing_path IS
  'The path this person FIRST landed on, not the path they submitted from. A lead '
  'whose landing_path is / arrived somewhere else and found the pass; one whose '
  'landing_path is /pase/bullbox/ arrived on it. Query string and fragment are '
  'stripped by the capture library before it is stored.';
COMMENT ON COLUMN public.pass_leads.first_touch IS
  'The whole first-touch attribution object as captured (src, code, ref, the four '
  'utm_*, landing_path, ts), so a question nobody has asked yet is answerable from '
  'the row instead of needing a column and a backfill. Bounded to 2000 bytes by '
  'pass_leads_first_touch_bounds; it is a record of a visit, never a payload.';

-- ── 2. Size bounds, and only size (see the header) ──────────────────────────
--
-- Dropped and recreated so a re-run is a no-op rather than a duplicate-name
-- error, which is the idiom 201 and 204 use for their CHECKs.
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_attr_tag_bounds;
ALTER TABLE public.pass_leads
  ADD CONSTRAINT pass_leads_attr_tag_bounds
  CHECK (
        (attr_ref     IS NULL OR char_length(attr_ref)     BETWEEN 1 AND 40)
    AND (utm_source   IS NULL OR char_length(utm_source)   BETWEEN 1 AND 40)
    AND (utm_medium   IS NULL OR char_length(utm_medium)   BETWEEN 1 AND 40)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) BETWEEN 1 AND 40)
    AND (utm_content  IS NULL OR char_length(utm_content)  BETWEEN 1 AND 40)
  );

-- 200, not 40: a path is not a tag. /storefront/{uuid}/ is 48 characters before
-- anything else, and the longest path this app can produce today is a storefront
-- under a locale prefix. The empty string is excluded so "no path" has exactly
-- one representation, NULL, rather than two that count separately in a GROUP BY.
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_landing_path_bounds;
ALTER TABLE public.pass_leads
  ADD CONSTRAINT pass_leads_landing_path_bounds
  CHECK (landing_path IS NULL OR char_length(landing_path) BETWEEN 1 AND 200);

-- jsonb_typeof pins it to an OBJECT. Without it a bare `2` or a 500-element
-- array is valid jsonb, and every reader that treats this as a record of fields
-- would be reading something else.
--
-- length(first_touch::text) and NOT pg_column_size(first_touch), for two
-- reasons. pg_column_size is declared STABLE, and Postgres does not reject a
-- non-immutable function in a CHECK -- it simply stops noticing when existing
-- rows start violating it, which is a constraint that silently means something
-- different later. And it reports the TOAST-compressed size, so the bound a
-- reader reasons about ("about two kilobytes of JSON") is not the bound being
-- enforced. jsonb_out is immutable and canonicalises the text, so this is the
-- same number on this database, a local stack and a rebuild.
--
-- The whole first-touch object this app writes is about 220 characters, so 2000
-- is roughly nine times the real shape: loose enough that it cannot cost a lead
-- (see the header), tight enough that this column can never become a payload.
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_first_touch_bounds;
ALTER TABLE public.pass_leads
  ADD CONSTRAINT pass_leads_first_touch_bounds
  CHECK (first_touch IS NULL
         OR (jsonb_typeof(first_touch) = 'object' AND length(first_touch::text) <= 2000));

-- ── 3. No client role inserts an attribution column ─────────────────────────
--
-- Additive: no existing policy is read, named or recreated. See the header for
-- why that matters more than it looks.
DROP POLICY IF EXISTS "Attribution columns are server only" ON public.pass_leads;
CREATE POLICY "Attribution columns are server only" ON public.pass_leads
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
        attr_ref IS NULL
    AND utm_source IS NULL
    AND utm_medium IS NULL
    AND utm_campaign IS NULL
    AND utm_content IS NULL
    AND landing_path IS NULL
    AND first_touch IS NULL
  );

-- ── 4. Assert the end state, after the writes ───────────────────────────────
DO $$
DECLARE
  v_row record;
  v_col text;
BEGIN
  -- The seven columns arrived, with the types the readers expect. A text column
  -- where jsonb was meant would store first_touch as a string and every
  -- ->> would silently return nothing.
  FOREACH v_col IN ARRAY ARRAY['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                               'utm_content', 'landing_path'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'public.pass_leads'::regclass
                      AND attname = v_col AND NOT attisdropped
                      AND atttypid = 'text'::regtype) THEN
      RAISE EXCEPTION '211 ABORTED: pass_leads.% is missing or is not text.', v_col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.pass_leads'::regclass
                    AND attname = 'first_touch' AND NOT attisdropped
                    AND atttypid = 'jsonb'::regtype) THEN
    RAISE EXCEPTION '211 ABORTED: pass_leads.first_touch is missing or is not jsonb.';
  END IF;

  -- The three CHECKs are present AND VALIDATED. A constraint added NOT VALID
  -- would show up in pg_constraint and bind nothing already in the table, which
  -- is a distinction convalidated is the only place to see.
  FOREACH v_col IN ARRAY ARRAY['pass_leads_attr_tag_bounds',
                               'pass_leads_landing_path_bounds',
                               'pass_leads_first_touch_bounds'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.pass_leads'::regclass
                      AND conname = v_col AND contype = 'c' AND convalidated) THEN
      RAISE EXCEPTION '211 ABORTED: CHECK % is missing or not validated.', v_col;
    END IF;
  END LOOP;

  -- The restrictive policy exists, is RESTRICTIVE, is FOR INSERT, binds every
  -- role (roles = {public}, which is what makes it reach the admin's permissive
  -- path), and names all seven columns.
  SELECT roles::text AS roles, cmd, permissive, with_check INTO v_row FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads'
     AND policyname = 'Attribution columns are server only';
  IF v_row.with_check IS NULL OR v_row.permissive <> 'RESTRICTIVE'
     OR v_row.cmd <> 'INSERT' OR v_row.roles <> '{public}' THEN
    RAISE EXCEPTION '211 ABORTED: the attribution policy is missing or is not RESTRICTIVE, FOR INSERT, for all roles.';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                               'utm_content', 'landing_path', 'first_touch'] LOOP
    IF position(v_col || ' IS NULL' IN v_row.with_check) = 0 THEN
      RAISE EXCEPTION '211 ABORTED: the restrictive policy has no "% IS NULL" clause.', v_col;
    END IF;
  END LOOP;

  -- THIS FILE TOUCHED NO OTHER POLICY, and that is the property the whole
  -- design choice rests on. 208's restrictive policy and both permissive ones
  -- must be exactly as they were. Named individually rather than counted:
  -- a count of 4 is also satisfied by one of them being replaced.
  FOREACH v_col IN ARRAY ARRAY['Anyone can claim a pass', 'Admins manage pass leads',
                               'Partner reads own leads', 'Program columns are server only'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                    AND tablename = 'pass_leads' AND policyname = v_col) THEN
      RAISE EXCEPTION '211 ABORTED: policy "%" is gone; this file must not have changed it.', v_col;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') <> 5 THEN
    RAISE EXCEPTION '211 ABORTED: pass_leads has % policies, expected 5 (4 before this file, plus this one).',
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads');
  END IF;

  -- 204's clauses are still on the claim policy. A migration that appended to
  -- that policy would have had to recreate it; this one did not, and this is
  -- the assertion that says so from the other side.
  IF position('referred_by_athlete_id IS NULL' IN
              (SELECT with_check FROM pg_policies WHERE schemaname = 'public'
                AND tablename = 'pass_leads' AND policyname = 'Anyone can claim a pass')) = 0 THEN
    RAISE EXCEPTION '211 ABORTED: the claim policy lost 204''s clauses, so something here recreated it.';
  END IF;

  -- The partner leads view reads these columns on the BROWSER client under
  -- "Partner reads own leads". 173 granted SELECT at table level, so they are
  -- covered -- but a column-level grant would NOT have covered them and would
  -- have made the partner view return 42501 on a column it renders. Measured
  -- here rather than inherited from reading the grant statement.
  -- has_column_privilege, not has_table_privilege: CLAUDE.md records that the
  -- table-level form answers a narrower question than its name suggests.
  FOREACH v_col IN ARRAY ARRAY['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                               'utm_content', 'landing_path', 'first_touch'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.pass_leads', v_col, 'SELECT') THEN
      RAISE EXCEPTION '211 ABORTED: authenticated cannot SELECT pass_leads.%; the partner leads view would 42501.', v_col;
    END IF;
  END LOOP;

  -- anon must not read any of it. 173 revoked anon from the table and granted
  -- INSERT only; a new column cannot have changed that, and asserting it is how
  -- we would find out if it had.
  IF has_any_column_privilege('anon', 'public.pass_leads', 'SELECT') THEN
    RAISE EXCEPTION '211 ABORTED: anon can SELECT pass_leads.';
  END IF;

  -- Unchanged from 201, 204 and 175, and re-asserted because every one of those
  -- files rests on it: the only UPDATE path is a definer function.
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '211 ABORTED: a client role holds UPDATE on pass_leads.';
  END IF;

  RAISE NOTICE '211: seven attribution columns added, size-bounded, and closed to every client role.';
END $$;

-- ── Record this migration as applied ────────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('211_t_grow1_lead_attribution',
        'T-GROW1: pass_leads attr_ref, utm_* x4, landing_path, first_touch; size CHECKs; restrictive INSERT policy')
ON CONFLICT (migration) DO NOTHING;

COMMIT;

-- 211_t_grow1_lead_attribution_REHEARSAL.sql
--
-- Rehearsal for supabase/migrations/211_t_grow1_lead_attribution.sql. Run in the
-- Supabase SQL editor. Everything through the ROLLBACK is inside
-- BEGIN ... ROLLBACK; production is not modified. ONE result set for the
-- transaction, because the editor shows only the last statement's result.
--
-- Part A  the migration body applies clean, and the catalog says what it should
-- Part B  the CHECKs admit every value the route can produce and refuse the
--         ones that would make this column a payload. B1, B5 and B7 are the
--         POSITIVE arms and they are the point: a size CHECK that rejects a real
--         lead is worse than no CHECK at all.
-- Part C  the restrictive policy, from all four directions: anon refused with
--         attribution, anon ADMITTED without it, an ADMIN refused, the service
--         role admitted. C2 and C4 are positive controls.
-- Part D  guard non-vacuity, nine arms, each reintroducing the mistake its
--         guard names
-- Part E  idempotence: the whole body again, as a re-run would
-- Part F  the three pre-existing facts this design rests on, measured here
--         rather than inherited from reading a migration file
-- Part G  nothing escaped -- DELIBERATELY OUTSIDE THE TRANSACTION
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE POSITIVE ARMS OUTNUMBER THE NEGATIVE ONES HERE.
--
-- CLAUDE.md records 179's rehearsal reporting 19 green arms over a migration
-- that aborted on its first guard, because every arm fed a violated
-- precondition to a working guard and could only fire. Failure arms test the
-- guard; success arms test the world.
--
-- This migration's whole risk is in the success direction. The dangerous
-- outcome is not "a CHECK failed to catch junk", it is "a CHECK caught a real
-- lead", and that failure mode is invisible to any arm that only feeds it bad
-- input. So B1 (a 40 character tag), B5 (the real first_touch object), B7 (a
-- 200 character path) and C2/C4 (the two real insert paths) all assert
-- SUCCESS, and a FAIL on any of them means this migration costs leads.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS SEEDS ITS OWN PARTNER INSTEAD OF USING BULLBOX.
--
-- The claim policy calls pass_is_active(partner_id, slug), so any insert arm
-- needs a partner whose pass_active IS TRUE. The obvious move is BullBox, which
-- is the live one. CLAUDE.md forbids it: "Never exercise venue, partner or
-- approval flows against a real gym's live record", written after six invented
-- classes reached a real gym's public page.
--
-- Inside BEGIN ... ROLLBACK nothing survives, so the letter of that rule is not
-- at risk here. The spirit is: a rehearsal that is one missing ROLLBACK away
-- from writing a forged lead against a real gym's pass is a worse artefact than
-- one that cannot do that at all, however the transaction ends. So this clones
-- an existing partner row into a throwaway with a new id, a reh- slug and
-- user_id NULL, and every insert arm targets the clone.
--
-- The clone is built with to_jsonb / jsonb_populate_record rather than a column
-- list, because featured_partners has 30-odd columns and a hand-written list
-- would be a second place to keep in sync with a table this file does not own.
-- user_id is nulled because 018 made it UNIQUE, and a clone carrying the
-- original's owner would collide on it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE BODY IN PART A IS BYTE-IDENTICAL TO THE MIGRATION, AND THAT IS A TEST.
--
-- It is spliced from the migration file by a script, not copied by hand, and
-- supabase/rehearsalBodyVerbatim.test.ts fails if the two ever diverge. 175's
-- rehearsal asked a human to re-run a python one-liner after editing either
-- file; a documented procedure that depends on remembering is the thing this
-- repo keeps converting into a test.
--
-- TWO THINGS ARE OMITTED FROM THE SPLICE, both stated so the omission is not
-- mistaken for drift:
--   * the migration's own BEGIN; and COMMIT;, because this file supplies the
--     transaction and Postgres has no nested BEGIN;
--   * the INSERT INTO public.migrations_applied, because recording a migration
--     as applied inside a transaction that rolls back is at best a no-op and at
--     worst the one statement anyone would most regret leaving committed.
-- Everything between them, INCLUDING THE DO GUARD BLOCK, is verbatim. 179's
-- rehearsal spliced around its guard and reported green over a migration that
-- aborted on it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PART A IS PROVED BY ARRIVAL, NOT BY A ROW.
--
-- The body, including its guard, runs as top-level statements before the probe
-- table exists. If any guard raises, the script aborts and there is no result
-- table at all, which is the loud failure and is why it is first. The A rows
-- re-assert the catalog facts independently, so a body that ran clean for the
-- wrong reason still shows.
--
-- Scaffolding note: nothing running as anon or authenticated writes to the probe
-- table. Every arm restores the role in its handler, findings go into plpgsql
-- variables, and rows are written afterwards. Every probe read is coalesced so a
-- missing row reads FAIL rather than NULL.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- PART A: the migration body, spliced verbatim from
--         supabase/migrations/211_t_grow1_lead_attribution.sql
--         (its BEGIN/COMMIT and its migrations_applied INSERT omitted, see above)
-- ══════════════════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════════════════
-- The probe table
-- ══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- Part A, re-asserted from the catalog. Driven off a VALUES list so a missing
-- row FAILS rather than dropping its check from the output. Each detail PRINTS
-- WHAT IT READ: a bare PASS is unfalsifiable from the outside, and "(none)" in a
-- detail column is visibly absurd in a way that "PASS" never is.
INSERT INTO reh_probe
SELECT t.seq, t.check_name, coalesce(t.detail, '(probe row missing)'), coalesce(t.passed, false)
FROM (VALUES
  (1, 'A1 all seven attribution columns exist on pass_leads',
      (SELECT coalesce(string_agg(attname, ', ' ORDER BY attname), '(none)') FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')),
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')) = 7),
  (2, 'A2 first_touch is jsonb and the six tags are text',
      (SELECT coalesce(string_agg(attname || '=' || format_type(atttypid, atttypmod), ', ' ORDER BY attname), '(none)')
         FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')),
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND ((attname = 'first_touch' AND format_type(atttypid, atttypmod) = 'jsonb')
            OR (attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                            'utm_content', 'landing_path') AND format_type(atttypid, atttypmod) = 'text'))) = 7),
  (3, 'A3 the three size CHECKs exist and are VALIDATED, not NOT VALID',
      (SELECT coalesce(string_agg(conname || ' validated=' || convalidated::text, ', ' ORDER BY conname), '(none)')
         FROM pg_constraint
        WHERE conrelid = 'public.pass_leads'::regclass AND contype = 'c'
          AND conname IN ('pass_leads_attr_tag_bounds', 'pass_leads_landing_path_bounds',
                          'pass_leads_first_touch_bounds')),
      (SELECT count(*) FROM pg_constraint
        WHERE conrelid = 'public.pass_leads'::regclass AND contype = 'c' AND convalidated
          AND conname IN ('pass_leads_attr_tag_bounds', 'pass_leads_landing_path_bounds',
                          'pass_leads_first_touch_bounds')) = 3),
  (4, 'A4 the attribution policy is RESTRICTIVE, FOR INSERT, roles {public}',
      (SELECT coalesce(permissive || ' ' || cmd || ' ' || roles::text, '(none)') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pass_leads'
          AND policyname = 'Attribution columns are server only'),
      (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pass_leads'
          AND policyname = 'Attribution columns are server only'
          AND permissive = 'RESTRICTIVE' AND cmd = 'INSERT' AND roles = '{public}') = 1),
  (5, 'A5 it names all seven columns IS NULL',
      (SELECT coalesce(string_agg(c.col, ', ' ORDER BY c.col), '(none matched)')
         FROM unnest(array['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                           'utm_content', 'landing_path', 'first_touch']) c(col)
        WHERE position(c.col || ' IS NULL' IN
                       coalesce((SELECT with_check FROM pg_policies
                                  WHERE schemaname = 'public' AND tablename = 'pass_leads'
                                    AND policyname = 'Attribution columns are server only'), '')) > 0),
      (SELECT count(*) FROM unnest(array['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                                         'utm_content', 'landing_path', 'first_touch']) c(col)
        WHERE position(c.col || ' IS NULL' IN
                       coalesce((SELECT with_check FROM pg_policies
                                  WHERE schemaname = 'public' AND tablename = 'pass_leads'
                                    AND policyname = 'Attribution columns are server only'), '')) > 0) = 7),
  (6, 'A6 pass_leads has exactly five policies and all four prior ones survived',
      (SELECT coalesce(string_agg(policyname, ' | ' ORDER BY policyname), '(none)') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pass_leads'),
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') = 5
      AND (SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'pass_leads'
              AND policyname IN ('Anyone can claim a pass', 'Admins manage pass leads',
                                 'Partner reads own leads', 'Program columns are server only')) = 4),
  (7, 'A7 the claim policy still carries 204''s clauses, so nothing recreated it',
      CASE WHEN position('referred_by_athlete_id IS NULL' IN
                         coalesce((SELECT with_check FROM pg_policies
                                    WHERE schemaname = 'public' AND tablename = 'pass_leads'
                                      AND policyname = 'Anyone can claim a pass'), '')) > 0
           THEN '204''s clauses present' ELSE 'MISSING -- the claim policy was recreated' END,
      position('referred_by_athlete_id IS NULL' IN
               coalesce((SELECT with_check FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'pass_leads'
                            AND policyname = 'Anyone can claim a pass'), '')) > 0),
  (8, 'A8 authenticated can SELECT all seven (the partner leads view renders them)',
      (SELECT coalesce(string_agg(c.col, ', ' ORDER BY c.col), '(none readable)')
         FROM unnest(array['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                           'utm_content', 'landing_path', 'first_touch']) c(col)
        WHERE has_column_privilege('authenticated', 'public.pass_leads', c.col, 'SELECT')),
      (SELECT count(*) FROM unnest(array['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                                         'utm_content', 'landing_path', 'first_touch']) c(col)
        WHERE has_column_privilege('authenticated', 'public.pass_leads', c.col, 'SELECT')) = 7),
  (9, 'A9 anon can SELECT nothing on pass_leads, and no client role can UPDATE it',
      'anon SELECT=' || has_any_column_privilege('anon', 'public.pass_leads', 'SELECT')::text
      || ' authenticated UPDATE=' || has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')::text
      || ' anon UPDATE=' || has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')::text,
      NOT has_any_column_privilege('anon', 'public.pass_leads', 'SELECT')
      AND NOT has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
      AND NOT has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE'))
) AS t(seq, check_name, detail, passed);

DO $outer$
DECLARE
  -- Resolved by PROPERTY at run time, never pasted as a literal id. 175's
  -- rehearsal hardcoded five production uuids read on one afternoon; CLAUDE.md's
  -- own rule is that a measurement taken on Monday is a hypothesis by Friday.
  -- Each one is asserted non-null before use and PRINTED in its arm's detail, so
  -- "resolved nobody" can never read as a pass.
  k_partner  uuid;          -- the throwaway clone every insert arm targets
  k_slug     constant text := 'reh211-throwaway-pass';
  k_admin    uuid;
  k_athlete  uuid;

  -- The real shape, so the arms that must SUCCEED are testing the real shape.
  -- Taken from lib/attribution.ts's first-touch object: 220 characters.
  k_first_touch constant jsonb := jsonb_build_object(
    'src', 'runclub', 'code', 'RUNCLUB-SAT0927', 'ref', 'A7K2QX',
    'utm_source', 'instagram', 'utm_medium', 'social', 'utm_campaign', 'hyrox-oct',
    'utm_content', 'reel-01', 'landing_path', '/pase/bullbox/', 'ts', 1760000000000);

  a10_state text := '(never ran)'; a10_ok boolean := false;

  b1_state text := '(never ran)'; b1_ok boolean := false;
  b2_state text := '(never ran)'; b2_ok boolean := false;
  b3_state text := '(never ran)'; b3_ok boolean := false;
  b4_state text := '(never ran)'; b4_ok boolean := false;
  b5_state text := '(never ran)'; b5_ok boolean := false;
  b6_state text := '(never ran)'; b6_ok boolean := false;
  b7_state text := '(never ran)'; b7_ok boolean := false;
  b8_state text := '(never ran)'; b8_ok boolean := false;

  c1_state text := '(never ran)'; c1_ok boolean := false;
  c2_state text := '(never ran)'; c2_ok boolean := false;
  c3_state text := '(never ran)'; c3_ok boolean := false;
  c4_state text := '(never ran)'; c4_ok boolean := false;

  d1 boolean := false; d1m text := '(never ran)';
  d2 boolean := false; d2m text := '(never ran)';
  d3 boolean := false; d3m text := '(never ran)';
  d4 boolean := false; d4m text := '(never ran)';
  d5 boolean := false; d5m text := '(never ran)';
  d6 boolean := false; d6m text := '(never ran)';
  d7 boolean := false; d7m text := '(never ran)';
  d8 boolean := false; d8m text := '(never ran)';
  d9 boolean := false; d9m text := '(never ran)';

  e1_state text := '(never ran)'; e1_ok boolean := false;

  f1_state text := '(never ran)'; f1_ok boolean := false;
  f2_state text := '(never ran)'; f2_ok boolean := false;
  f3_state text := '(never ran)'; f3_ok boolean := false;
  f4_state text := '(never ran)'; f4_ok boolean := false;

  v_n     int;
  v_uniques text := '(never read)';
  v_txt   text;
  v_id    uuid;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════
-- A10: the scaffolding itself. Resolve the actors and build the throwaway
-- partner, and FAIL LOUDLY if any of it came back empty.
--
-- This arm exists because every B and C arm below is meaningless without it,
-- and a NULL partner id would make each of them refuse for the wrong reason
-- while still reporting the refusal this file was looking for. That is the
-- vacuity CLAUDE.md records as "the check asked the right question, but the
-- scenario was never reproduced".
-- ══════════════════════════════════════════════════════════════════════════
BEGIN
  SELECT u.id INTO k_admin FROM public.users u
   WHERE u.is_admin IS TRUE AND u.deleted_at IS NULL LIMIT 1;

  SELECT u.id INTO k_athlete FROM public.users u
   WHERE coalesce(u.is_admin, false) = false AND u.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.featured_partners fp WHERE fp.user_id = u.id)
   LIMIT 1;

  SELECT gen_random_uuid() INTO k_partner;
  /*
   * THE CLONE.
   *
   * CROSS JOIN LATERAL, not `SELECT * FROM f(...) FROM t`, which is TWO FROM
   * clauses and a 42601. That is what it was, and it failed in the SQL editor on
   * the first real run -- INSIDE a DO block, which is why nothing caught it
   * earlier: plpgsql compiles the block's structure but defers parsing the SQL of
   * each statement until that statement first EXECUTES. A parse of this file
   * cannot see it. supabase/recon/t-grow1-rehearsal-parse.LOCAL.sh executes it
   * against a throwaway cluster instead, which can.
   *
   * jsonb_populate_record returns one composite value, so in FROM it is a
   * single-row table whose columns are featured_partners' columns; `r.*` expands
   * to them in table order, which is what INSERT without a column list needs.
   *
   * Preferred over `(jsonb_populate_record(...)).*`, which is also valid and
   * re-evaluates the function once PER COLUMN -- 30-odd calls per row.
   *
   * WHY A CLONE AT ALL: featured_partners has 30-odd columns and a hand-written
   * INSERT list would be a second place to keep in sync with a table this file
   * does not own.
   *
   * EVERY UNIQUE CONSTRAINT IS OVERRIDDEN. featured_partners has exactly three --
   * id (PK), user_id (018), and featured_partners_slug_key (163) -- and all three
   * are replaced below. A7/A10 asserts that list is still complete rather than
   * trusting it, so a fourth unique index applied by hand to production fails the
   * scaffolding arm by NAME instead of making this insert fail confusingly.
   */
  INSERT INTO public.featured_partners
  SELECT r.*
    FROM public.featured_partners fp
    CROSS JOIN LATERAL jsonb_populate_record(
      NULL::public.featured_partners,
      to_jsonb(fp.*) || jsonb_build_object(
        'id', k_partner,
        'slug', k_slug,
        'user_id', NULL,
        'pass_active', true,
        -- Not required by any constraint, and set anyway. If a clone ever
        -- escaped a rolled-back transaction, these two are what make it
        -- identifiable and harmless: the name says what it is, and 'paused'
        -- keeps it off every public surface. pass_is_active reads pass_active
        -- alone, so paused costs the arms nothing.
        'business_name', 'REHEARSAL THROWAWAY (roll back)',
        'status', 'paused'
      )
    ) AS r
   ORDER BY fp.created_at NULLS LAST
   LIMIT 1;


  /*
   * THE CLONE'S ASSUMPTION, CHECKED RATHER THAN TRUSTED.
   *
   * The clone overrides id, user_id and slug because those are the three unique
   * constraints featured_partners has. That list came from reading migrations
   * 018 and 163, and CLAUDE.md is explicit that the repo is not authoritative
   * about production in either direction -- protect_verified_instructor is live
   * and in no migration here.
   *
   * So the list is resolved from pg_index at run time. A fourth unique index
   * applied by hand fails THIS arm, by name, instead of making the INSERT above
   * fail with a 23505 that reads as a bug in the rehearsal.
   *
   * pg_index over indrelid, not information_schema: a UNIQUE CONSTRAINT and a
   * bare UNIQUE INDEX are the same object here and only one of them has a row in
   * table_constraints. featured_partners_slug_key (163) is the second kind.
   */
  SELECT coalesce(string_agg(i.relname || '(' || c.cols || ')', ', ' ORDER BY i.relname), '(none)')
    INTO v_uniques
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    CROSS JOIN LATERAL (
      SELECT string_agg(a.attname, '+' ORDER BY a.attnum) AS cols
        FROM unnest(x.indkey::int[]) k(attnum)
        JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
    ) c
   WHERE x.indrelid = 'public.featured_partners'::regclass
     AND x.indisunique
     AND c.cols NOT IN ('id', 'user_id', 'slug');

  a10_state := 'unexpected_uniques=' || v_uniques || ' partner=' || coalesce(k_partner::text, 'NULL')
            || ' slug=' || k_slug
            || ' admin=' || coalesce(k_admin::text, 'NULL')
            || ' athlete=' || coalesce(k_athlete::text, 'NULL')
            || ' pass_is_active=' || coalesce(public.pass_is_active(k_partner, k_slug)::text, 'NULL');
  -- pass_is_active is the one that matters: without it every insert arm below
  -- fails on the claim policy and says nothing about the restrictive one.
  a10_ok := k_partner IS NOT NULL AND k_admin IS NOT NULL AND k_athlete IS NOT NULL
        AND public.pass_is_active(k_partner, k_slug)
       -- Every unique constraint the clone must dodge is one it overrides.
       AND v_uniques = '(none)';
EXCEPTION WHEN OTHERS THEN
  a10_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; a10_ok := false;
END;

INSERT INTO reh_probe VALUES
  (10, 'A10 SCAFFOLDING: actors resolved and a throwaway partner with a live pass exists',
       coalesce(a10_state, '(probe row missing)'), coalesce(a10_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART B: the size CHECKs, both directions.
--
-- Run as the SERVICE ROLE, because that is the writer the CHECKs actually bind
-- and the only one that reaches them with attribution set. Testing the bounds
-- as anon would measure the restrictive policy instead and never evaluate a
-- CHECK at all.
--
-- A helper would be shorter and is deliberately not used: each arm names the
-- value it sends, so the output says which boundary moved.
-- ══════════════════════════════════════════════════════════════════════════

-- B1: FORTY characters is accepted. THE LOAD-BEARING POSITIVE ARM. 40 is
-- /api/pase's MAX_CODE_LEN, so this is the longest tag the route can ever emit;
-- if the CHECK is off by one the route produces leads the table refuses.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, utm_source, attr_ref)
    VALUES (k_slug, k_partner, 'Reh Boundary', '+573001234567', 'reh-b1@example.com', 'RH-BONE',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.',
            repeat('a', 40), repeat('B', 40))
    RETURNING id INTO v_id;
    b1_state := 'accepted a 40 char utm_source and a 40 char attr_ref, id ' || coalesce(v_id::text, 'NULL');
    b1_ok := v_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b1_state := 'REFUSED a 40 char tag, which /api/pase can produce: ' || SQLSTATE || ' ' || SQLERRM;
    b1_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b1_state = '(never ran)' THEN b1_state := 'scaffolding failed'; b1_ok := false; END IF;
END;

-- B2: forty-one is refused, 23514 (check_violation).
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, utm_source)
    VALUES (k_slug, k_partner, 'Reh Over', '+573001234567', 'reh-b2@example.com', 'RH-BTWO',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.', repeat('a', 41));
    b2_state := 'SUCCEEDED on a 41 char utm_source -- the size bound does nothing';
    b2_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b2_state := SQLSTATE || ' ' || SQLERRM;
    b2_ok := (SQLSTATE = '23514' AND SQLERRM LIKE '%pass_leads_attr_tag_bounds%');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b2_state = '(never ran)' THEN b2_state := 'scaffolding failed'; b2_ok := false; END IF;
END;

-- B3: the empty string is refused, so "no tag" has exactly ONE representation.
-- Without this a GROUP BY in the Origen tab reports '' and NULL as two separate
-- channels, which is one real channel shown as two rows that each look small.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, utm_campaign)
    VALUES (k_slug, k_partner, 'Reh Empty', '+573001234567', 'reh-b3@example.com', 'RH-BTRE',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.', '');
    b3_state := 'SUCCEEDED on an empty utm_campaign -- NULL and '''' are now two channels';
    b3_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b3_state := SQLSTATE || ' ' || SQLERRM;
    b3_ok := (SQLSTATE = '23514' AND SQLERRM LIKE '%pass_leads_attr_tag_bounds%');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b3_state = '(never ran)' THEN b3_state := 'scaffolding failed'; b3_ok := false; END IF;
END;

-- B4: a jsonb ARRAY in first_touch is refused. Valid jsonb, wrong shape, and
-- every ->> a reader writes against it would silently return nothing.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, first_touch)
    VALUES (k_slug, k_partner, 'Reh Array', '+573001234567', 'reh-b4@example.com', 'RH-BFOR',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.',
            '[1,2,3]'::jsonb);
    b4_state := 'SUCCEEDED on a jsonb array -- first_touch is not pinned to an object';
    b4_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b4_state := SQLSTATE || ' ' || SQLERRM;
    b4_ok := (SQLSTATE = '23514' AND SQLERRM LIKE '%pass_leads_first_touch_bounds%');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b4_state = '(never ran)' THEN b4_state := 'scaffolding failed'; b4_ok := false; END IF;
END;

-- B5: THE REAL first_touch OBJECT IS ACCEPTED. The other load-bearing positive
-- arm. Its detail prints the actual length, so the margin between the real shape
-- and the 2000 bound is a number in the output rather than a claim in a header.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, first_touch, landing_path)
    VALUES (k_slug, k_partner, 'Reh Real', '+573001234567', 'reh-b5@example.com', 'RH-BFIV',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.',
            k_first_touch, '/pase/bullbox/')
    RETURNING id INTO v_id;
    b5_state := 'accepted the real object, length(first_touch::text) = '
             || length(k_first_touch::text) || ' of 2000 allowed';
    b5_ok := v_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b5_state := 'REFUSED the real first_touch object: ' || SQLSTATE || ' ' || SQLERRM;
    b5_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b5_state = '(never ran)' THEN b5_state := 'scaffolding failed'; b5_ok := false; END IF;
END;

-- B6: an oversized object is refused. Built past 2000 characters rather than at
-- 2001, because jsonb canonicalises its input and the stored text length is not
-- the length of what was typed.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, first_touch)
    VALUES (k_slug, k_partner, 'Reh Big', '+573001234567', 'reh-b6@example.com', 'RH-BSIX',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.',
            jsonb_build_object('payload', repeat('x', 3000)));
    b6_state := 'SUCCEEDED on a 3000 char payload -- first_touch is unbounded';
    b6_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b6_state := SQLSTATE || ' ' || SQLERRM;
    b6_ok := (SQLSTATE = '23514' AND SQLERRM LIKE '%pass_leads_first_touch_bounds%');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b6_state = '(never ran)' THEN b6_state := 'scaffolding failed'; b6_ok := false; END IF;
END;

-- B7: a 200 character landing_path is accepted. Positive arm: 200 is the bound,
-- and a storefront path under a long id is already 48, so the headroom is real
-- rather than assumed.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, landing_path)
    VALUES (k_slug, k_partner, 'Reh Path', '+573001234567', 'reh-b7@example.com', 'RH-BSVN',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.',
            '/' || repeat('p', 199))
    RETURNING id INTO v_id;
    b7_state := 'accepted a 200 char landing_path, id ' || coalesce(v_id::text, 'NULL');
    b7_ok := v_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b7_state := 'REFUSED a 200 char landing_path: ' || SQLSTATE || ' ' || SQLERRM;
    b7_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b7_state = '(never ran)' THEN b7_state := 'scaffolding failed'; b7_ok := false; END IF;
END;

-- B8: 201 is refused, and by the PATH constraint rather than the tag one. The
-- message is checked, not just the SQLSTATE: both constraints raise 23514, so
-- asserting only the code would pass if a path violation were being caught by
-- the wrong rule.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, landing_path)
    VALUES (k_slug, k_partner, 'Reh Path2', '+573001234567', 'reh-b8@example.com', 'RH-BEGT',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.',
            '/' || repeat('p', 200));
    b8_state := 'SUCCEEDED on a 201 char landing_path';
    b8_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b8_state := SQLSTATE || ' ' || SQLERRM;
    b8_ok := (SQLSTATE = '23514' AND SQLERRM LIKE '%pass_leads_landing_path_bounds%');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF b8_state = '(never ran)' THEN b8_state := 'scaffolding failed'; b8_ok := false; END IF;
END;

INSERT INTO reh_probe VALUES
  (11, 'B1 POSITIVE: a 40 char tag (the route''s MAX_CODE_LEN) is ACCEPTED', coalesce(b1_state, '(probe row missing)'), coalesce(b1_ok, false)),
  (12, 'B2 a 41 char tag is refused by pass_leads_attr_tag_bounds', coalesce(b2_state, '(probe row missing)'), coalesce(b2_ok, false)),
  (13, 'B3 the empty string is refused, so "no tag" is NULL and only NULL', coalesce(b3_state, '(probe row missing)'), coalesce(b3_ok, false)),
  (14, 'B4 a jsonb array in first_touch is refused; it must be an object', coalesce(b4_state, '(probe row missing)'), coalesce(b4_ok, false)),
  (15, 'B5 POSITIVE: the REAL first_touch object is ACCEPTED, with its length printed', coalesce(b5_state, '(probe row missing)'), coalesce(b5_ok, false)),
  (16, 'B6 a 3000 char first_touch payload is refused', coalesce(b6_state, '(probe row missing)'), coalesce(b6_ok, false)),
  (17, 'B7 POSITIVE: a 200 char landing_path is ACCEPTED', coalesce(b7_state, '(probe row missing)'), coalesce(b7_ok, false)),
  (18, 'B8 a 201 char landing_path is refused BY THE PATH constraint, named', coalesce(b8_state, '(probe row missing)'), coalesce(b8_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART C: the restrictive policy, all four directions.
--
-- C2 and C4 are POSITIVE CONTROLS and the part that makes C1 and C3 mean
-- anything. Without C2, C1's refusal is equally consistent with anon being
-- unable to insert a pass lead at all -- which would mean the pass form is
-- broken and this rehearsal just reported it as a pass.
-- ══════════════════════════════════════════════════════════════════════════

-- C1: anon, with ONE attribution column set. Refused by RLS, 42501.
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, utm_campaign)
    VALUES (k_slug, k_partner, 'Reh Anon Tagged', '+573001234567', 'reh-c1@example.com', 'RH-CONE',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.', 'forged-campaign');
    c1_state := 'SUCCEEDED -- anon forged a utm_campaign on a lead';
    c1_ok := false;
  EXCEPTION WHEN OTHERS THEN
    c1_state := SQLSTATE || ' ' || SQLERRM;
    c1_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF c1_state = '(never ran)' THEN c1_state := 'scaffolding failed'; c1_ok := false; END IF;
END;

-- C2: POSITIVE CONTROL. The same anon insert with every attribution column left
-- NULL must SUCCEED, because that is the live pass form on /pase/[slug] and a
-- FAIL here means this migration broke it.
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text)
    VALUES (k_slug, k_partner, 'Reh Anon Plain', '+573001234567', 'reh-c2@example.com', 'RH-CTWO',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.');
    c2_state := 'anon inserted a plain lead, as the live pass form does';
    c2_ok := true;
  EXCEPTION WHEN OTHERS THEN
    c2_state := 'REFUSED a plain anon lead -- THE PASS FORM IS BROKEN: ' || SQLSTATE || ' ' || SQLERRM;
    c2_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF c2_state = '(never ran)' THEN c2_state := 'scaffolding failed'; c2_ok := false; END IF;
END;

-- C3: AN ADMIN is refused too. This is 208's finding reproduced for these seven
-- columns: "Admins manage pass leads" is a second PERMISSIVE policy and
-- permissive policies OR, so an admin insert passes on that policy alone. Only
-- the restrictive one reaches them. Without this arm the whole reason the policy
-- is RESTRICTIVE rather than another permissive clause is untested.
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, attr_ref)
    VALUES (k_slug, k_partner, 'Reh Admin Tagged', '+573001234567', 'reh-c3@example.com', 'RH-CTRE',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.', 'FORGED');
    c3_state := 'SUCCEEDED -- an ADMIN forged an attr_ref; the policy is not restrictive enough';
    c3_ok := false;
  EXCEPTION WHEN OTHERS THEN
    c3_state := SQLSTATE || ' ' || SQLERRM;
    c3_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF c3_state = '(never ran)' THEN c3_state := 'scaffolding failed'; c3_ok := false; END IF;
END;

-- C4: POSITIVE CONTROL. The service role writes ALL SEVEN, because that is
-- /api/pase and it is the entire point of the feature. Read back from the ROW
-- rather than trusting the insert, and every column asserted individually, so
-- one silently dropped column cannot hide behind six that landed.
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code,
                                   consent_text, attr_ref, utm_source, utm_medium,
                                   utm_campaign, utm_content, landing_path, first_touch)
    VALUES (k_slug, k_partner, 'Reh Service All', '+573001234567', 'reh-c4@example.com', 'RH-CFOR',
            'Autorizo el tratamiento de mis datos para esta clase de prueba.',
            'A7K2QX', 'instagram', 'social', 'hyrox-oct', 'reel-01', '/', k_first_touch)
    RETURNING id INTO v_id;
    SELECT 'attr_ref=' || coalesce(l.attr_ref, 'NULL')
        || ' utm_source=' || coalesce(l.utm_source, 'NULL')
        || ' utm_medium=' || coalesce(l.utm_medium, 'NULL')
        || ' utm_campaign=' || coalesce(l.utm_campaign, 'NULL')
        || ' utm_content=' || coalesce(l.utm_content, 'NULL')
        || ' landing_path=' || coalesce(l.landing_path, 'NULL')
        || ' first_touch.src=' || coalesce(l.first_touch ->> 'src', 'NULL')
      INTO v_txt
      FROM public.pass_leads l WHERE l.id = v_id;
    c4_state := v_txt;
    SELECT count(*) INTO v_n FROM public.pass_leads l
     WHERE l.id = v_id
       AND l.attr_ref = 'A7K2QX' AND l.utm_source = 'instagram' AND l.utm_medium = 'social'
       AND l.utm_campaign = 'hyrox-oct' AND l.utm_content = 'reel-01' AND l.landing_path = '/'
       AND l.first_touch ->> 'src' = 'runclub';
    c4_ok := (v_n = 1);
  EXCEPTION WHEN OTHERS THEN
    c4_state := 'the service role could not write attribution: ' || SQLSTATE || ' ' || SQLERRM;
    c4_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF c4_state = '(never ran)' THEN c4_state := 'scaffolding failed'; c4_ok := false; END IF;
END;

INSERT INTO reh_probe VALUES
  (19, 'C1 anon with a utm_campaign set is refused 42501', coalesce(c1_state, '(probe row missing)'), coalesce(c1_ok, false)),
  (20, 'C2 POSITIVE CONTROL: anon with no attribution still inserts (the live pass form)', coalesce(c2_state, '(probe row missing)'), coalesce(c2_ok, false)),
  (21, 'C3 an ADMIN with attr_ref set is refused too (permissive policies OR; only RESTRICTIVE binds them)', coalesce(c3_state, '(probe row missing)'), coalesce(c3_ok, false)),
  (22, 'C4 POSITIVE CONTROL: the service role writes all seven, read back per column', coalesce(c4_state, '(probe row missing)'), coalesce(c4_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART D: guard non-vacuity.
--
-- Each arm reintroduces the mistake its guard names and requires the guard to
-- raise with that guard's own message. The guard condition is copied verbatim
-- from the migration, which is the house shape (174 Part F, 175 Part D) and its
-- residual risk is stated plainly: this proves the LOGIC fires, while Part A
-- proves the migration's actual block runs clean on this database.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- D1: a column is missing
  -- CASCADE, because 211's own restrictive policy references this column:
  -- a bare DROP COLUMN raises 2BP01 ("other objects depend on it") and this
  -- arm would then be catching a dependency error rather than the guard. The
  -- policy comes back with the rest when the subtransaction unwinds.
  ALTER TABLE public.pass_leads DROP COLUMN utm_content CASCADE;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.pass_leads'::regclass
                    AND attname = 'utm_content' AND NOT attisdropped
                    AND atttypid = 'text'::regtype) THEN
    RAISE EXCEPTION '211 ABORTED: pass_leads.% is missing or is not text.', 'utm_content';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d1m := SQLERRM; d1 := SQLERRM LIKE '211 ABORTED: pass_leads.utm_content is missing or is not text.%';
END;

BEGIN  -- D2: first_touch is the wrong type
  ALTER TABLE public.pass_leads DROP COLUMN first_touch CASCADE;
  ALTER TABLE public.pass_leads ADD COLUMN first_touch text;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.pass_leads'::regclass
                    AND attname = 'first_touch' AND NOT attisdropped
                    AND atttypid = 'jsonb'::regtype) THEN
    RAISE EXCEPTION '211 ABORTED: pass_leads.first_touch is missing or is not jsonb.';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d2m := SQLERRM; d2 := SQLERRM LIKE '211 ABORTED: pass_leads.first_touch is missing or is not jsonb.%';
END;

BEGIN  -- D3: a size CHECK was dropped
  ALTER TABLE public.pass_leads DROP CONSTRAINT pass_leads_first_touch_bounds;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.pass_leads'::regclass
                    AND conname = 'pass_leads_first_touch_bounds' AND contype = 'c' AND convalidated) THEN
    RAISE EXCEPTION '211 ABORTED: CHECK % is missing or not validated.', 'pass_leads_first_touch_bounds';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d3m := SQLERRM; d3 := SQLERRM LIKE '211 ABORTED: CHECK pass_leads_first_touch_bounds is missing or not validated.%';
END;

BEGIN  -- D4: a CHECK exists but was added NOT VALID
  --
  -- THIS ARM IS WHY THE GUARD READS convalidated. A NOT VALID constraint is
  -- present in pg_constraint and binds new rows but not existing ones, so a
  -- guard that only asked "does this constraint exist" would pass over a table
  -- where the bound had never been applied to anything already in it.
  ALTER TABLE public.pass_leads DROP CONSTRAINT pass_leads_landing_path_bounds;
  ALTER TABLE public.pass_leads
    ADD CONSTRAINT pass_leads_landing_path_bounds
    CHECK (landing_path IS NULL OR char_length(landing_path) BETWEEN 1 AND 200) NOT VALID;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.pass_leads'::regclass
                    AND conname = 'pass_leads_landing_path_bounds' AND contype = 'c' AND convalidated) THEN
    RAISE EXCEPTION '211 ABORTED: CHECK % is missing or not validated.', 'pass_leads_landing_path_bounds';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d4m := SQLERRM; d4 := SQLERRM LIKE '211 ABORTED: CHECK pass_leads_landing_path_bounds is missing or not validated.%';
END;

BEGIN  -- D5: the policy is PERMISSIVE instead of RESTRICTIVE
  --
  -- The mutation that matters most, because a permissive version of this policy
  -- is green on every catalog check that does not read `permissive` and
  -- constrains NOBODY: it would simply OR with the two permissive policies that
  -- already admit the insert.
  DROP POLICY "Attribution columns are server only" ON public.pass_leads;
  CREATE POLICY "Attribution columns are server only" ON public.pass_leads
    FOR INSERT WITH CHECK (attr_ref IS NULL AND utm_source IS NULL AND utm_medium IS NULL
                       AND utm_campaign IS NULL AND utm_content IS NULL
                       AND landing_path IS NULL AND first_touch IS NULL);
  SELECT roles::text || ' ' || cmd || ' ' || permissive INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads'
     AND policyname = 'Attribution columns are server only';
  IF (SELECT with_check FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'pass_leads'
         AND policyname = 'Attribution columns are server only') IS NULL
     OR (SELECT permissive FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'pass_leads'
            AND policyname = 'Attribution columns are server only') <> 'RESTRICTIVE' THEN
    RAISE EXCEPTION '211 ABORTED: the attribution policy is missing or is not RESTRICTIVE, FOR INSERT, for all roles.';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d5m := SQLERRM; d5 := SQLERRM LIKE '211 ABORTED: the attribution policy is missing or is not RESTRICTIVE%';
END;

BEGIN  -- D6: the policy lost one of its seven clauses
  DROP POLICY "Attribution columns are server only" ON public.pass_leads;
  CREATE POLICY "Attribution columns are server only" ON public.pass_leads
    AS RESTRICTIVE FOR INSERT
    WITH CHECK (attr_ref IS NULL AND utm_source IS NULL AND utm_medium IS NULL
            AND utm_campaign IS NULL AND utm_content IS NULL AND landing_path IS NULL);
  SELECT with_check INTO v_txt FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads'
     AND policyname = 'Attribution columns are server only';
  IF position('first_touch IS NULL' IN v_txt) = 0 THEN
    RAISE EXCEPTION '211 ABORTED: the restrictive policy has no "% IS NULL" clause.', 'first_touch';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d6m := SQLERRM; d6 := SQLERRM LIKE '211 ABORTED: the restrictive policy has no "first_touch IS NULL" clause.%';
END;

BEGIN  -- D7: this file recreated the claim policy and dropped 204's clauses
  --
  -- The failure the whole "separate restrictive policy" decision exists to make
  -- impossible, reintroduced here as if someone had appended to the claim policy
  -- the way 201 and 204 do.
  DROP POLICY "Anyone can claim a pass" ON public.pass_leads;
  CREATE POLICY "Anyone can claim a pass" ON public.pass_leads
    FOR INSERT WITH CHECK (char_length(name) BETWEEN 2 AND 80 AND public.pass_is_active(partner_id, slug));
  IF position('referred_by_athlete_id IS NULL' IN
              (SELECT with_check FROM pg_policies WHERE schemaname = 'public'
                AND tablename = 'pass_leads' AND policyname = 'Anyone can claim a pass')) = 0 THEN
    RAISE EXCEPTION '211 ABORTED: the claim policy lost 204''s clauses, so something here recreated it.';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d7m := SQLERRM;
  -- TWO quotes, not four. The raised message contains 204's with one
  -- apostrophe, so the LIKE pattern needs it escaped once. At four the pattern
  -- could never match and this arm reported FAIL over a guard that had fired
  -- correctly -- the harness run is what showed the message and the verdict
  -- disagreeing.
  d7 := SQLERRM LIKE '211 ABORTED: the claim policy lost 204''s clauses%';
END;

BEGIN  -- D8: authenticated loses SELECT on one new column
  --
  -- THE COLUMN-LEVEL ARM, and the reason the guard asks has_column_privilege
  -- per column rather than has_table_privilege once. 173's grant is table level,
  -- so a REVOKE of one column is the realistic way this breaks: the partner
  -- leads view would 42501 on a column it renders, and a table-level check would
  -- stay green because the other columns are still granted.
  -- TABLE LEVEL FIRST, THEN THE COLUMNS BACK. This is the asymmetry CLAUDE.md
  -- records from the other direction: 173 granted SELECT at TABLE level, and a
  -- REVOKE of ONE COLUMN against a table-level grant IS A NO-OP. The first
  -- version of this arm did exactly that and reported GUARD_DID_NOT_FIRE -- it
  -- was not testing the guard, it was failing to create the condition. Found by
  -- running it, not by reading it.
  --
  -- So: drop the table-level grant, then hand back every column EXCEPT
  -- utm_medium, which is the only way to put `authenticated` in the state a
  -- later migration could really leave it in.
  REVOKE SELECT ON public.pass_leads FROM authenticated;
  GRANT SELECT (id, created_at, slug, partner_id, instructor_id, name, whatsapp, email,
                choice_1, choice_2, src, code, pass_code, consent_text, consent_at,
                user_agent, notified_at, contacted_at, tribe_user_id,
                attended_at, attended_marked_by, attended_method,
                attr_ref, utm_source, utm_campaign, utm_content, landing_path, first_touch)
    ON public.pass_leads TO authenticated;
  IF NOT has_column_privilege('authenticated', 'public.pass_leads', 'utm_medium', 'SELECT') THEN
    RAISE EXCEPTION '211 ABORTED: authenticated cannot SELECT pass_leads.%; the partner leads view would 42501.', 'utm_medium';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d8m := SQLERRM;
  d8 := SQLERRM LIKE '211 ABORTED: authenticated cannot SELECT pass_leads.utm_medium%';
END;

BEGIN  -- D9: a client role gains UPDATE on one column
  GRANT UPDATE (utm_campaign) ON public.pass_leads TO authenticated;
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '211 ABORTED: a client role holds UPDATE on pass_leads.';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d9m := SQLERRM; d9 := SQLERRM LIKE '211 ABORTED: a client role holds UPDATE on pass_leads.%';
END;

INSERT INTO reh_probe VALUES
  (23, 'D1 aborts when an attribution column is missing, naming it', coalesce(d1m, '(probe row missing)'), coalesce(d1, false)),
  (24, 'D2 aborts when first_touch is text instead of jsonb', coalesce(d2m, '(probe row missing)'), coalesce(d2, false)),
  (25, 'D3 aborts when a size CHECK was dropped', coalesce(d3m, '(probe row missing)'), coalesce(d3, false)),
  (26, 'D4 aborts when a CHECK exists but was added NOT VALID (which "does it exist" could not see)', coalesce(d4m, '(probe row missing)'), coalesce(d4, false)),
  (27, 'D5 aborts when the policy is PERMISSIVE, which would constrain nobody', coalesce(d5m, '(probe row missing)'), coalesce(d5, false)),
  (28, 'D6 aborts when the restrictive policy loses a clause, naming the column', coalesce(d6m, '(probe row missing)'), coalesce(d6, false)),
  (29, 'D7 aborts if anything here recreated the claim policy and lost 204''s clauses', coalesce(d7m, '(probe row missing)'), coalesce(d7, false)),
  (30, 'D8 aborts on a COLUMN-level SELECT revoke, which has_table_privilege could not see', coalesce(d8m, '(probe row missing)'), coalesce(d8, false)),
  (31, 'D9 aborts on a COLUMN-level UPDATE grant to a client role', coalesce(d9m, '(probe row missing)'), coalesce(d9, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART E: idempotence.
--
-- Part D mutated the schema on purpose, so E re-runs the body's own statements
-- and asserts the end state is the SAME state, not merely a state without
-- errors. This is the re-run a hand-applied file actually gets: somebody is
-- unsure whether the first paste took.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  ALTER TABLE public.pass_leads
    ADD COLUMN IF NOT EXISTS attr_ref     text,
    ADD COLUMN IF NOT EXISTS utm_source   text,
    ADD COLUMN IF NOT EXISTS utm_medium   text,
    ADD COLUMN IF NOT EXISTS utm_campaign text,
    ADD COLUMN IF NOT EXISTS utm_content  text,
    ADD COLUMN IF NOT EXISTS landing_path text,
    ADD COLUMN IF NOT EXISTS first_touch  jsonb;

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
  ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_landing_path_bounds;
  ALTER TABLE public.pass_leads
    ADD CONSTRAINT pass_leads_landing_path_bounds
    CHECK (landing_path IS NULL OR char_length(landing_path) BETWEEN 1 AND 200);
  ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_first_touch_bounds;
  ALTER TABLE public.pass_leads
    ADD CONSTRAINT pass_leads_first_touch_bounds
    CHECK (first_touch IS NULL
           OR (jsonb_typeof(first_touch) = 'object' AND length(first_touch::text) <= 2000));

  DROP POLICY IF EXISTS "Attribution columns are server only" ON public.pass_leads;
  CREATE POLICY "Attribution columns are server only" ON public.pass_leads
    AS RESTRICTIVE FOR INSERT
    WITH CHECK (attr_ref IS NULL AND utm_source IS NULL AND utm_medium IS NULL
            AND utm_campaign IS NULL AND utm_content IS NULL AND landing_path IS NULL
            AND first_touch IS NULL);

  e1_state := 'columns=' || (SELECT count(*) FROM pg_attribute
                              WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
                                AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                                                'utm_content', 'landing_path', 'first_touch'))
           || ' checks=' || (SELECT count(*) FROM pg_constraint
                              WHERE conrelid = 'public.pass_leads'::regclass AND contype = 'c' AND convalidated
                                AND conname IN ('pass_leads_attr_tag_bounds', 'pass_leads_landing_path_bounds',
                                                'pass_leads_first_touch_bounds'))
           || ' policies_named=' || (SELECT count(*) FROM pg_policies
                                      WHERE schemaname = 'public' AND tablename = 'pass_leads'
                                        AND policyname = 'Attribution columns are server only')
           || ' total_policies=' || (SELECT count(*) FROM pg_policies
                                      WHERE schemaname = 'public' AND tablename = 'pass_leads');
  -- 7 columns, 3 validated CHECKs, the policy present exactly ONCE (not
  -- duplicated by the re-run), and 5 policies in total.
  e1_ok := (SELECT count(*) FROM pg_attribute
             WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
               AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                               'utm_content', 'landing_path', 'first_touch')) = 7
       AND (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.pass_leads'::regclass AND contype = 'c' AND convalidated
               AND conname IN ('pass_leads_attr_tag_bounds', 'pass_leads_landing_path_bounds',
                               'pass_leads_first_touch_bounds')) = 3
       AND (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'pass_leads'
               AND policyname = 'Attribution columns are server only') = 1;
EXCEPTION WHEN OTHERS THEN
  e1_state := 'second run raised: ' || SQLSTATE || ' ' || SQLERRM; e1_ok := false;
END;

INSERT INTO reh_probe VALUES
  (32, 'E1 a second run restores the exact end state rather than erroring or duplicating',
       coalesce(e1_state, '(probe row missing)'), coalesce(e1_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART F: the pre-existing facts this design rests on.
--
-- Each of these is a premise the migration's header asserts. They are measured
-- here rather than inherited from reading a migration file, because 211's
-- reasoning is wrong in a different way if any of them is false, and nothing
-- else in this run would say so.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- F1: anon really does hold table-level INSERT on pass_leads
  -- If this is FALSE, the restrictive policy is defending a door that is already
  -- shut, and 211's central justification is wrong.
  f1_state := 'anon INSERT table-level=' || has_table_privilege('anon', 'public.pass_leads', 'INSERT')::text
           || ' any-column=' || has_any_column_privilege('anon', 'public.pass_leads', 'INSERT')::text;
  f1_ok := has_table_privilege('anon', 'public.pass_leads', 'INSERT');
EXCEPTION WHEN OTHERS THEN
  f1_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f1_ok := false;
END;

BEGIN  -- F2: authenticated's SELECT is TABLE level, which is why no grant was needed
  -- A column-level grant would have left the seven new columns unreadable and
  -- the partner leads view broken. has_table_privilege is the RIGHT question
  -- here, uniquely: the claim being tested is specifically about table level.
  f2_state := 'authenticated SELECT table-level=' || has_table_privilege('authenticated', 'public.pass_leads', 'SELECT')::text;
  f2_ok := has_table_privilege('authenticated', 'public.pass_leads', 'SELECT');
EXCEPTION WHEN OTHERS THEN
  f2_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f2_ok := false;
END;

BEGIN  -- F3: service_role has BYPASSRLS, which is why /api/pase still writes these
  SELECT coalesce(string_agg(r.rolname || ' bypassrls=' || r.rolbypassrls::text, ', '), '(no such role)')
    INTO f3_state FROM pg_roles r WHERE r.rolname = 'service_role';
  SELECT coalesce(bool_and(r.rolbypassrls), false) INTO f3_ok FROM pg_roles r WHERE r.rolname = 'service_role';
EXCEPTION WHEN OTHERS THEN
  f3_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f3_ok := false;
END;

BEGIN  -- F4: the measurement that justifies the ticket, re-taken now.
  -- Excludes this rehearsal's own rows, which would otherwise make the untagged
  -- share look better than it is -- the instrument counting itself as data.
  SELECT 'leads=' || count(*)
      || ' with src=' || count(l.src)
      || ' with code=' || count(l.code)
      || ' with neither=' || count(*) FILTER (WHERE l.src IS NULL AND l.code IS NULL)
    INTO f4_state
    FROM public.pass_leads l WHERE l.slug <> k_slug;
  f4_ok := (SELECT count(*) FROM public.pass_leads l WHERE l.slug <> k_slug) > 0;
EXCEPTION WHEN OTHERS THEN
  f4_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f4_ok := false;
END;

INSERT INTO reh_probe VALUES
  (33, 'F1 PREMISE: anon holds table-level INSERT on pass_leads, so the restrictive policy is needed', coalesce(f1_state, '(probe row missing)'), coalesce(f1_ok, false)),
  (34, 'F2 PREMISE: authenticated SELECT is TABLE level, so the seven columns need no grant', coalesce(f2_state, '(probe row missing)'), coalesce(f2_ok, false)),
  (35, 'F3 PREMISE: service_role has BYPASSRLS, so /api/pase still writes attribution', coalesce(f3_state, '(probe row missing)'), coalesce(f3_ok, false)),
  (36, 'F4 BASELINE: the live lead rows and how many carry no source at all', coalesce(f4_state, '(probe row missing)'), coalesce(f4_ok, false));

END $outer$;

-- The one result set for the transaction. Every row must read PASS. 36 of 36.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

-- ══════════════════════════════════════════════════════════════════════════
-- PART G: nothing escaped.
--
-- RUN THIS AS ITS OWN STATEMENT, AFTER THE ROLLBACK ABOVE HAS ENDED. It is
-- outside the transaction on purpose: a check placed inside would be reading a
-- database in which the migration IS applied and could not observe whether it
-- escaped. A verification cannot observe the mutation it shares a transaction
-- with. This is the only part of this file that reads live state.
--
-- Expected BEFORE apply: no attribution columns, no size CHECKs, 4 policies, no
-- reh- partner, no reh- lead, and the lead count unchanged from F4.
-- ══════════════════════════════════════════════════════════════════════════

SELECT t.seq, CASE WHEN t.passed THEN 'PASS' ELSE 'FAIL' END AS result, t.check_name, t.detail
FROM (VALUES
  (1, 'G1 none of the seven attribution columns is on the live table',
      (SELECT coalesce(string_agg(attname, ', ' ORDER BY attname), '(none, as expected)') FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')),
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')) = 0),
  (2, 'G2 none of the three size CHECKs is on the live table',
      (SELECT coalesce(string_agg(conname, ', ' ORDER BY conname), '(none, as expected)') FROM pg_constraint
        WHERE conrelid = 'public.pass_leads'::regclass AND contype = 'c'
          AND conname LIKE 'pass_leads_%bounds'),
      (SELECT count(*) FROM pg_constraint
        WHERE conrelid = 'public.pass_leads'::regclass AND contype = 'c'
          AND conname LIKE 'pass_leads_%bounds') = 0),
  (3, 'G3 pass_leads still has its four policies and no attribution or rehearsal one',
      (SELECT coalesce(string_agg(policyname, ' | ' ORDER BY policyname), '(none)') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pass_leads'),
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') = 4
      AND (SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'pass_leads'
              AND (policyname = 'Attribution columns are server only' OR policyname ILIKE 'reh %')) = 0),
  (4, 'G4 the throwaway partner did not escape',
      (SELECT coalesce(string_agg(slug, ', '), '(none, as expected)') FROM public.featured_partners
        WHERE slug LIKE 'reh%'),
      (SELECT count(*) FROM public.featured_partners WHERE slug LIKE 'reh%') = 0),
  (5, 'G5 no rehearsal lead escaped, and the real rows are untouched',
      (SELECT count(*)::text || ' leads, ' || count(*) FILTER (WHERE email LIKE 'reh-%@example.com')::text
              || ' rehearsal leads, ' || count(contacted_at)::text || ' contacted'
         FROM public.pass_leads),
      (SELECT count(*) FILTER (WHERE email LIKE 'reh-%@example.com') = 0
              AND count(*) FILTER (WHERE slug LIKE 'reh%') = 0
         FROM public.pass_leads)),
  (6, 'G6 no client role gained UPDATE, and authenticated did not lose SELECT',
      'authenticated UPDATE=' || has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')::text
      || ' anon UPDATE=' || has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')::text
      || ' authenticated SELECT=' || has_table_privilege('authenticated', 'public.pass_leads', 'SELECT')::text,
      NOT has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
      AND NOT has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')
      AND has_table_privilege('authenticated', 'public.pass_leads', 'SELECT')),
  (7, 'G7 211 is NOT recorded as applied',
      (SELECT coalesce(string_agg(migration, ', '), '(not recorded, as expected)')
         FROM public.migrations_applied WHERE migration LIKE '211%'),
      (SELECT count(*) FROM public.migrations_applied WHERE migration LIKE '211%') = 0)
) AS t(seq, check_name, detail, passed)
ORDER BY t.seq;

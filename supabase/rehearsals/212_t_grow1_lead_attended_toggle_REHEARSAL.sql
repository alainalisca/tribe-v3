-- 212_t_grow1_lead_attended_toggle_REHEARSAL.sql
--
-- Rehearsal for supabase/migrations/212_t_grow1_lead_attended_toggle.sql. Run in
-- the Supabase SQL editor. Everything through the ROLLBACK is inside
-- BEGIN ... ROLLBACK; production is not modified. ONE result set for the
-- transaction, because the editor shows only the last statement's result.
--
-- Part 0  PREREQUISITE, not under test: 211's body, because 212 is 2 of 3 and
--         its guard requires 211's restrictive policy to be in place
-- Part A  the migration body applies clean, and the catalog says what it should
-- Part B  every arm of the function's decision: admin marks and clears, the
--         OWNING partner, an ACTIVE COACH, an INACTIVE coach refused, another
--         partner refused, an ordinary athlete refused, no JWT refused, anon
--         refused before the body runs, a missing lead told apart from a
--         refusal, a re-mark that must not downgrade the door's record, and the
--         orphaned lead only an admin can reach
-- Part C  the capability question: a whole-row diff across a real call names
--         every column that moved
-- Part D  guard non-vacuity, nine arms
-- Part E  idempotence
-- Part F  the premises this design rests on, measured
-- Part G  nothing escaped -- DELIBERATELY OUTSIDE THE TRANSACTION
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE TWO ARMS THIS FILE EXISTS FOR, because they test the two decisions that
-- were judgement calls rather than house pattern.
--
-- B11, THE DOOR'S RECORD SURVIVES A LATER TAP. av_confirm_pass_attendance writes
-- attended_method = 'scan' when a coach scans a guest's QR. A toggle on the
-- leads list later must not rewrite that to 'toggle': the scan is the stronger
-- record of HOW somebody was confirmed, and overwriting it loses information
-- nothing else holds. Three coalesces in the UPDATE are what make that true, and
-- B11 is the only arm that would notice if one of them were a bare assignment.
--
-- B11 IS ALSO WHERE THE OBVIOUS VERSION OF THIS CHECK WOULD BE VACUOUS, and for
-- the reason 175's B8 records: now() is TRANSACTION START TIME, so marking twice
-- inside one transaction produces the identical timestamp and the assertion
-- passes with the coalesce deleted. So B11 seeds an explicitly OLD value --
-- 2020-01-01, a marker who is not the caller, and method 'scan' -- and then
-- marks. With the coalesces, all three survive. Without them, attended_at
-- becomes transaction time, attended_marked_by becomes the admin and
-- attended_method becomes 'toggle', and all three are unmistakable.
--
-- B12/B13, THE ORPHANED LEAD. av_can_work_door requires a non-NULL partner id
-- and returns false for EVERYONE on a NULL one, admin included, before it
-- reaches its own admin branch. 175 settled that an admin keeps working a lead
-- whose partner row was deleted, because it is still a real person who left a
-- phone number. That is the entire reason is_app_admin() is OR'd in front of
-- av_can_work_door rather than trusted inside it, and without B12 that OR looks
-- like belt-and-braces someone could tidy away.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE ACTORS ARE RESOLVED BY PROPERTY AND NOT PASTED AS IDS.
--
-- 175's rehearsal hardcodes five production uuids read on one afternoon in
-- September. They may still be right. CLAUDE.md's own rule is that a measurement
-- taken on Monday is a hypothesis by Friday, and a stale uuid here does not fail
-- loudly -- it makes an arm refuse for the wrong reason while still reporting the
-- refusal the arm was looking for, which is a green FAIL.
--
-- So every actor is resolved by the property the arm needs, asserted non-null in
-- A7 before any arm runs, and PRINTED in A7's detail. "Resolved nobody" can
-- never read as a pass.
--
-- The partner is a throwaway clone with a reh- slug, owned by a user who owns no
-- other partner row (018 made featured_partners.user_id UNIQUE), and the lead is
-- created inside this transaction. No real gym's record is written, and no real
-- lead is marked attended -- which matters more here than in 211's rehearsal,
-- because attendance is the number a gym is going to be shown.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE BODY IN PART A IS BYTE-IDENTICAL TO THE MIGRATION. It is spliced by a
-- script, not copied, and supabase/rehearsalBodyVerbatim.test.ts fails if the two
-- diverge. The migration's own BEGIN/COMMIT and its migrations_applied insert are
-- omitted, for the reasons that test states; everything between them, INCLUDING
-- THE DO GUARD BLOCK, is verbatim. 179's rehearsal spliced around its guard and
-- reported 19 green arms over a migration that aborts on it.
--
-- PART A IS PROVED BY ARRIVAL, NOT BY A ROW. The body runs as top-level
-- statements before the probe table exists, so a raising guard aborts the script
-- and there is no result table at all. The A rows re-assert the catalog facts
-- independently.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- PART 0: PREREQUISITE. 211's body, spliced verbatim, NOT UNDER TEST HERE.
--
-- 212 is 2 of 3 in T-GROW1 and the three are applied in order. Its guard
-- requires 211's restrictive policy, so run against production as it stands
-- today -- 211 not yet pasted -- the body in Part A would abort at that guard
-- and this file would report a failure of 212 that is really the absence of 211.
--
-- That is worth saying rather than just fixing: a rehearsal that cannot
-- distinguish "this migration is wrong" from "its prerequisite is missing"
-- produces a confident wrong diagnosis, which is the more expensive of the two
-- failures because a wrong verdict gets filed while a wrong measurement gets
-- re-measured.
--
-- So 211 is applied here first, as setup. It has its OWN rehearsal
-- (211_..._REHEARSAL.sql) and its arms are not repeated; the only thing asserted
-- about it here is that it landed, in Part A's row A0. If this section fails,
-- fix 211 and stop reading this file.
--
-- It stays spliced rather than summarised so the prerequisite is the real
-- prerequisite: a hand-written approximation of 211 could satisfy 212's guard
-- while differing from what production will actually have.
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
-- PART A: the migration body, spliced verbatim from
--         supabase/migrations/212_t_grow1_lead_attended_toggle.sql
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_pass_lead_attended(p_lead_id uuid, p_attended boolean)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_partner_id uuid;
  v_found      boolean;
  v_result     timestamptz;
BEGIN
  -- SECURITY DEFINER runs as the owner, so nothing below is protected by RLS
  -- and every check has to be made here. auth.uid() reads the JWT claim and is
  -- unaffected by the role switch.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_pass_lead_attended: no authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.partner_id, true INTO v_partner_id, v_found
  FROM public.pass_leads l
  WHERE l.id = p_lead_id;

  -- Gone and forbidden are different answers, told apart by error code, because
  -- the leads list has to say different things for them. Collapsing them is
  -- right at the door and wrong here.
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'set_pass_lead_attended: lead % does not exist', p_lead_id
      USING ERRCODE = 'P0002';
  END IF;

  -- av_can_work_door is the single place the per-partner rule lives (201): the
  -- partner owner, an ACTIVE coach, or an admin. is_app_admin() is OR'd in front
  -- of it for one case it cannot reach: a lead whose partner row was deleted has
  -- a NULL partner_id, and av_can_work_door returns false for everyone on a NULL
  -- partner id, admin included, before it evaluates its own admin branch.
  IF NOT (public.is_app_admin() OR public.av_can_work_door(v_partner_id)) THEN
    -- Raises rather than updating zero rows. A no-op returns successfully and
    -- the switch flips back on the next reload with no error shown, which reads
    -- as a flaky product rather than as a refusal.
    RAISE EXCEPTION 'set_pass_lead_attended: caller may not modify lead %', p_lead_id
      USING ERRCODE = '42501';
  END IF;

  -- coalesce on all three, not a bare now(): re-marking an already-attended
  -- lead must not move the timestamp, must not reassign who confirmed it, and
  -- must not rewrite HOW it was confirmed. That last one is the reason this is
  -- not simply three copies of 175's line. If the door already confirmed this
  -- guest by scanning their QR, attended_method is 'scan', and that is a
  -- stronger record than a later tap on a list. The toggle never downgrades it.
  --
  -- Clearing nulls all three together. attended_at NULL beside a surviving
  -- attended_marked_by would be a row saying nobody came and somebody saw them.
  UPDATE public.pass_leads
     SET attended_at        = CASE WHEN p_attended THEN coalesce(attended_at, now()) ELSE NULL END,
         attended_marked_by = CASE WHEN p_attended THEN coalesce(attended_marked_by, auth.uid()) ELSE NULL END,
         attended_method    = CASE WHEN p_attended THEN coalesce(attended_method, 'toggle') ELSE NULL END
   WHERE id = p_lead_id
  RETURNING attended_at INTO v_result;

  -- The caller renders THIS, not the value it asked for, so the UI can never
  -- drift from the row.
  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.set_pass_lead_attended(uuid, boolean) IS
  'The "Asistio" toggle for the admin Leads tab and the partner Leads section '
  '(T-GROW1 part E). SECURITY DEFINER because authenticated holds no UPDATE '
  'privilege on pass_leads at all, so the admin policy is unreachable from a '
  'browser client. Writes attended_at, attended_marked_by and attended_method '
  'and nothing else, by construction. Distinct from av_confirm_pass_attendance '
  '(201), which is the door''s set-only write keyed on the pass code; this one '
  'can also CLEAR, so a mis-tap is reversible. Both authorise through '
  'av_can_work_door, so the per-partner rule is not duplicated. Raises 42501 '
  'for a caller who may not work this partner''s door and P0002 for a lead that '
  'does not exist, rather than updating zero rows.';

-- Default privileges grant EXECUTE on a new function to PUBLIC, which includes
-- anon -- the key that ships in the client bundle. Revoke first, then grant the
-- one role that may call it. anon is deliberately absent: a stranger claiming a
-- pass has no business marking one attended.
REVOKE ALL ON FUNCTION public.set_pass_lead_attended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pass_lead_attended(uuid, boolean) TO authenticated;

-- ── Guards ──────────────────────────────────────────────────────────────────
--
-- Every one of these is proved to FIRE by an arm in the rehearsal that
-- reintroduces the mistake it names. A guard only ever observed staying quiet
-- has not been shown to do anything.
DO $$
DECLARE
  setters text;
  n_cols  int;
BEGIN
  -- The dependency, not the thing being built: without 201 this file compiles a
  -- function whose first authorisation call does not resolve.
  IF to_regprocedure('public.av_can_work_door(uuid)') IS NULL THEN
    RAISE EXCEPTION '212 guard: av_can_work_door() is missing -- 201 has not been applied, '
                    'so set_pass_lead_attended has no authorisation rule to call';
  END IF;

  SELECT count(*) INTO n_cols FROM pg_attribute
   WHERE attrelid = 'public.pass_leads'::regclass
     AND attname IN ('attended_at', 'attended_marked_by', 'attended_method')
     AND attnum > 0 AND NOT attisdropped;
  IF n_cols <> 3 THEN
    RAISE EXCEPTION '212 guard: pass_leads has % of the three attendance columns, expected 3 -- '
                    '201 has not been applied', n_cols;
  END IF;

  IF to_regprocedure('public.set_pass_lead_attended(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() is missing -- neither leads view '
                    'can mark anything attended';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure) THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() is not SECURITY DEFINER -- it would '
                    'run as the caller, who holds no UPDATE on pass_leads, and every toggle '
                    'would fail with 42501';
  END IF;

  -- An unpinned search_path in a SECURITY DEFINER function is the classic
  -- privilege-escalation hole: the caller chooses which schema pass_leads
  -- resolves to.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
  ) THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() has no pinned search_path';
  END IF;

  IF has_function_privilege('anon', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '212 guard: anon can EXECUTE set_pass_lead_attended() -- the key in the '
                    'client bundle could mark any lead attended, and attendance is the number '
                    'a gym is going to be shown';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '212 guard: authenticated cannot EXECUTE set_pass_lead_attended() -- the '
                    'toggle is dead for admins and partners alike';
  END IF;

  -- THE POINT OF THE WHOLE DESIGN, copied from 175 because it is the same
  -- guarantee: the function is the doorway BECAUSE the table has no other one.
  -- has_ANY_column_privilege and not has_table_privilege -- the table-level form
  -- returns false while a role genuinely holds UPDATE on a single column, which
  -- 175's rehearsal arm D7a measured on production.
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '212 guard: a client role holds UPDATE on pass_leads -- the three-column '
                    'write surface is no longer guaranteed';
  END IF;

  -- EVERY assignment target in the UPDATE's SET clause, and EXACTLY the three.
  --
  -- 175's version of this guard was proved useless by its own rehearsal when it
  -- matched only the target immediately after the word SET, so it takes the
  -- whole clause between SET and WHERE and reads every target in it. Comments
  -- are stripped first: a guard that matches prose inside the body it is reading
  -- is migration 165's finding repeated, and this body's comments name all three
  -- columns while explaining them.
  --
  -- Sorted and compared as one string rather than checked for membership, so
  -- this fails on a FOURTH column as loudly as on a missing one. A membership
  -- test would pass a body that also wrote `email = ''`.
  --
  -- COLLATE "C" is not decoration. 175's version sorted one value so ordering
  -- could not matter; three values compared against a literal means the guard's
  -- verdict depends on how the database sorts underscores, and a glibc or ICU
  -- collation can treat punctuation as secondary. Byte order is the only
  -- ordering that is the same on this database, a local stack and a rebuild.
  --
  -- The dedupe is a subquery rather than string_agg(DISTINCT ...). Postgres
  -- requires an aggregate's ORDER BY expression to appear in its argument list
  -- when DISTINCT is used, so `string_agg(DISTINCT m[1], ', ' ORDER BY m[1]
  -- COLLATE "C")` is a syntax error rather than a sorted list -- which would
  -- have aborted the migration at this guard rather than failing it.
  SELECT string_agg(s.col, ', ' ORDER BY s.col COLLATE "C") INTO setters
  FROM (
    SELECT DISTINCT m[1] AS col
    FROM pg_proc p,
         LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
         LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
         LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
    WHERE p.oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure
  ) s;

  -- ASSERT THE READ SUCCEEDED BEFORE ASSERTING WHAT IT FOUND. If the regexp
  -- above matched nothing -- a renamed clause, a reshaped body, a tokeniser
  -- change -- setters is NULL, and every property asserted about it below is a
  -- property of NULL rather than of this function. CLAUDE.md records the
  -- migration 180 version of exactly this: three independent-looking checks all
  -- reduced to `'' !~* '...'` and all passed over a function that returned
  -- distance_km. The comparison below would in fact catch NULL, since
  -- IS DISTINCT FROM is NULL-safe, but it would report it as "assigns to []",
  -- which reads as a function that writes nothing rather than as a guard that
  -- read nothing. Those need different fixes, so they get different messages.
  IF setters IS NULL THEN
    RAISE EXCEPTION '212 guard: could not read the UPDATE SET clause out of '
                    'set_pass_lead_attended at all -- the guard is broken, not the function';
  END IF;
  IF setters IS DISTINCT FROM 'attended_at, attended_marked_by, attended_method' THEN
    RAISE EXCEPTION '212 guard: the UPDATE assigns to [%], expected attended_at, attended_marked_by, attended_method', setters;
  END IF;

  -- No policy was added or changed. This file adds a function and nothing else,
  -- and that claim is cheap to assert -- but the expected TOTAL depends on 211,
  -- so 211 is named as a precondition rather than being assumed.
  --
  -- The first version of this guard asserted `= 5` with a comment saying "211
  -- left five". That is true in the apply order and it made 212 silently
  -- undeployable on its own: run against a database where 211 had not been
  -- pasted, it would abort with "pass_leads has 4 policies, expected 5", which
  -- names the symptom and not the cause, and the operator's next move would be
  -- to go looking for a missing policy rather than to apply 211. An ordering
  -- requirement that is real should say so in the error.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'pass_leads'
                    AND policyname = 'Attribution columns are server only') THEN
    RAISE EXCEPTION '212 guard: 211 has not been applied (the attribution policy is absent). '
                    'Apply 211_t_grow1_lead_attribution first; this file is 2 of 3 in T-GROW1 '
                    'and the three are applied in order.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') <> 5 THEN
    RAISE EXCEPTION '212 guard: pass_leads has % policies, expected 5 -- 212 adds none',
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads');
  END IF;

  RAISE NOTICE '212: set_pass_lead_attended installed, three columns wide, authorised through av_can_work_door.';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- The probe table
-- ══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

INSERT INTO reh_probe
SELECT t.seq, t.check_name, coalesce(t.detail, '(probe row missing)'), coalesce(t.passed, false)
FROM (VALUES
  (1, 'A0 PREREQUISITE LANDED: 211''s seven columns and its restrictive policy are in place',
      (SELECT (SELECT count(*) FROM pg_attribute
                WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
                  AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                                  'utm_content', 'landing_path', 'first_touch'))::text
             || ' of 7 columns, attribution policy '
             || CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                                   WHERE schemaname = 'public' AND tablename = 'pass_leads'
                                     AND policyname = 'Attribution columns are server only')
                     THEN 'present' ELSE 'ABSENT' END),
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')) = 7
      AND EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'pass_leads'
                     AND policyname = 'Attribution columns are server only')),
  (2, 'A1 set_pass_lead_attended(uuid,boolean) exists, returns timestamptz, SECURITY DEFINER',
      (SELECT coalesce('secdef=' || prosecdef::text || ' returns=' || pg_get_function_result(oid), '(absent)')
         FROM pg_proc WHERE oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')),
      (SELECT prosecdef AND pg_get_function_result(oid) = 'timestamp with time zone'
         FROM pg_proc WHERE oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)'))),
  (3, 'A2 its search_path is pinned',
      (SELECT coalesce(array_to_string(proconfig, ' '), '(none)')
         FROM pg_proc WHERE oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')),
      (SELECT proconfig IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
         FROM pg_proc WHERE oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)'))),
  (4, 'A3 EXECUTE: authenticated yes, anon no',
      'authenticated=' || has_function_privilege('authenticated', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')::text
      || ' anon=' || has_function_privilege('anon', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')::text,
      has_function_privilege('authenticated', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')),
  (5, 'A4 the UPDATE assigns EXACTLY the three attendance columns',
      (SELECT coalesce(string_agg(s.col, ', ' ORDER BY s.col COLLATE "C"), '(read nothing)')
         FROM (SELECT DISTINCT m[1] AS col
                 FROM pg_proc p,
                      LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
                      LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
                      LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
                WHERE p.oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')) s),
      (SELECT coalesce(string_agg(s.col, ', ' ORDER BY s.col COLLATE "C"), '')
         FROM (SELECT DISTINCT m[1] AS col
                 FROM pg_proc p,
                      LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
                      LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
                      LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
                WHERE p.oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')) s)
        = 'attended_at, attended_marked_by, attended_method'),
  (6, 'A5 the body calls av_can_work_door AND is_app_admin, so neither rule was dropped',
      (SELECT 'av_can_work_door=' || (position('av_can_work_door' IN pg_get_functiondef(oid)) > 0)::text
              || ' is_app_admin=' || (position('is_app_admin' IN pg_get_functiondef(oid)) > 0)::text
         FROM pg_proc WHERE oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')),
      (SELECT position('av_can_work_door' IN pg_get_functiondef(oid)) > 0
              AND position('is_app_admin' IN pg_get_functiondef(oid)) > 0
         FROM pg_proc WHERE oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)'))),
  (7, 'A6 no policy was added: pass_leads still has the five 211 left',
      (SELECT coalesce(string_agg(policyname, ' | ' ORDER BY policyname), '(none)') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pass_leads'),
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') = 5)
) AS t(seq, check_name, detail, passed);

DO $outer$
DECLARE
  k_slug     constant text := 'reh212-throwaway-pass';
  k_partner  uuid;
  k_owner    uuid;   -- owns k_partner and nothing else
  k_coach    uuid;   -- an ACTIVE coach of k_partner
  k_inactive uuid;   -- a coach of k_partner with is_active = false
  k_other    uuid;   -- the owner of a DIFFERENT, real partner (read only)
  k_admin    uuid;
  k_athlete  uuid;
  k_lead     uuid;   -- created in this transaction, against k_partner
  k_orphan   uuid;   -- created in this transaction, partner_id NULL
  k_absent   constant uuid := '00000000-0000-0000-0000-0000000212ab';

  a7_state  text := '(never ran)'; a7_ok  boolean := false;
  b1_state  text := '(never ran)'; b1_ok  boolean := false;
  b2_state  text := '(never ran)'; b2_ok  boolean := false;
  b3_state  text := '(never ran)'; b3_ok  boolean := false;
  b4_state  text := '(never ran)'; b4_ok  boolean := false;
  b5_state  text := '(never ran)'; b5_ok  boolean := false;
  b6_state  text := '(never ran)'; b6_ok  boolean := false;
  b7_state  text := '(never ran)'; b7_ok  boolean := false;
  b8_state  text := '(never ran)'; b8_ok  boolean := false;
  b9_state  text := '(never ran)'; b9_ok  boolean := false;
  b10_state text := '(never ran)'; b10_ok boolean := false;
  b11_state text := '(never ran)'; b11_ok boolean := false;
  b12_state text := '(never ran)'; b12_ok boolean := false;
  b13_state text := '(never ran)'; b13_ok boolean := false;
  c1_state  text := '(never ran)'; c1_ok  boolean := false;

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

  v_stamp  timestamptz;
  v_before jsonb;
  v_after  jsonb;
  v_diff   text;
  v_row    record;
  v_setters text;
  v_n      int;
  v_uniques text := '(never read)';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════
-- A7: the scaffolding. Every B arm is meaningless without it, and a NULL actor
-- would make each arm refuse for the wrong reason while still reporting the
-- refusal it was looking for.
-- ══════════════════════════════════════════════════════════════════════════
BEGIN
  SELECT u.id INTO k_admin FROM public.users u
   WHERE u.is_admin IS TRUE AND u.deleted_at IS NULL LIMIT 1;

  -- Three distinct users who own no partner row and are not admins. Ordered by
  -- id so the three are stable within one run and cannot collide.
  SELECT a.id, b.id, c.id INTO k_owner, k_coach, k_inactive
    FROM (SELECT u.id, row_number() OVER (ORDER BY u.id) rn FROM public.users u
           WHERE coalesce(u.is_admin, false) = false AND u.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM public.featured_partners fp WHERE fp.user_id = u.id)) a
    JOIN (SELECT u.id, row_number() OVER (ORDER BY u.id) rn FROM public.users u
           WHERE coalesce(u.is_admin, false) = false AND u.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM public.featured_partners fp WHERE fp.user_id = u.id)) b ON b.rn = 2
    JOIN (SELECT u.id, row_number() OVER (ORDER BY u.id) rn FROM public.users u
           WHERE coalesce(u.is_admin, false) = false AND u.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM public.featured_partners fp WHERE fp.user_id = u.id)) c ON c.rn = 3
   WHERE a.rn = 1;

  -- A fourth, for the ordinary-athlete arm, so it is nobody's coach or owner.
  SELECT u.id INTO k_athlete FROM public.users u
   WHERE coalesce(u.is_admin, false) = false AND u.deleted_at IS NULL
     AND u.id NOT IN (k_owner, k_coach, k_inactive)
     AND NOT EXISTS (SELECT 1 FROM public.featured_partners fp WHERE fp.user_id = u.id)
   LIMIT 1;

  -- A real, different partner's owner. Read only: this arm asks whether somebody
  -- who would pass any check that merely said "are you a partner" is refused.
  SELECT fp.user_id INTO k_other FROM public.featured_partners fp
   WHERE fp.user_id IS NOT NULL AND fp.slug NOT LIKE 'reh%' LIMIT 1;

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
        'user_id', k_owner,
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

  INSERT INTO public.partner_instructors (partner_id, instructor_id, is_active)
  VALUES (k_partner, k_coach, true), (k_partner, k_inactive, false);

  -- The leads. Inserted as the owner of the table (this session), which is the
  -- same path the service role takes and bypasses RLS, so no pass config is
  -- needed and the claim policy is not involved.
  INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text)
  VALUES (k_slug, k_partner, 'Reh Guest', '+573001234567', 'reh212-a@example.com', 'RH-LEAD',
          'Autorizo el tratamiento de mis datos para esta clase de prueba.')
  RETURNING id INTO k_lead;

  -- partner_id NULL is the ON DELETE SET NULL state: a lead whose gym's row was
  -- deleted. av_can_work_door cannot reach it for anybody.
  INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text)
  VALUES (k_slug, NULL, 'Reh Orphan', '+573001234568', 'reh212-b@example.com', 'RH-ORPH',
          'Autorizo el tratamiento de mis datos para esta clase de prueba.')
  RETURNING id INTO k_orphan;


  /*
   * THE CLONE'S ASSUMPTION, CHECKED RATHER THAN TRUSTED.
   *
   * The clone overrides id, user_id and slug because those are the three unique
   * constraints featured_partners has. That list came from reading migrations
   * 018 and 163, and CLAUDE.md is explicit that the repo is not authoritative
   * about production in either direction -- protect_verified_instructor is live
   * and appears in no migration here.
   *
   * So the list is resolved from pg_index at RUN TIME. A fourth unique index
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

  a7_state := 'unexpected_uniques=' || v_uniques || ' partner=' || coalesce(k_partner::text, 'NULL')
           || ' owner=' || coalesce(k_owner::text, 'NULL')
           || ' coach=' || coalesce(k_coach::text, 'NULL')
           || ' inactive_coach=' || coalesce(k_inactive::text, 'NULL')
           || ' other_partner_owner=' || coalesce(k_other::text, 'NULL')
           || ' admin=' || coalesce(k_admin::text, 'NULL')
           || ' athlete=' || coalesce(k_athlete::text, 'NULL')
           || ' lead=' || coalesce(k_lead::text, 'NULL')
           || ' orphan=' || coalesce(k_orphan::text, 'NULL');
  a7_ok := k_partner IS NOT NULL AND k_owner IS NOT NULL AND k_coach IS NOT NULL
       AND k_inactive IS NOT NULL AND k_other IS NOT NULL AND k_admin IS NOT NULL
       AND k_athlete IS NOT NULL AND k_lead IS NOT NULL AND k_orphan IS NOT NULL
       -- Distinctness is part of the requirement, not an accident of the query:
       -- if owner and coach resolved to the same person, B3 and B4 would be one
       -- arm reported twice and the coach path would be untested.
       AND k_owner <> k_coach AND k_owner <> k_inactive AND k_coach <> k_inactive
       AND k_other <> k_owner AND k_athlete NOT IN (k_owner, k_coach, k_inactive)
       -- Every unique constraint the clone must dodge is one it overrides.
       AND v_uniques = '(none)';
EXCEPTION WHEN OTHERS THEN
  a7_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; a7_ok := false;
END;

INSERT INTO reh_probe VALUES
  (8, 'A7 SCAFFOLDING: seven distinct actors, a throwaway owned partner, two leads',
      coalesce(a7_state, '(probe row missing)'), coalesce(a7_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART B: what the function decides.
--
-- Each arm sets the JWT claim and the role, calls, restores both in its handler,
-- and reads the RESULT BACK OFF THE ROW rather than trusting the return value
-- where the row is the thing being asserted.
-- ══════════════════════════════════════════════════════════════════════════

-- B1: an admin marks attended. All three columns must move together, and method
-- must be 'toggle' -- the value 201's CHECK reserved for this screen.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b1_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b1_ok := v_stamp IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b1_state := SQLSTATE || ' ' || SQLERRM; b1_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT attended_at, attended_marked_by, attended_method INTO v_row
    FROM public.pass_leads WHERE id = k_lead;
  b1_state := b1_state || '; row: at=' || coalesce(v_row.attended_at::text, 'NULL')
           || ' by=' || coalesce(v_row.attended_marked_by::text, 'NULL')
           || ' method=' || coalesce(v_row.attended_method, 'NULL');
  b1_ok := b1_ok AND v_row.attended_at IS NOT NULL
       AND v_row.attended_marked_by = k_admin
       AND v_row.attended_method = 'toggle';
  RAISE EXCEPTION 'REH_UNWIND_B1';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B1' AND b1_state = '(never ran)' THEN
    b1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b1_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B2: the same admin clears it. Off must be reachable, or a mis-tap is permanent
-- and the attended count can only ever go up. ALL THREE must go NULL: a cleared
-- attended_at beside a surviving attended_marked_by is a row saying nobody came
-- and somebody saw them.
BEGIN
  UPDATE public.pass_leads
     SET attended_at = now(), attended_marked_by = k_admin, attended_method = 'toggle'
   WHERE id = k_lead;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, false);
    b2_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b2_ok := v_stamp IS NULL;
  EXCEPTION WHEN OTHERS THEN
    b2_state := SQLSTATE || ' ' || SQLERRM; b2_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT attended_at, attended_marked_by, attended_method INTO v_row
    FROM public.pass_leads WHERE id = k_lead;
  b2_state := b2_state || '; row: at=' || coalesce(v_row.attended_at::text, 'NULL')
           || ' by=' || coalesce(v_row.attended_marked_by::text, 'NULL')
           || ' method=' || coalesce(v_row.attended_method, 'NULL');
  b2_ok := b2_ok AND v_row.attended_at IS NULL AND v_row.attended_marked_by IS NULL
       AND v_row.attended_method IS NULL;
  RAISE EXCEPTION 'REH_UNWIND_B2';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B2' AND b2_state = '(never ran)' THEN
    b2_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b2_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B3: the OWNING partner, not an admin. This is Leo, and it is the whole feature.
BEGIN
  UPDATE public.pass_leads SET attended_at = NULL, attended_marked_by = NULL, attended_method = NULL WHERE id = k_lead;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_owner::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b3_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b3_ok := v_stamp IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b3_state := SQLSTATE || ' ' || SQLERRM; b3_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B3';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B3' AND b3_state = '(never ran)' THEN
    b3_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b3_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B4: an ACTIVE COACH. This is the arm that proves reusing av_can_work_door was
-- a real decision and not a convenience: a coach who marks attendance at the
-- door can mark it on the list, from one rule in one place.
BEGIN
  UPDATE public.pass_leads SET attended_at = NULL, attended_marked_by = NULL, attended_method = NULL WHERE id = k_lead;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_coach::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b4_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b4_ok := v_stamp IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b4_state := SQLSTATE || ' ' || SQLERRM; b4_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B4';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B4' AND b4_state = '(never ran)' THEN
    b4_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b4_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B5: an INACTIVE coach is refused. is_active IS TRUE means FALSE and NULL are
-- both refused, which is a property of av_can_work_door that a test of the
-- active case alone would never exercise.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_inactive::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b5_state := 'SUCCEEDED -- a coach with is_active = false marked attendance';
    b5_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b5_state := SQLSTATE || ' ' || SQLERRM; b5_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B5';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B5' AND b5_state = '(never ran)' THEN
    b5_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b5_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B6: a DIFFERENT real partner's owner. Not a stranger: somebody who owns a
-- featured_partners row and passes any check that merely asks "are you a
-- partner". This is the spec's negative test -- Leo cannot touch another gym's
-- leads -- run from the other side.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_other::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b6_state := 'SUCCEEDED -- another partner marked this partner''s lead attended';
    b6_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b6_state := SQLSTATE || ' ' || SQLERRM; b6_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B6';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B6' AND b6_state = '(never ran)' THEN
    b6_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b6_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B7: an ordinary athlete.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_athlete::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b7_state := 'SUCCEEDED -- an ordinary account marked a lead attended';
    b7_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b7_state := SQLSTATE || ' ' || SQLERRM; b7_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B7';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B7' AND b7_state = '(never ran)' THEN
    b7_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b7_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B8: the authenticated ROLE with NO jwt. This is the body's auth.uid() IS NULL
-- branch, and it is a DIFFERENT refusal from B9's: here the caller may execute
-- the function and is turned away inside it. The message is checked, not only
-- the code, so this arm cannot be satisfied by the authorisation branch firing.
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b8_state := 'SUCCEEDED with no caller';
    b8_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b8_state := SQLSTATE || ' ' || SQLERRM;
    b8_ok := (SQLSTATE = '42501' AND SQLERRM LIKE '%no authenticated caller%');
  END;
  RESET ROLE;
  RAISE EXCEPTION 'REH_UNWIND_B8';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B8' AND b8_state = '(never ran)' THEN
    b8_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b8_ok := false;
  END IF;
  RESET ROLE;
END;

-- B9: anon cannot reach the function at all. The refusal comes from the GRANT,
-- before a line of the body runs, which is the stronger of the two and is why
-- both are checked rather than one standing in for the other.
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b9_state := 'SUCCEEDED as anon';
    b9_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b9_state := SQLSTATE || ' ' || SQLERRM;
    b9_ok := (SQLSTATE = '42501' AND SQLERRM ILIKE '%permission denied for function%');
  END;
  RESET ROLE;
  RAISE EXCEPTION 'REH_UNWIND_B9';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B9' AND b9_state = '(never ran)' THEN
    b9_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b9_ok := false;
  END IF;
  RESET ROLE;
END;

-- B10: a lead that does not exist is P0002, not 42501. An admin who pastes a
-- stale id should be told the row is gone, not that they lack permission -- the
-- distinction the door deliberately collapses and a panel must not.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_absent, true);
    b10_state := 'SUCCEEDED on a lead that does not exist';
    b10_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b10_state := SQLSTATE || ' ' || SQLERRM; b10_ok := (SQLSTATE = 'P0002');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B10';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B10' AND b10_state = '(never ran)' THEN
    b10_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b10_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B11: RE-MARKING PRESERVES ALL THREE, INCLUDING THE DOOR'S 'scan'.
--
-- Seeded with an explicitly old timestamp, a marker who is NOT the caller, and
-- method 'scan'. A mark-twice version of this check cannot fail: now() is
-- transaction start time, so a second call returns the identical value with the
-- coalesce deleted. 2020 against transaction time, the coach's id against the
-- admin's, and 'scan' against 'toggle' are each unmistakable.
BEGIN
  UPDATE public.pass_leads
     SET attended_at = timestamptz '2020-01-01 09:00:00-05',
         attended_marked_by = k_coach,
         attended_method = 'scan'
   WHERE id = k_lead;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_lead, true);
    b11_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
  EXCEPTION WHEN OTHERS THEN
    b11_state := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT attended_at, attended_marked_by, attended_method INTO v_row
    FROM public.pass_leads WHERE id = k_lead;
  b11_state := b11_state || '; row: at=' || coalesce(v_row.attended_at::text, 'NULL')
            || ' by=' || coalesce(v_row.attended_marked_by::text, 'NULL')
            || ' method=' || coalesce(v_row.attended_method, 'NULL');
  b11_ok := v_row.attended_at = timestamptz '2020-01-01 09:00:00-05'
        AND v_row.attended_marked_by = k_coach
        AND v_row.attended_method = 'scan';
  RAISE EXCEPTION 'REH_UNWIND_B11';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B11' AND b11_state = '(never ran)' THEN
    b11_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b11_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B12: an ADMIN can work an ORPHANED lead (partner_id NULL). This is the case
-- av_can_work_door cannot reach for anybody, and the only reason is_app_admin()
-- is OR'd in FRONT of it rather than trusted inside it.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_orphan, true);
    b12_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b12_ok := v_stamp IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b12_state := SQLSTATE || ' ' || SQLERRM; b12_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- av_can_work_door(NULL) is read AFTER the role is restored, and that is not
  -- tidiness. 201 revokes EXECUTE on it from authenticated -- F3 in this very
  -- file asserts exactly that -- so reading it inside the role switch raised
  -- 42501 and the arm reported a refusal of the DETAIL STRING as a refusal of
  -- the toggle. Found by running the file; the arm looked right.
  --
  -- It is in the detail because it is the whole point of B12: the helper returns
  -- false for everybody on a NULL partner id, so an admin reaching this lead
  -- proves the is_app_admin() OR in front of it is load bearing.
  b12_state := b12_state || '; av_can_work_door(NULL) = '
            || coalesce(public.av_can_work_door(NULL)::text, 'NULL');
  RAISE EXCEPTION 'REH_UNWIND_B12';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B12' AND b12_state = '(never ran)' THEN
    b12_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b12_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B13: the orphan's FORMER owner cannot. An orphaned lead is admin-only, which
-- is 175's settled behaviour: the partner row is gone, so there is nobody for
-- ownership to point at, and the lead is still a real person's phone number.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_owner::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_attended(k_orphan, true);
    b13_state := 'SUCCEEDED -- a partner marked an orphaned lead attended';
    b13_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b13_state := SQLSTATE || ' ' || SQLERRM; b13_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B13';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B13' AND b13_state = '(never ran)' THEN
    b13_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b13_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

INSERT INTO reh_probe VALUES
  ( 9, 'B1 an admin marks attended; all three columns move and method is toggle', coalesce(b1_state, '(probe row missing)'), coalesce(b1_ok, false)),
  ( 10, 'B2 an admin clears it; ALL THREE go NULL together', coalesce(b2_state, '(probe row missing)'), coalesce(b2_ok, false)),
  (11, 'B3 the OWNING partner marks their own lead without being an admin', coalesce(b3_state, '(probe row missing)'), coalesce(b3_ok, false)),
  (12, 'B4 an ACTIVE COACH marks it, through the same av_can_work_door rule as the door', coalesce(b4_state, '(probe row missing)'), coalesce(b4_ok, false)),
  (13, 'B5 an INACTIVE coach is refused 42501 (is_active IS TRUE refuses FALSE and NULL)', coalesce(b5_state, '(probe row missing)'), coalesce(b5_ok, false)),
  (14, 'B6 a DIFFERENT active partner is refused 42501', coalesce(b6_state, '(probe row missing)'), coalesce(b6_ok, false)),
  (15, 'B7 an ordinary athlete is refused 42501', coalesce(b7_state, '(probe row missing)'), coalesce(b7_ok, false)),
  (16, 'B8 the authenticated role with NO jwt is refused INSIDE the body, by message', coalesce(b8_state, '(probe row missing)'), coalesce(b8_ok, false)),
  (17, 'B9 anon cannot EXECUTE it at all, refused before the body runs', coalesce(b9_state, '(probe row missing)'), coalesce(b9_ok, false)),
  (18, 'B10 a lead that does not exist raises P0002, told apart from a refusal', coalesce(b10_state, '(probe row missing)'), coalesce(b10_ok, false)),
  (19, 'B11 re-marking preserves the timestamp, the marker AND the door''s scan method', coalesce(b11_state, '(probe row missing)'), coalesce(b11_ok, false)),
  (20, 'B12 an ADMIN can mark an ORPHANED lead, which av_can_work_door cannot reach', coalesce(b12_state, '(probe row missing)'), coalesce(b12_ok, false)),
  (21, 'B13 the orphan''s former owner cannot; an orphaned lead is admin only', coalesce(b13_state, '(probe row missing)'), coalesce(b13_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART C: the capability question.
--
-- The migration's last guard reads the TEXT of the function and asserts the SET
-- clause names exactly three columns. Postgres offers no capability form of that
-- question, so this asks it the only way available: diff the whole row across a
-- real call and name every column that moved. This is the stronger proof; the
-- text guard is the cheap always-on version of it.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  UPDATE public.pass_leads SET attended_at = NULL, attended_marked_by = NULL, attended_method = NULL WHERE id = k_lead;
  SELECT to_jsonb(l.*) INTO v_before FROM public.pass_leads l WHERE l.id = k_lead;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.set_pass_lead_attended(k_lead, true);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT to_jsonb(l.*) INTO v_after FROM public.pass_leads l WHERE l.id = k_lead;

  SELECT coalesce(string_agg(key, ', ' ORDER BY key COLLATE "C"), '(nothing changed)')
    INTO v_diff
  FROM jsonb_each(v_before) b
  WHERE b.value IS DISTINCT FROM (v_after -> b.key);

  -- Both halves. "(nothing changed)" would mean the call did nothing at all,
  -- which is a different failure and must not read as a pass.
  c1_state := 'columns that moved: ' || v_diff;
  c1_ok := (v_diff = 'attended_at, attended_marked_by, attended_method');
  RAISE EXCEPTION 'REH_UNWIND_C1';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_C1' AND c1_state = '(never ran)' THEN
    c1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; c1_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

INSERT INTO reh_probe VALUES
  (22, 'C1 a whole-row diff across a real call shows EXACTLY the three attendance columns',
       coalesce(c1_state, '(probe row missing)'), coalesce(c1_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART D: guard non-vacuity. Each arm reintroduces the mistake its guard names
-- and requires that guard's own message. Conditions copied verbatim from the
-- migration; residual risk stated: this proves the LOGIC fires, Part A proves
-- the migration's actual block runs clean here.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- D1: the function is missing
  DROP FUNCTION IF EXISTS public.set_pass_lead_attended(uuid, boolean);
  IF to_regprocedure('public.set_pass_lead_attended(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() is missing -- neither leads view '
                    'can mark anything attended';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d1m := SQLERRM; d1 := SQLERRM LIKE '212 guard: set_pass_lead_attended() is missing%';
END;

BEGIN  -- D2: it is not SECURITY DEFINER
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.set_pass_lead_attended(p_lead_id uuid, p_attended boolean)
    RETURNS timestamptz LANGUAGE plpgsql VOLATILE SET search_path = public, pg_catalog
    AS $b$ DECLARE v timestamptz; BEGIN
      UPDATE public.pass_leads
         SET attended_at = now(), attended_marked_by = auth.uid(), attended_method = 'toggle'
       WHERE id = p_lead_id RETURNING attended_at INTO v;
      RETURN v;
    END $b$;
  $m$;
  IF NOT (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure) THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() is not SECURITY DEFINER -- it would '
                    'run as the caller, who holds no UPDATE on pass_leads, and every toggle '
                    'would fail with 42501';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d2m := SQLERRM; d2 := SQLERRM LIKE '212 guard: set_pass_lead_attended() is not SECURITY DEFINER%';
END;

BEGIN  -- D3: the search_path is not pinned
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.set_pass_lead_attended(p_lead_id uuid, p_attended boolean)
    RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    AS $b$ DECLARE v timestamptz; BEGIN
      UPDATE public.pass_leads
         SET attended_at = now(), attended_marked_by = auth.uid(), attended_method = 'toggle'
       WHERE id = p_lead_id RETURNING attended_at INTO v;
      RETURN v;
    END $b$;
  $m$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
  ) THEN
    RAISE EXCEPTION '212 guard: set_pass_lead_attended() has no pinned search_path';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d3m := SQLERRM; d3 := SQLERRM LIKE '212 guard: set_pass_lead_attended() has no pinned search_path%';
END;

BEGIN  -- D4: anon can execute it
  GRANT EXECUTE ON FUNCTION public.set_pass_lead_attended(uuid, boolean) TO anon;
  IF has_function_privilege('anon', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '212 guard: anon can EXECUTE set_pass_lead_attended() -- the key in the '
                    'client bundle could mark any lead attended, and attendance is the number '
                    'a gym is going to be shown';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d4m := SQLERRM; d4 := SQLERRM LIKE '212 guard: anon can EXECUTE set_pass_lead_attended()%';
END;

BEGIN  -- D5: authenticated cannot execute it
  REVOKE EXECUTE ON FUNCTION public.set_pass_lead_attended(uuid, boolean) FROM authenticated;
  IF NOT has_function_privilege('authenticated', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '212 guard: authenticated cannot EXECUTE set_pass_lead_attended() -- the '
                    'toggle is dead for admins and partners alike';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d5m := SQLERRM; d5 := SQLERRM LIKE '212 guard: authenticated cannot EXECUTE set_pass_lead_attended()%';
END;

BEGIN  -- D6: a client role holds UPDATE on ONE COLUMN
  -- The 175-D7a shape. has_table_privilege returns FALSE here while the role
  -- genuinely holds UPDATE on a column, which is why the guard asks
  -- has_any_column_privilege. A later migration granting UPDATE (email) on
  -- pass_leads would sail past the table-level form.
  GRANT UPDATE (attended_at) ON public.pass_leads TO authenticated;
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '212 guard: a client role holds UPDATE on pass_leads -- the three-column '
                    'write surface is no longer guaranteed';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d6m := SQLERRM; d6 := SQLERRM LIKE '212 guard: a client role holds UPDATE on pass_leads%';
END;

BEGIN  -- D7: the UPDATE assigns a FOURTH column
  -- The mutation that matters most for this function: three columns is the
  -- intended surface, so a membership test would pass this. The guard compares
  -- the sorted list against a literal, which fails on a fourth as loudly as on a
  -- missing one.
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.set_pass_lead_attended(p_lead_id uuid, p_attended boolean)
    RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
    AS $b$ DECLARE v timestamptz; BEGIN
      UPDATE public.pass_leads
         SET attended_at = now(),
             attended_marked_by = auth.uid(),
             attended_method = 'toggle',
             contacted_at = now()
       WHERE id = p_lead_id RETURNING attended_at INTO v;
      RETURN v;
    END $b$;
  $m$;
  SELECT string_agg(s.col, ', ' ORDER BY s.col COLLATE "C") INTO v_setters
  FROM (
    SELECT DISTINCT m[1] AS col
    FROM pg_proc p,
         LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
         LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
         LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
    WHERE p.oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure
  ) s;
  IF v_setters IS DISTINCT FROM 'attended_at, attended_marked_by, attended_method' THEN
    RAISE EXCEPTION '212 guard: the UPDATE assigns to [%], expected attended_at, attended_marked_by, attended_method', v_setters;
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d7m := SQLERRM;
  -- Names the fourth column, in sorted order, so a guard reporting only three
  -- of the four is not accepted as having fired correctly.
  d7 := SQLERRM LIKE '212 guard: the UPDATE assigns to [attended_at, attended_marked_by, attended_method, contacted_at]%';
END;

BEGIN  -- D8: the UPDATE assigns only ONE column
  -- The opposite direction, and it is a REAL defect rather than a symmetry
  -- exercise: a body that writes attended_at alone leaves attended_marked_by
  -- NULL, so nobody can tell later who confirmed a guest.
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.set_pass_lead_attended(p_lead_id uuid, p_attended boolean)
    RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
    AS $b$ DECLARE v timestamptz; BEGIN
      UPDATE public.pass_leads SET attended_at = now()
       WHERE id = p_lead_id RETURNING attended_at INTO v;
      RETURN v;
    END $b$;
  $m$;
  SELECT string_agg(s.col, ', ' ORDER BY s.col COLLATE "C") INTO v_setters
  FROM (
    SELECT DISTINCT m[1] AS col
    FROM pg_proc p,
         LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
         LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
         LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
    WHERE p.oid = 'public.set_pass_lead_attended(uuid,boolean)'::regprocedure
  ) s;
  IF v_setters IS DISTINCT FROM 'attended_at, attended_marked_by, attended_method' THEN
    RAISE EXCEPTION '212 guard: the UPDATE assigns to [%], expected attended_at, attended_marked_by, attended_method', v_setters;
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d8m := SQLERRM; d8 := SQLERRM LIKE '212 guard: the UPDATE assigns to [attended_at]%';
END;

BEGIN  -- D9: 201 has not been applied, so av_can_work_door does not exist
  -- Not a hypothetical ordering: a rebuild replays the directory in order, and a
  -- 212 that compiled against a missing authorisation helper would fail at its
  -- first call rather than at apply time.
  DROP FUNCTION IF EXISTS public.set_pass_lead_attended(uuid, boolean);
  DROP FUNCTION IF EXISTS public.av_can_work_door(uuid) CASCADE;
  IF to_regprocedure('public.av_can_work_door(uuid)') IS NULL THEN
    RAISE EXCEPTION '212 guard: av_can_work_door() is missing -- 201 has not been applied, '
                    'so set_pass_lead_attended has no authorisation rule to call';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d9m := SQLERRM; d9 := SQLERRM LIKE '212 guard: av_can_work_door() is missing%';
END;

INSERT INTO reh_probe VALUES
  (23, 'D1 aborts when the function is missing', coalesce(d1m, '(probe row missing)'), coalesce(d1, false)),
  (24, 'D2 aborts when the function is not SECURITY DEFINER', coalesce(d2m, '(probe row missing)'), coalesce(d2, false)),
  (25, 'D3 aborts when the search_path is not pinned', coalesce(d3m, '(probe row missing)'), coalesce(d3, false)),
  (26, 'D4 aborts when anon can EXECUTE it', coalesce(d4m, '(probe row missing)'), coalesce(d4, false)),
  (27, 'D5 aborts when authenticated cannot EXECUTE it', coalesce(d5m, '(probe row missing)'), coalesce(d5, false)),
  (28, 'D6 aborts on a COLUMN-level UPDATE grant, which has_table_privilege could not see', coalesce(d6m, '(probe row missing)'), coalesce(d6, false)),
  (29, 'D7 names the FOURTH column when one is added, so three is a ceiling not a floor', coalesce(d7m, '(probe row missing)'), coalesce(d7, false)),
  (30, 'D8 fires when the body writes attended_at ALONE, leaving no record of who marked it', coalesce(d8m, '(probe row missing)'), coalesce(d8, false)),
  (31, 'D9 aborts when av_can_work_door is absent (201 not applied)', coalesce(d9m, '(probe row missing)'), coalesce(d9, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART E: idempotence.
--
-- Part D dropped and rewrote the function several times, so E re-runs the real
-- definition and its grants and asserts the end state is the SAME state, which
-- is the re-run a hand-applied file actually gets.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  -- av_can_work_door was dropped by D9, so it is restored first. In production
  -- 201 owns this definition; here it only has to exist and be callable, because
  -- Part B has already finished exercising its real logic.
  CREATE OR REPLACE FUNCTION public.av_can_work_door(p_partner_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $fn$
    SELECT auth.uid() IS NOT NULL
       AND p_partner_id IS NOT NULL
       AND (
            EXISTS (SELECT 1 FROM public.featured_partners fp
                     WHERE fp.id = p_partner_id AND fp.user_id = auth.uid())
         OR EXISTS (SELECT 1 FROM public.partner_instructors pi
                     WHERE pi.partner_id = p_partner_id
                       AND pi.instructor_id = auth.uid()
                       AND pi.is_active IS TRUE)
         OR public.is_app_admin()
       );
  $fn$;
  REVOKE ALL ON FUNCTION public.av_can_work_door(uuid) FROM public, anon, authenticated;

  CREATE OR REPLACE FUNCTION public.set_pass_lead_attended(p_lead_id uuid, p_attended boolean)
  RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
  AS $fn$
  DECLARE
    v_partner_id uuid;
    v_found      boolean;
    v_result     timestamptz;
  BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'set_pass_lead_attended: no authenticated caller' USING ERRCODE = '42501';
    END IF;
    SELECT l.partner_id, true INTO v_partner_id, v_found
    FROM public.pass_leads l WHERE l.id = p_lead_id;
    IF NOT coalesce(v_found, false) THEN
      RAISE EXCEPTION 'set_pass_lead_attended: lead % does not exist', p_lead_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT (public.is_app_admin() OR public.av_can_work_door(v_partner_id)) THEN
      RAISE EXCEPTION 'set_pass_lead_attended: caller may not modify lead %', p_lead_id USING ERRCODE = '42501';
    END IF;
    UPDATE public.pass_leads
       SET attended_at        = CASE WHEN p_attended THEN coalesce(attended_at, now()) ELSE NULL END,
           attended_marked_by = CASE WHEN p_attended THEN coalesce(attended_marked_by, auth.uid()) ELSE NULL END,
           attended_method    = CASE WHEN p_attended THEN coalesce(attended_method, 'toggle') ELSE NULL END
     WHERE id = p_lead_id
    RETURNING attended_at INTO v_result;
    RETURN v_result;
  END;
  $fn$;
  REVOKE ALL ON FUNCTION public.set_pass_lead_attended(uuid, boolean) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.set_pass_lead_attended(uuid, boolean) TO authenticated;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')
     AND prosecdef AND proconfig IS NOT NULL;
  e1_state := 'definer with pinned path=' || v_n
           || ' authenticated=' || has_function_privilege('authenticated', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')::text
           || ' anon=' || has_function_privilege('anon', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')::text
           || ' overloads=' || (SELECT count(*) FROM pg_proc WHERE proname = 'set_pass_lead_attended');
  -- One overload, not two: CREATE OR REPLACE with a changed signature would
  -- silently leave the old function behind and PostgREST would pick one of them.
  e1_ok := v_n = 1
       AND has_function_privilege('authenticated', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.set_pass_lead_attended(uuid,boolean)', 'EXECUTE')
       AND (SELECT count(*) FROM pg_proc WHERE proname = 'set_pass_lead_attended') = 1;
EXCEPTION WHEN OTHERS THEN
  e1_state := 'second run raised: ' || SQLSTATE || ' ' || SQLERRM; e1_ok := false;
END;

INSERT INTO reh_probe VALUES
  (32, 'E1 a second run restores the same single definer with the same grants',
       coalesce(e1_state, '(probe row missing)'), coalesce(e1_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART F: the premises. Measured here rather than inherited from a header.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- F1: authenticated holds NO UPDATE on pass_leads at any granularity
  -- The premise that makes a definer function the ONLY option rather than a
  -- style choice. If this were false, an UPDATE policy would have been available
  -- and the whole design argument changes.
  f1_state := 'authenticated table-level=' || has_table_privilege('authenticated', 'public.pass_leads', 'UPDATE')::text
           || ' authenticated any-column=' || has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')::text
           || ' anon any-column=' || has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')::text;
  f1_ok := NOT has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
       AND NOT has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE');
EXCEPTION WHEN OTHERS THEN
  f1_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f1_ok := false;
END;

BEGIN  -- F2: 201's attended_method CHECK admits 'toggle'
  -- The function writes 'toggle'. If 201's CHECK did not list it, every mark
  -- would fail with 23514 and the toggle would be dead on arrival. Printed, not
  -- just asserted, so the admitted set is visible in the output.
  SELECT coalesce(pg_get_constraintdef(oid), '(absent)') INTO f2_state FROM pg_constraint
   WHERE conrelid = 'public.pass_leads'::regclass AND conname = 'pass_leads_attended_method_check';
  SELECT coalesce(bool_or(position('''toggle''' IN pg_get_constraintdef(oid)) > 0), false) INTO f2_ok
    FROM pg_constraint
   WHERE conrelid = 'public.pass_leads'::regclass AND conname = 'pass_leads_attended_method_check';
EXCEPTION WHEN OTHERS THEN
  f2_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f2_ok := false;
END;

BEGIN  -- F3: authenticated cannot call av_can_work_door directly
  -- 201 revoked it on purpose. If a client could call it, a stranger could
  -- enumerate which partners they are a coach of. This function reaches it only
  -- because SECURITY DEFINER runs as the owner.
  f3_state := 'authenticated=' || has_function_privilege('authenticated', 'public.av_can_work_door(uuid)', 'EXECUTE')::text
           || ' anon=' || has_function_privilege('anon', 'public.av_can_work_door(uuid)', 'EXECUTE')::text;
  f3_ok := NOT has_function_privilege('authenticated', 'public.av_can_work_door(uuid)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.av_can_work_door(uuid)', 'EXECUTE');
EXCEPTION WHEN OTHERS THEN
  f3_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f3_ok := false;
END;

INSERT INTO reh_probe VALUES
  (33, 'F1 PREMISE: no client role holds UPDATE on pass_leads, so a definer is the only path', coalesce(f1_state, '(probe row missing)'), coalesce(f1_ok, false)),
  (34, 'F2 PREMISE: 201''s attended_method CHECK admits ''toggle''', coalesce(f2_state, '(probe row missing)'), coalesce(f2_ok, false)),
  (35, 'F3 PREMISE: no client role can call av_can_work_door directly', coalesce(f3_state, '(probe row missing)'), coalesce(f3_ok, false));

END $outer$;

-- The one result set for the transaction. Every row must read PASS. 35 of 35.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

-- ══════════════════════════════════════════════════════════════════════════
-- PART G: nothing escaped.
--
-- RUN THIS AS ITS OWN STATEMENT, AFTER THE ROLLBACK ABOVE HAS ENDED. Part D
-- DROPPED av_can_work_door and rewrote it, and Part B marked leads attended, so
-- this is the part that matters most in this file: G1 and G4 are the two rows
-- that would say a live security function or a real attendance record had been
-- damaged.
--
-- Expected BEFORE apply: no set_pass_lead_attended, av_can_work_door present and
-- unreachable by client roles, no reh- partner, no reh- lead, and the live
-- attendance count unchanged.
-- ══════════════════════════════════════════════════════════════════════════

SELECT t.seq, CASE WHEN t.passed THEN 'PASS' ELSE 'FAIL' END AS result, t.check_name, t.detail
FROM (VALUES
  (1, 'G1 av_can_work_door SURVIVED (Part D dropped it inside the transaction)',
      coalesce(to_regprocedure('public.av_can_work_door(uuid)')::text, '(ABSENT -- 201''s function is gone)')
      || ' client EXECUTE: authenticated='
      || coalesce(has_function_privilege('authenticated', 'public.av_can_work_door(uuid)', 'EXECUTE')::text, 'n/a'),
      to_regprocedure('public.av_can_work_door(uuid)') IS NOT NULL
      AND NOT has_function_privilege('authenticated', 'public.av_can_work_door(uuid)', 'EXECUTE')),
  (2, 'G2 set_pass_lead_attended is NOT on the live database',
      coalesce(to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')::text, '(absent, as expected)'),
      to_regprocedure('public.set_pass_lead_attended(uuid,boolean)') IS NULL),
  (3, 'G3 the throwaway partner and its coach rows did not escape',
      (SELECT coalesce(string_agg(slug, ', '), '(none, as expected)') FROM public.featured_partners
        WHERE slug LIKE 'reh%'),
      (SELECT count(*) FROM public.featured_partners WHERE slug LIKE 'reh%') = 0),
  (4, 'G4 no rehearsal lead escaped and NO live lead is marked attended by this run',
      (SELECT count(*)::text || ' leads, '
              || count(*) FILTER (WHERE email LIKE 'reh212-%@example.com')::text || ' rehearsal, '
              || count(attended_at)::text || ' attended, '
              || count(contacted_at)::text || ' contacted'
         FROM public.pass_leads),
      (SELECT count(*) FILTER (WHERE email LIKE 'reh212-%@example.com') = 0
              AND count(*) FILTER (WHERE slug LIKE 'reh%') = 0
         FROM public.pass_leads)),
  (5, 'G5 no client role holds UPDATE on pass_leads (Part D granted one, inside the transaction)',
      'authenticated=' || has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')::text
      || ' anon=' || has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')::text,
      NOT has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
      AND NOT has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')),
  (6, 'G6 PART 0 did not escape either: 211''s columns and policy are absent',
      (SELECT count(*)::text FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch'))
      || ' attribution columns, attribution policy '
      || CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname = 'public' AND tablename = 'pass_leads'
                              AND policyname = 'Attribution columns are server only')
              THEN 'PRESENT -- it escaped' ELSE 'absent, as expected' END,
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')) = 0
      AND NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE schemaname = 'public' AND tablename = 'pass_leads'
                         AND policyname = 'Attribution columns are server only')),
  (7, 'G7 neither 211 nor 212 is recorded as applied',
      (SELECT coalesce(string_agg(migration, ', ' ORDER BY migration), '(neither recorded, as expected)')
         FROM public.migrations_applied WHERE migration LIKE '211%' OR migration LIKE '212%'),
      (SELECT count(*) FROM public.migrations_applied
        WHERE migration LIKE '211%' OR migration LIKE '212%') = 0)
) AS t(seq, check_name, detail, passed)
ORDER BY t.seq;

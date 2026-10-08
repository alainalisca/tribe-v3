-- 213_t_grow1_attribution_events_REHEARSAL.sql
--
-- Rehearsal for supabase/migrations/213_t_grow1_attribution_events.sql. Run in
-- the Supabase SQL editor. Everything through the ROLLBACK is inside
-- BEGIN ... ROLLBACK; production is not modified. ONE result set for the
-- transaction, because the editor shows only the last statement's result.
--
-- Part 0  PREREQUISITE, not under test: 211's body. admin_attribution_summary
--         reads pass_leads.attr_ref and pass_leads.utm_campaign, so 213 cannot
--         even be created on a database where 211 has not run.
-- Part A  the migration body applies clean, and the catalog says what it should
-- Part B  the table is closed: anon and authenticated refused SELECT and INSERT,
--         the service role admitted. B5 is the positive control.
-- Part C  THE SUMMARY ARITHMETIC, which is what this file is really for:
--         the NULL-key row, the date window, once-per-session, and the
--         share-click that must NOT be swallowed by it
-- Part D  guard non-vacuity, eight arms
-- Part E  idempotence
-- Part F  the premises, measured
-- Part G  nothing escaped -- DELIBERATELY OUTSIDE THE TRANSACTION
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PART C IS THE POINT OF THIS FILE, AND C2 IS THE ARM THAT EARNS IT.
--
-- admin_attribution_summary joins its four dimensions with IS NOT DISTINCT FROM
-- rather than =, because all four are nullable and MOST OF THEM ARE NULL TODAY:
-- 2 of the 3 live leads carry no src and no code at all. With `=`, the untagged
-- key joins to nothing, so the single biggest row in the Origen table -- the one
-- the whole T-GROW programme exists to shrink -- would report visits 0 and leads
-- 0 while the UNION above still listed it.
--
-- A funnel whose largest row reads zero on both sides looks like a quiet channel
-- rather than a broken query, which is exactly why this needs an arm rather than
-- a comment. C2 seeds untagged visits and untagged leads and requires the
-- summary to find them; C7 reproduces the `=` version side by side and requires
-- it to DISAGREE, so the arm cannot pass by the mistake not being reachable.
--
-- C5 and C6 are the pair that keeps the once-per-session index honest in both
-- directions: a second visit for the same session is refused, and a share click
-- for that same session is NOT. The index is partial for exactly that reason,
-- and a plain unique index on session_key would pass C5 while silently failing
-- C6 -- losing every share click that followed a visit, which is most of them.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE SUMMARY IS CALLED AS THE SERVICE ROLE IN EVERY C ARM.
--
-- It is granted to service_role alone, and that is the only caller it will ever
-- have: the Origen tab reads through /api/admin/data behind requireApiAdmin(),
-- the same path lib/dal/adminLeads.ts uses. Running the arithmetic arms as the
-- SQL editor's own superuser would exercise a privilege level no caller has and
-- would say nothing about whether the grant is right. B4 checks the refusal; the
-- C arms check the arithmetic as the role that will actually run it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE BODIES IN PART 0 AND PART A ARE BYTE-IDENTICAL TO THEIR MIGRATIONS. They
-- are spliced by a script, not copied, and supabase/rehearsalBodyVerbatim.test.ts
-- fails if either diverges. Each migration's own BEGIN/COMMIT and its
-- migrations_applied insert are omitted, for the reasons that test states;
-- everything between them, INCLUDING THE DO GUARD BLOCKS, is verbatim.
--
-- PART A IS PROVED BY ARRIVAL. The body runs as top-level statements before the
-- probe table exists, so a raising guard aborts the script and there is no result
-- table at all. Note that 213's own last guard already calls the summary and
-- compares sum(leads) to count(pass_leads), so arriving here at all is the first
-- evidence the IS NOT DISTINCT FROM joins work; Part C is what makes that
-- evidence legible instead of implicit.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- PART 0: PREREQUISITE. 211's body, spliced verbatim, NOT UNDER TEST HERE.
--
-- admin_attribution_summary selects pl.attr_ref and pl.utm_campaign from
-- pass_leads. Those columns are 211's. Run against production as it stands
-- today, Part A's CREATE FUNCTION would fail with 42703 and this file would
-- report a defect in 213 that is really the absence of 211.
--
-- 211 has its own rehearsal and its arms are not repeated here; the only thing
-- asserted about it is that it landed, in row A0. If this section fails, fix 211
-- and stop reading this file.
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
--         supabase/migrations/213_t_grow1_attribution_events.sql
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. The log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attribution_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  event_type   text NOT NULL,
  session_key  text NOT NULL,
  src          text,
  code         text,
  attr_ref     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  landing_path text
);

COMMENT ON TABLE public.attribution_events IS
  'T-GROW1 part D. One row per tagged visit (and per share click), written only by '
  'POST /api/attr with the service role. Read only by the admin Origen tab through '
  '/api/admin/data behind requireApiAdmin(). Holds NO user id, NO ip and NO user '
  'agent: a row is a tagged visit and is deliberately not a person. Linking a visit '
  'to an account is the purpose the published data policy v1.0 does not cover, and '
  'waits for v1.1 with T-GROW1 part C.';
COMMENT ON COLUMN public.attribution_events.session_key IS
  'An opaque random key the client holds in sessionStorage, for deduplication only. '
  'Generated with no reference to any account and dies with the tab. Not an '
  'identifier and must not be joined to one.';

-- Same vocabulary the capture library and /api/attr accept. Named so a violation
-- says which value was wrong.
ALTER TABLE public.attribution_events DROP CONSTRAINT IF EXISTS attribution_events_event_type_check;
ALTER TABLE public.attribution_events
  ADD CONSTRAINT attribution_events_event_type_check
  CHECK (event_type IN ('visit', 'pass_view', 'share_click'));

-- Size bounds only, and the same 40 as 211, for the same reason: the route
-- nulls anything longer, so these two numbers are one number. Shape stays in the
-- route where a violation drops a field instead of rejecting the row.
ALTER TABLE public.attribution_events DROP CONSTRAINT IF EXISTS attribution_events_tag_bounds;
ALTER TABLE public.attribution_events
  ADD CONSTRAINT attribution_events_tag_bounds
  CHECK (
        (src          IS NULL OR char_length(src)          BETWEEN 1 AND 40)
    AND (code         IS NULL OR char_length(code)         BETWEEN 1 AND 40)
    AND (attr_ref     IS NULL OR char_length(attr_ref)     BETWEEN 1 AND 40)
    AND (utm_source   IS NULL OR char_length(utm_source)   BETWEEN 1 AND 40)
    AND (utm_medium   IS NULL OR char_length(utm_medium)   BETWEEN 1 AND 40)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) BETWEEN 1 AND 40)
    AND (utm_content  IS NULL OR char_length(utm_content)  BETWEEN 1 AND 40)
    AND (landing_path IS NULL OR char_length(landing_path) BETWEEN 1 AND 200)
  );

-- The key's charset IS pinned, unlike the tags. A tag comes off a printed poster
-- and a typo must cost the field rather than the row; a session key is generated
-- by our own code three lines before it is sent, so a malformed one is a bug and
-- there is nothing to lose by refusing it.
ALTER TABLE public.attribution_events DROP CONSTRAINT IF EXISTS attribution_events_session_key_check;
ALTER TABLE public.attribution_events
  ADD CONSTRAINT attribution_events_session_key_check
  CHECK (session_key ~ '^[A-Za-z0-9_-]{8,64}$');

-- ── 2. Once per session for a visit, and only for a visit ───────────────────
CREATE UNIQUE INDEX IF NOT EXISTS attribution_events_one_visit_per_session
  ON public.attribution_events (session_key)
  WHERE event_type = 'visit';

-- The summary reads a date window across the whole table and this is the only
-- predicate it has. DESC to match 175's idx_pass_leads_created, so the two
-- halves of the Origen read scan the same direction.
CREATE INDEX IF NOT EXISTS attribution_events_created_idx
  ON public.attribution_events (created_at DESC);

-- ── 3. Closed to every client role ──────────────────────────────────────────
--
-- RLS on with zero policies denies every RLS-bound role. The service role has
-- BYPASSRLS and is the only writer and the only reader. See the header for why
-- an admin policy here would be unreachable dead code.
ALTER TABLE public.attribution_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attribution_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.attribution_events TO service_role;

-- ── 4. The Origen read ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_attribution_summary(p_since timestamptz)
RETURNS TABLE (
  src          text,
  code         text,
  utm_campaign text,
  attr_ref     text,
  visits       bigint,
  leads        bigint,
  contacted    bigint,
  attended     bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $fn$
  WITH
  -- p_since IS NULL is the "all time" option in the tab's range filter.
  --
  -- coalesce(p_since, '-infinity') AND NOT (p_since IS NULL OR created_at >=
  -- p_since). The two are logically identical and only one of them can use an
  -- index: an OR against a parameter forces a sequential scan in the generic
  -- plan, and this function has a SET clause so it is never inlined and the plan
  -- IS generic. attribution_events is the one table in this program that grows
  -- with traffic rather than with conversions, so it is the one place where that
  -- distinction will eventually be the difference between a tab that loads and a
  -- tab that does not. '-infinity' is a real timestamptz and sorts below every
  -- stored value, so the single predicate admits everything when nothing is
  -- passed.
  e AS (
    SELECT ae.src, ae.code, ae.utm_campaign, ae.attr_ref, count(*) AS visits
      FROM public.attribution_events ae
     WHERE ae.event_type = 'visit'
       AND ae.created_at >= coalesce(p_since, '-infinity'::timestamptz)
     GROUP BY 1, 2, 3, 4
  ),
  l AS (
    SELECT pl.src, pl.code, pl.utm_campaign, pl.attr_ref,
           count(*)                AS leads,
           count(pl.contacted_at)  AS contacted,
           count(pl.attended_at)   AS attended
      FROM public.pass_leads pl
     WHERE pl.created_at >= coalesce(p_since, '-infinity'::timestamptz)
     GROUP BY 1, 2, 3, 4
  ),
  -- UNION and not UNION ALL: this is the key set, and UNION treats two NULLs as
  -- the same key, which is what makes "no source at all" one row rather than
  -- one row per lead. 2 of the 3 live leads are exactly that row.
  k AS (
    SELECT e.src, e.code, e.utm_campaign, e.attr_ref FROM e
    UNION
    SELECT l.src, l.code, l.utm_campaign, l.attr_ref FROM l
  )
  SELECT k.src, k.code, k.utm_campaign, k.attr_ref,
         coalesce(e.visits, 0)    AS visits,
         coalesce(l.leads, 0)     AS leads,
         coalesce(l.contacted, 0) AS contacted,
         coalesce(l.attended, 0)  AS attended
    FROM k
    -- IS NOT DISTINCT FROM, NOT =, on every one of the eight join conditions.
    -- These four columns are nullable and MOST OF THEM ARE NULL TODAY. With `=`
    -- a NULL key joins to nothing, so the untagged row -- the single biggest row
    -- in this table, and the one the whole program is trying to shrink -- would
    -- silently report visits 0 and leads 0 while the UNION above still listed
    -- it. A funnel whose largest row reads zero on both sides is CLAUDE.md's
    -- three-valued-logic finding with a table around it.
    LEFT JOIN e ON e.src          IS NOT DISTINCT FROM k.src
               AND e.code         IS NOT DISTINCT FROM k.code
               AND e.utm_campaign IS NOT DISTINCT FROM k.utm_campaign
               AND e.attr_ref     IS NOT DISTINCT FROM k.attr_ref
    LEFT JOIN l ON l.src          IS NOT DISTINCT FROM k.src
               AND l.code         IS NOT DISTINCT FROM k.code
               AND l.utm_campaign IS NOT DISTINCT FROM k.utm_campaign
               AND l.attr_ref     IS NOT DISTINCT FROM k.attr_ref
   ORDER BY coalesce(l.leads, 0) DESC, coalesce(e.visits, 0) DESC;
$fn$;

COMMENT ON FUNCTION public.admin_attribution_summary(timestamptz) IS
  'T-GROW1 part F. One row per (src, code, utm_campaign, attr_ref) with visits, '
  'leads, contacted and attended, for the admin Origen tab. A database object '
  'rather than a PostgREST query because aggregates are disabled on this project '
  '(PGRST123). SECURITY INVOKER: the only caller is the service role behind '
  'requireApiAdmin(), which already holds these reads, so a definer would be a '
  'second privileged path for no new capability. Returns NO signups or bookings '
  'column: attributing those needs T-GROW1 part C, which is blocked on data '
  'policy v1.1, and a zero in such a column would read as a measurement.';

REVOKE ALL ON FUNCTION public.admin_attribution_summary(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_summary(timestamptz) TO service_role;

-- ── 5. Assert the end state, after the writes ───────────────────────────────
DO $$
DECLARE
  v_priv text;
  v_n    int;
  v_rows int;
BEGIN
  IF to_regclass('public.attribution_events') IS NULL THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events was not created.';
  END IF;

  -- RLS on. Without it the zero-policy state means the opposite of what it
  -- means with it: no policies and no RLS is an open table.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.attribution_events')) THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events does not have RLS enabled.';
  END IF;

  -- Zero policies is the intended state and is asserted rather than assumed, so
  -- a later migration adding one has to come past this line and explain itself.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'attribution_events';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events has % policies, expected 0 -- '
                    'every read and write goes through the service role', v_n;
  END IF;

  -- No client role touches it at all. has_ANY_column_privilege, because the
  -- table-level form is false while a role holds the privilege on one column
  -- (CLAUDE.md, measured on production for pass_leads).
  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
    IF has_any_column_privilege('anon', 'public.attribution_events', v_priv)
       OR has_any_column_privilege('authenticated', 'public.attribution_events', v_priv) THEN
      RAISE EXCEPTION '213 ABORTED: a client role holds % on attribution_events.', v_priv;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.attribution_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.attribution_events', 'DELETE') THEN
    RAISE EXCEPTION '213 ABORTED: a client role can DELETE from attribution_events.';
  END IF;

  -- The service role is the only writer, so losing its grant is a silent
  -- outage: /api/attr would 500 on every visit and nothing else would notice.
  IF NOT has_table_privilege('service_role', 'public.attribution_events', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.attribution_events', 'SELECT') THEN
    RAISE EXCEPTION '213 ABORTED: service_role cannot write or read attribution_events.';
  END IF;

  -- The partial unique index, and the fact that it IS partial. A plain unique
  -- index on session_key would admit one event per session of ANY type, so a
  -- share click would collide with the visit that preceded it and be lost.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'attribution_events'
       AND indexname = 'attribution_events_one_visit_per_session'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%WHERE (event_type = ''visit''::text)%'
  ) THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events_one_visit_per_session is missing, not '
                    'unique, or not restricted to visit rows (which would swallow share clicks).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                  AND tablename = 'attribution_events' AND indexname = 'attribution_events_created_idx') THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events_created_idx is missing.';
  END IF;

  IF to_regprocedure('public.admin_attribution_summary(timestamptz)') IS NULL THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary is missing -- the Origen tab has no read.';
  END IF;

  IF has_function_privilege('anon', 'public.admin_attribution_summary(timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_attribution_summary(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '213 ABORTED: a client role can EXECUTE admin_attribution_summary -- every '
                    'lead count in the app would be readable from the browser bundle.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.admin_attribution_summary(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '213 ABORTED: service_role cannot EXECUTE admin_attribution_summary.';
  END IF;

  -- NOT SECURITY DEFINER, asserted because the usual mistake in this repo is the
  -- other direction and nothing else would say which one this is.
  IF (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.admin_attribution_summary(timestamptz)'::regprocedure) THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary is SECURITY DEFINER -- it is meant to '
                    'run as the service role that already holds these reads.';
  END IF;

  -- THE READ ACTUALLY RUNS AND RETURNS THE LIVE ROWS.
  --
  -- Every assertion above is about the catalog. A function can satisfy all of
  -- them and still return nothing, which on a table that is legitimately empty
  -- is indistinguishable from working. So this calls it over all time and
  -- requires it to account for EVERY lead in pass_leads: sum(leads) must equal
  -- the row count. That is the one arm that cannot pass if the IS NOT DISTINCT
  -- FROM joins are wrong, because the untagged rows would drop out of the sum
  -- while still being counted by the table.
  SELECT coalesce(sum(s.leads), 0) INTO v_n FROM public.admin_attribution_summary(NULL) s;
  SELECT count(*) INTO v_rows FROM public.pass_leads;
  IF v_n <> v_rows THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary accounts for % leads but pass_leads has % '
                    '-- a NULL key is dropping out, so the join is = rather than IS NOT DISTINCT FROM', v_n, v_rows;
  END IF;

  RAISE NOTICE '213: attribution_events created and closed to clients; summary accounts for all % leads.', v_rows;
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
  (1, 'A0 PREREQUISITE LANDED: 211''s seven columns are on pass_leads',
      (SELECT coalesce(string_agg(attname, ', ' ORDER BY attname), '(NONE -- 211 did not land)')
         FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')),
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')) = 7),
  (2, 'A1 attribution_events exists with RLS ON and ZERO policies',
      coalesce((SELECT 'rls=' || relrowsecurity::text FROM pg_class
                 WHERE oid = to_regclass('public.attribution_events')), '(table absent)')
      || ' policies=' || (SELECT count(*) FROM pg_policies
                           WHERE schemaname = 'public' AND tablename = 'attribution_events')::text,
      coalesce((SELECT relrowsecurity FROM pg_class
                 WHERE oid = to_regclass('public.attribution_events')), false)
      AND (SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'attribution_events') = 0),
  (3, 'A2 no client role holds SELECT, INSERT, UPDATE or DELETE on it',
      'anon S=' || has_any_column_privilege('anon', to_regclass('public.attribution_events'), 'SELECT')::text
      || ' anon I=' || has_any_column_privilege('anon', to_regclass('public.attribution_events'), 'INSERT')::text
      || ' auth S=' || has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'SELECT')::text
      || ' auth I=' || has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'INSERT')::text
      || ' auth U=' || has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'UPDATE')::text
      || ' auth D=' || has_table_privilege('authenticated', to_regclass('public.attribution_events'), 'DELETE')::text,
      NOT has_any_column_privilege('anon', to_regclass('public.attribution_events'), 'SELECT')
      AND NOT has_any_column_privilege('anon', to_regclass('public.attribution_events'), 'INSERT')
      AND NOT has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'SELECT')
      AND NOT has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'INSERT')
      AND NOT has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'UPDATE')
      AND NOT has_table_privilege('authenticated', to_regclass('public.attribution_events'), 'DELETE')),
  (4, 'A3 service_role can read and write it',
      'INSERT=' || has_table_privilege('service_role', to_regclass('public.attribution_events'), 'INSERT')::text
      || ' SELECT=' || has_table_privilege('service_role', to_regclass('public.attribution_events'), 'SELECT')::text,
      has_table_privilege('service_role', to_regclass('public.attribution_events'), 'INSERT')
      AND has_table_privilege('service_role', to_regclass('public.attribution_events'), 'SELECT')),
  (5, 'A4 the once-per-session index is UNIQUE and PARTIAL on visit rows only',
      (SELECT coalesce(indexdef, '(absent)') FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'attribution_events'
          AND indexname = 'attribution_events_one_visit_per_session'),
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'attribution_events'
          AND indexname = 'attribution_events_one_visit_per_session'
          AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%event_type = ''visit''%') = 1),
  (6, 'A5 admin_attribution_summary exists, is NOT a definer, service_role only',
      (SELECT coalesce('secdef=' || prosecdef::text
              || ' anon=' || has_function_privilege('anon', oid, 'EXECUTE')::text
              || ' auth=' || has_function_privilege('authenticated', oid, 'EXECUTE')::text
              || ' service=' || has_function_privilege('service_role', oid, 'EXECUTE')::text, '(absent)')
         FROM pg_proc WHERE oid = to_regprocedure('public.admin_attribution_summary(timestamptz)')),
      (SELECT NOT prosecdef
              AND NOT has_function_privilege('anon', oid, 'EXECUTE')
              AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
              AND has_function_privilege('service_role', oid, 'EXECUTE')
         FROM pg_proc WHERE oid = to_regprocedure('public.admin_attribution_summary(timestamptz)'))),
  (7, 'A6 the summary joins with IS NOT DISTINCT FROM and not bare equality, on all EIGHT conditions',
      (SELECT 'null-safe join conditions=' ||
              (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid), 'IS NOT DISTINCT FROM k.', '')))
              / length('IS NOT DISTINCT FROM k.')
         FROM pg_proc WHERE oid = to_regprocedure('public.admin_attribution_summary(timestamptz)')),
      -- Eight: four dimensions on each of the two LEFT JOINs. COUNTED, not
      -- merely detected, because one join reverted to `=` while the other kept
      -- the NULL-safe form would still contain the phrase.
      --
      -- ANCHORED ON `k.`, which is the alias every join condition compares
      -- against. Counting the bare phrase found NINE, because the function
      -- body's own comment EXPLAINS the choice and says "IS NOT DISTINCT FROM,
      -- NOT =" -- pg_get_functiondef returns the body verbatim, comments
      -- included. That is the sixth instance in this repo of a check matching
      -- prose that describes the thing it checks, and it was found by running
      -- the file rather than by reading it.
      --
      -- The alias anchor is migration 165's fix applied here: anchor on
      -- something only the real construct can produce, not on a phrase prose can
      -- contain. Stripping comments would also work and is weaker -- a naive
      -- `--` stripper truncates at a `--` inside a string literal, which this
      -- repo has paid for already.
      (SELECT (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid), 'IS NOT DISTINCT FROM k.', '')))
              / length('IS NOT DISTINCT FROM k.') = 8
         FROM pg_proc WHERE oid = to_regprocedure('public.admin_attribution_summary(timestamptz)')))
) AS t(seq, check_name, detail, passed);

DO $outer$
DECLARE
  k_slug    constant text := 'reh213-throwaway-pass';
  k_partner uuid;
  k_sess1   constant text := 'rehsess0000000000000001';
  k_sess2   constant text := 'rehsess0000000000000002';
  k_old     constant timestamptz := now() - interval '120 days';

  a7_state text := '(never ran)'; a7_ok boolean := false;

  b1_state text := '(never ran)'; b1_ok boolean := false;
  b2_state text := '(never ran)'; b2_ok boolean := false;
  b3_state text := '(never ran)'; b3_ok boolean := false;
  b4_state text := '(never ran)'; b4_ok boolean := false;
  b5_state text := '(never ran)'; b5_ok boolean := false;

  c1_state text := '(never ran)'; c1_ok boolean := false;
  c2_state text := '(never ran)'; c2_ok boolean := false;
  c3_state text := '(never ran)'; c3_ok boolean := false;
  c4_state text := '(never ran)'; c4_ok boolean := false;
  c5_state text := '(never ran)'; c5_ok boolean := false;
  c6_state text := '(never ran)'; c6_ok boolean := false;
  c7_state text := '(never ran)'; c7_ok boolean := false;

  d1 boolean := false; d1m text := '(never ran)';
  d2 boolean := false; d2m text := '(never ran)';
  d3 boolean := false; d3m text := '(never ran)';
  d4 boolean := false; d4m text := '(never ran)';
  d5 boolean := false; d5m text := '(never ran)';
  d6 boolean := false; d6m text := '(never ran)';
  d7 boolean := false; d7m text := '(never ran)';
  d8 boolean := false; d8m text := '(never ran)';

  e1_state text := '(never ran)'; e1_ok boolean := false;
  f1_state text := '(never ran)'; f1_ok boolean := false;
  f2_state text := '(never ran)'; f2_ok boolean := false;

  v_n        int;
  v_uniques text := '(never read)';
  v_visits   bigint;
  v_leads    bigint;
  v_cont     bigint;
  v_att      bigint;
  v_rows     int;
  v_eq_leads bigint;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════
-- A7: the scaffolding. A throwaway partner, three leads with KNOWN attribution
-- shapes, and five events. Every count Part C asserts is derived from what is
-- seeded here, so a seed that silently did not land would make the arithmetic
-- arms assert numbers about nothing.
--
-- The shapes are chosen to be the three that actually occur:
--   lead 1  fully tagged           src=runclub code=RUNCLUB-SAT0927 campaign=hyrox-oct
--   lead 2  UNTAGGED, all four NULL  -- the row that `=` would lose
--   lead 3  UNTAGGED and OLD        -- outside a 30 day window, for C3
-- ══════════════════════════════════════════════════════════════════════════
BEGIN
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

  INSERT INTO public.pass_leads
    (slug, partner_id, name, whatsapp, email, pass_code, consent_text,
     src, code, utm_campaign, attr_ref, created_at, contacted_at, attended_at)
  VALUES
    (k_slug, k_partner, 'Reh Tagged', '+573001234567', 'reh213-a@example.com', 'REH213A',
     'Autorizo el tratamiento de mis datos para esta clase de prueba.',
     'runclub', 'RUNCLUB-SAT0927', 'hyrox-oct', NULL, now(), now(), now()),
    (k_slug, k_partner, 'Reh Untagged', '+573001234568', 'reh213-b@example.com', 'REH213B',
     'Autorizo el tratamiento de mis datos para esta clase de prueba.',
     NULL, NULL, NULL, NULL, now(), NULL, NULL),
    (k_slug, k_partner, 'Reh Old', '+573001234569', 'reh213-c@example.com', 'REH213C',
     'Autorizo el tratamiento de mis datos para esta clase de prueba.',
     NULL, NULL, NULL, NULL, k_old, NULL, NULL);

  INSERT INTO public.attribution_events (event_type, session_key, src, code, utm_campaign, landing_path)
  VALUES
    ('visit',       k_sess1, 'runclub', 'RUNCLUB-SAT0927', 'hyrox-oct', '/pase/bullbox/'),
    ('visit',       k_sess2, NULL,      NULL,              NULL,        '/'),
    ('share_click', k_sess1, 'runclub', 'RUNCLUB-SAT0927', 'hyrox-oct', '/pase/bullbox/');
  -- An OLD visit, for the date-window arm. Untagged, so it lands on the same key
  -- as the live untagged visit and C3 can show the window moving one number.
  INSERT INTO public.attribution_events (event_type, session_key, created_at)
  VALUES ('visit', 'rehsess0000000000000003', k_old);


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
           || ' reh leads=' || (SELECT count(*) FROM public.pass_leads WHERE slug = k_slug)
           || ' reh events=' || (SELECT count(*) FROM public.attribution_events WHERE session_key LIKE 'rehsess%');
  a7_ok := k_partner IS NOT NULL
       AND (SELECT count(*) FROM public.pass_leads WHERE slug = k_slug) = 3
       AND (SELECT count(*) FROM public.attribution_events WHERE session_key LIKE 'rehsess%') = 4
       -- Every unique constraint the clone must dodge is one it overrides.
       AND v_uniques = '(none)';
EXCEPTION WHEN OTHERS THEN
  a7_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; a7_ok := false;
END;

INSERT INTO reh_probe VALUES
  (8, 'A7 SCAFFOLDING: throwaway partner, 3 leads (tagged, untagged, old), 4 events',
      coalesce(a7_state, '(probe row missing)'), coalesce(a7_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART B: the table is closed to clients and open to the service role.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- B1: anon SELECT
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n FROM public.attribution_events;
    b1_state := v_n || ' rows, NO ERROR -- anon can read the visit log'; b1_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b1_state := SQLSTATE || ' ' || SQLERRM; b1_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- B2: anon INSERT. There is deliberately NO anon write path on this
       -- table, unlike pass_leads where 173 had to grant one because the pass
       -- form posts before anybody is signed in. /api/attr is service role.
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.attribution_events (event_type, session_key)
    VALUES ('visit', 'rehsessanon00000000001');
    b2_state := 'SUCCEEDED -- anon can forge visits, so every count is inflatable'; b2_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b2_state := SQLSTATE || ' ' || SQLERRM; b2_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- B3: authenticated SELECT. Not the same question as B1: an ordinary
       -- signed-in athlete is a different role with different grants, and this
       -- table holds every campaign code Tribe is running.
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_n FROM public.attribution_events;
    b3_state := v_n || ' rows, NO ERROR -- any signed-in user can read the visit log'; b3_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b3_state := SQLSTATE || ' ' || SQLERRM; b3_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- B4: authenticated cannot EXECUTE the summary. If it could, every lead
       -- and attendance count in the app would be readable from the browser
       -- bundle by anybody with an account.
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_n FROM public.admin_attribution_summary(NULL);
    b4_state := 'SUCCEEDED -- returned ' || v_n || ' rows to an ordinary signed-in caller';
    b4_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b4_state := SQLSTATE || ' ' || SQLERRM;
    b4_ok := (SQLSTATE = '42501' AND SQLERRM ILIKE '%permission denied for function%');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- B5: POSITIVE CONTROL. The service role can insert and read. Without
       -- this, B1 to B4 are equally consistent with a table nobody can use at
       -- all, which is a passing test that proves nothing.
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.attribution_events (event_type, session_key, src)
    VALUES ('pass_view', 'rehsessservice000000001', 'runclub');
    SELECT count(*) INTO v_n FROM public.attribution_events WHERE session_key = 'rehsessservice000000001';
    b5_state := 'inserted and read back ' || v_n || ' row(s)';
    b5_ok := (v_n = 1);
  EXCEPTION WHEN OTHERS THEN
    b5_state := 'the service role could not use the table: ' || SQLSTATE || ' ' || SQLERRM; b5_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

INSERT INTO reh_probe VALUES
  ( 9, 'B1 anon SELECT on attribution_events is 42501', coalesce(b1_state, '(probe row missing)'), coalesce(b1_ok, false)),
  (10, 'B2 anon INSERT is 42501: there is no anon write path on this table at all', coalesce(b2_state, '(probe row missing)'), coalesce(b2_ok, false)),
  (11, 'B3 an ordinary authenticated account cannot SELECT it either', coalesce(b3_state, '(probe row missing)'), coalesce(b3_ok, false)),
  (12, 'B4 authenticated cannot EXECUTE admin_attribution_summary', coalesce(b4_state, '(probe row missing)'), coalesce(b4_ok, false)),
  (13, 'B5 POSITIVE CONTROL: the service role inserts and reads (so B1-B4 mean something)', coalesce(b5_state, '(probe row missing)'), coalesce(b5_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART C: the summary arithmetic, as the service role.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- C1: the FULLY TAGGED key. 1 visit, 1 lead, 1 contacted, 1 attended.
  SET LOCAL ROLE service_role;
  BEGIN
    SELECT s.visits, s.leads, s.contacted, s.attended
      INTO v_visits, v_leads, v_cont, v_att
      FROM public.admin_attribution_summary(NULL) s
     -- All four dimensions pinned, attr_ref included. Leaving it unconstrained
     -- would match any row sharing the other three, and SELECT INTO over several
     -- rows takes one of them silently rather than raising.
     WHERE s.src = 'runclub' AND s.code = 'RUNCLUB-SAT0927'
       AND s.utm_campaign = 'hyrox-oct' AND s.attr_ref IS NULL;
    c1_state := 'visits=' || coalesce(v_visits::text, 'NO ROW')
             || ' leads=' || coalesce(v_leads::text, 'NO ROW')
             || ' contacted=' || coalesce(v_cont::text, 'NO ROW')
             || ' attended=' || coalesce(v_att::text, 'NO ROW');
    -- share_click must NOT be counted as a visit: the visits column is the
    -- denominator of a conversion rate, and counting a share in it would make
    -- every tagged channel look worse the more it was shared.
    c1_ok := (v_visits = 1 AND v_leads = 1 AND v_cont = 1 AND v_att = 1);
  EXCEPTION WHEN OTHERS THEN
    c1_state := SQLSTATE || ' ' || SQLERRM; c1_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- C2: THE NULL KEY. The arm this file exists for.
  --
  -- All four dimensions NULL. 2 untagged visits (one live, one old) and 2
  -- untagged leads (one live, one old) over all time. With `=` on the joins this
  -- row reports visits 0 and leads 0 while still appearing in the output.
  SET LOCAL ROLE service_role;
  BEGIN
    SELECT s.visits, s.leads INTO v_visits, v_leads
      FROM public.admin_attribution_summary(NULL) s
     WHERE s.src IS NULL AND s.code IS NULL AND s.utm_campaign IS NULL AND s.attr_ref IS NULL;
    c2_state := 'visits=' || coalesce(v_visits::text, 'NO ROW AT ALL')
             || ' leads=' || coalesce(v_leads::text, 'NO ROW AT ALL')
             || ' (expected visits>=2 and leads>=2 from the seed, more if production has untagged rows)';
    -- >= rather than =, because production's own untagged leads land on this
    -- same key and the seed is additive. A STRICT equality here would be a
    -- number about the seed pretending to be a number about the query.
    c2_ok := (v_visits >= 2 AND v_leads >= 2);
  EXCEPTION WHEN OTHERS THEN
    c2_state := SQLSTATE || ' ' || SQLERRM; c2_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- C3: the date window moves the numbers, and moves them DOWN.
  -- A 30 day window must drop the old visit and the old lead. Without this the
  -- window parameter could be ignored entirely and every arm above would pass.
  SET LOCAL ROLE service_role;
  BEGIN
    SELECT s.visits, s.leads INTO v_visits, v_leads
      FROM public.admin_attribution_summary(now() - interval '30 days') s
     WHERE s.src IS NULL AND s.code IS NULL AND s.utm_campaign IS NULL AND s.attr_ref IS NULL;
    SELECT s2.visits, s2.leads INTO v_cont, v_att
      FROM public.admin_attribution_summary(NULL) s2
     WHERE s2.src IS NULL AND s2.code IS NULL AND s2.utm_campaign IS NULL AND s2.attr_ref IS NULL;
    c3_state := '30d: visits=' || coalesce(v_visits::text, 'NO ROW') || ' leads=' || coalesce(v_leads::text, 'NO ROW')
             || ' | all time: visits=' || coalesce(v_cont::text, 'NO ROW') || ' leads=' || coalesce(v_att::text, 'NO ROW');
    -- Strictly fewer in BOTH columns: the seed put exactly one old visit and one
    -- old lead outside the window, so a window that does nothing shows equal
    -- numbers and a window that drops everything shows zero.
    c3_ok := (v_visits = v_cont - 1 AND v_leads = v_att - 1);
  EXCEPTION WHEN OTHERS THEN
    c3_state := SQLSTATE || ' ' || SQLERRM; c3_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- C4: every lead is accounted for exactly once.
  -- The same assertion 213's own last guard makes, repeated here so it is a
  -- visible row rather than an implicit consequence of Part A arriving. It is the
  -- one check that cannot pass if a key is being dropped.
  SET LOCAL ROLE service_role;
  BEGIN
    SELECT coalesce(sum(s.leads), 0) INTO v_leads FROM public.admin_attribution_summary(NULL) s;
    SELECT count(*) INTO v_rows FROM public.pass_leads;
    c4_state := 'summary accounts for ' || v_leads || ' leads, pass_leads has ' || v_rows;
    c4_ok := (v_leads = v_rows);
  EXCEPTION WHEN OTHERS THEN
    c4_state := SQLSTATE || ' ' || SQLERRM; c4_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- C5: a SECOND visit for the same session is refused, 23505.
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.attribution_events (event_type, session_key, src)
    VALUES ('visit', k_sess1, 'runclub');
    c5_state := 'SUCCEEDED -- a session logged two visits, so the denominator is inflatable';
    c5_ok := false;
  EXCEPTION WHEN OTHERS THEN
    c5_state := SQLSTATE || ' ' || SQLERRM;
    c5_ok := (SQLSTATE = '23505' AND SQLERRM LIKE '%attribution_events_one_visit_per_session%');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- C6: a SECOND share_click for that same session is ACCEPTED.
  -- The arm that proves the index is PARTIAL. A plain unique index on
  -- session_key passes C5 and fails here, silently dropping every share click
  -- that follows a visit -- which is all of them, since you have to arrive before
  -- you can share.
  SET LOCAL ROLE service_role;
  BEGIN
    INSERT INTO public.attribution_events (event_type, session_key, src)
    VALUES ('share_click', k_sess1, 'runclub');
    SELECT count(*) INTO v_n FROM public.attribution_events
     WHERE session_key = k_sess1 AND event_type = 'share_click';
    c6_state := k_sess1 || ' now has ' || v_n || ' share_click rows';
    c6_ok := (v_n = 2);
  EXCEPTION WHEN OTHERS THEN
    c6_state := 'REFUSED a second share click: ' || SQLSTATE || ' ' || SQLERRM; c6_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

BEGIN  -- C7: THE MISTAKE IS REACHABLE, PROVED SIDE BY SIDE.
  --
  -- C2 passing is only evidence that the real function works. It is not evidence
  -- that `=` would have failed -- and if `=` happened to give the same answer on
  -- this data, C2 would be testing nothing. So this runs the SAME query with the
  -- joins reverted to bare equality and requires it to DISAGREE with the real
  -- one. This is the migration-180 lesson applied to arithmetic: feed the
  -- detector a known example of the thing it is supposed to catch.
  SET LOCAL ROLE service_role;
  BEGIN
    WITH e AS (
      SELECT ae.src, ae.code, ae.utm_campaign, ae.attr_ref, count(*) AS visits
        FROM public.attribution_events ae
       WHERE ae.event_type = 'visit'
       GROUP BY 1, 2, 3, 4
    ),
    l AS (
      SELECT pl.src, pl.code, pl.utm_campaign, pl.attr_ref, count(*) AS leads
        FROM public.pass_leads pl
       GROUP BY 1, 2, 3, 4
    ),
    k AS (
      SELECT src, code, utm_campaign, attr_ref FROM e
      UNION
      SELECT src, code, utm_campaign, attr_ref FROM l
    )
    SELECT coalesce(sum(coalesce(l.leads, 0)), 0) INTO v_eq_leads
      FROM k
      LEFT JOIN e ON e.src = k.src AND e.code = k.code
                 AND e.utm_campaign = k.utm_campaign AND e.attr_ref = k.attr_ref
      LEFT JOIN l ON l.src = k.src AND l.code = k.code
                 AND l.utm_campaign = k.utm_campaign AND l.attr_ref = k.attr_ref;

    SELECT coalesce(sum(s.leads), 0) INTO v_leads FROM public.admin_attribution_summary(NULL) s;
    SELECT count(*) INTO v_rows FROM public.pass_leads;

    c7_state := 'IS NOT DISTINCT FROM accounts for ' || v_leads
             || ', bare = accounts for ' || v_eq_leads
             || ', pass_leads has ' || v_rows;
    -- The real one is right, the mutant is wrong, and the mutant is wrong in the
    -- DOWNWARD direction. If these two ever agree, C2 has stopped being a test.
    c7_ok := (v_leads = v_rows AND v_eq_leads < v_rows);
  EXCEPTION WHEN OTHERS THEN
    c7_state := SQLSTATE || ' ' || SQLERRM; c7_ok := false;
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN RESET ROLE;
END;

INSERT INTO reh_probe VALUES
  (14, 'C1 the fully tagged key reads 1 visit, 1 lead, 1 contacted, 1 attended (share_click NOT a visit)', coalesce(c1_state, '(probe row missing)'), coalesce(c1_ok, false)),
  (15, 'C2 THE NULL KEY is found and counted, which bare = would report as zero', coalesce(c2_state, '(probe row missing)'), coalesce(c2_ok, false)),
  (16, 'C3 a 30 day window drops exactly the one old visit and the one old lead', coalesce(c3_state, '(probe row missing)'), coalesce(c3_ok, false)),
  (17, 'C4 sum(leads) equals count(pass_leads): no key is dropped', coalesce(c4_state, '(probe row missing)'), coalesce(c4_ok, false)),
  (18, 'C5 a second visit for one session is refused 23505 by the partial unique index', coalesce(c5_state, '(probe row missing)'), coalesce(c5_ok, false)),
  (19, 'C6 a second share_click for that SAME session is ACCEPTED (the index is partial)', coalesce(c6_state, '(probe row missing)'), coalesce(c6_ok, false)),
  (20, 'C7 the bare-= version is run side by side and DISAGREES, so C2 is not vacuous', coalesce(c7_state, '(probe row missing)'), coalesce(c7_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART D: guard non-vacuity. Conditions copied verbatim from the migration.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- D1: RLS is off
  ALTER TABLE public.attribution_events DISABLE ROW LEVEL SECURITY;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.attribution_events')) THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events does not have RLS enabled.';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d1m := SQLERRM; d1 := SQLERRM LIKE '213 ABORTED: attribution_events does not have RLS enabled.%';
  ALTER TABLE public.attribution_events ENABLE ROW LEVEL SECURITY;
END;

BEGIN  -- D2: a policy appeared
  CREATE POLICY "reh 213 stray policy" ON public.attribution_events FOR SELECT USING (true);
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'attribution_events';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events has % policies, expected 0 -- '
                    'every read and write goes through the service role', v_n;
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d2m := SQLERRM; d2 := SQLERRM LIKE '213 ABORTED: attribution_events has 1 policies, expected 0%';
  DROP POLICY IF EXISTS "reh 213 stray policy" ON public.attribution_events;
END;

BEGIN  -- D3: a client role gains SELECT on one column
  -- Column level, because that is the realistic way a grant widens and the
  -- table-level form of the question cannot see it.
  GRANT SELECT (utm_campaign) ON public.attribution_events TO authenticated;
  IF has_any_column_privilege('anon', 'public.attribution_events', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.attribution_events', 'SELECT') THEN
    RAISE EXCEPTION '213 ABORTED: a client role holds % on attribution_events.', 'SELECT';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d3m := SQLERRM; d3 := SQLERRM LIKE '213 ABORTED: a client role holds SELECT on attribution_events.%';
  REVOKE SELECT (utm_campaign) ON public.attribution_events FROM authenticated;
END;

BEGIN  -- D4: the service role loses INSERT, which is a silent outage
  REVOKE INSERT ON public.attribution_events FROM service_role;
  IF NOT has_table_privilege('service_role', 'public.attribution_events', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.attribution_events', 'SELECT') THEN
    RAISE EXCEPTION '213 ABORTED: service_role cannot write or read attribution_events.';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d4m := SQLERRM; d4 := SQLERRM LIKE '213 ABORTED: service_role cannot write or read attribution_events.%';
  GRANT ALL ON TABLE public.attribution_events TO service_role;
END;

BEGIN  -- D5: the index exists but is NOT PARTIAL
  -- The mutation the guard's ilike on the WHERE clause exists for. A plain
  -- unique index satisfies "is there an index called this, and is it unique" and
  -- silently swallows every share click after a visit.
  --
  -- The non-visit rows are deleted FIRST, and that deletion is the point rather
  -- than housekeeping: C6 deliberately gave one session two share clicks beside
  -- its visit, so a plain unique index on session_key cannot be BUILT over this
  -- data -- CREATE would raise 23505 before the guard below ever ran, the arm
  -- would catch a duplicate-key error instead of the guard's message, and it
  -- would report MISSED over a guard that is in fact fine. Every row in this
  -- table was created by this transaction, so the delete is local to it.
  DELETE FROM public.attribution_events WHERE event_type <> 'visit';
  DROP INDEX IF EXISTS public.attribution_events_one_visit_per_session;
  CREATE UNIQUE INDEX attribution_events_one_visit_per_session
    ON public.attribution_events (session_key);
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'attribution_events'
       AND indexname = 'attribution_events_one_visit_per_session'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%WHERE (event_type = ''visit''::text)%'
  ) THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events_one_visit_per_session is missing, not '
                    'unique, or not restricted to visit rows (which would swallow share clicks).';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d5m := SQLERRM;
  d5 := SQLERRM LIKE '213 ABORTED: attribution_events_one_visit_per_session is missing, not unique, or not restricted%';
END;

BEGIN  -- D6: the index is not unique at all
  DROP INDEX IF EXISTS public.attribution_events_one_visit_per_session;
  CREATE INDEX attribution_events_one_visit_per_session
    ON public.attribution_events (session_key) WHERE event_type = 'visit';
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'attribution_events'
       AND indexname = 'attribution_events_one_visit_per_session'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%WHERE (event_type = ''visit''::text)%'
  ) THEN
    RAISE EXCEPTION '213 ABORTED: attribution_events_one_visit_per_session is missing, not '
                    'unique, or not restricted to visit rows (which would swallow share clicks).';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d6m := SQLERRM;
  d6 := SQLERRM LIKE '213 ABORTED: attribution_events_one_visit_per_session is missing, not unique, or not restricted%';
END;

BEGIN  -- D7: the summary became SECURITY DEFINER
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.admin_attribution_summary(p_since timestamptz)
    RETURNS TABLE (src text, code text, utm_campaign text, attr_ref text,
                   visits bigint, leads bigint, contacted bigint, attended bigint)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
    AS $b$ SELECT NULL::text, NULL::text, NULL::text, NULL::text,
                  0::bigint, 0::bigint, 0::bigint, 0::bigint WHERE false; $b$;
  $m$;
  IF (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.admin_attribution_summary(timestamptz)'::regprocedure) THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary is SECURITY DEFINER -- it is meant to '
                    'run as the service role that already holds these reads.';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d7m := SQLERRM; d7 := SQLERRM LIKE '213 ABORTED: admin_attribution_summary is SECURITY DEFINER%';
END;

BEGIN  -- D8: THE READ-STEP GUARD. The summary returns nothing at all.
  --
  -- The arm that matters most in Part D, and the reason 213's last guard compares
  -- sum(leads) against count(pass_leads) instead of merely calling the function.
  -- The replacement below is well formed and returns ZERO ROWS, so it satisfies
  -- every catalog assertion in the migration. A guard that only called the
  -- function, or asserted "no error", would pass over it.
  --
  -- IT BUILDS ITS OWN BROKEN FUNCTION RATHER THAN REUSING D7'S, and that is a
  -- correction. This arm first said "D7 has just replaced it" and reported
  -- GUARD_DID_NOT_FIRE: a plpgsql BEGIN ... EXCEPTION block is a SUBTRANSACTION,
  -- so when D7's guard raised and D7 caught it, D7's CREATE OR REPLACE was
  -- ROLLED BACK with everything else in that block. By the time D8 ran, the real
  -- function was back and sum(leads) matched. Every D arm in these files is
  -- therefore independent whether or not it was written that way -- which is
  -- what keeps them from contaminating each other, and is also why none of them
  -- may depend on another's mutation surviving.
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.admin_attribution_summary(p_since timestamptz)
    RETURNS TABLE (src text, code text, utm_campaign text, attr_ref text,
                   visits bigint, leads bigint, contacted bigint, attended bigint)
    LANGUAGE sql STABLE SET search_path = public, pg_catalog
    AS $b$ SELECT NULL::text, NULL::text, NULL::text, NULL::text,
                  0::bigint, 0::bigint, 0::bigint, 0::bigint WHERE false; $b$;
  $m$;
  SELECT coalesce(sum(s.leads), 0) INTO v_leads FROM public.admin_attribution_summary(NULL) s;
  SELECT count(*) INTO v_rows FROM public.pass_leads;
  IF v_leads <> v_rows THEN
    RAISE EXCEPTION '213 ABORTED: admin_attribution_summary accounts for % leads but pass_leads has % '
                    '-- a NULL key is dropping out, so the join is = rather than IS NOT DISTINCT FROM', v_leads, v_rows;
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d8m := SQLERRM; d8 := SQLERRM LIKE '213 ABORTED: admin_attribution_summary accounts for 0 leads%';
END;

INSERT INTO reh_probe VALUES
  (21, 'D1 aborts when RLS is disabled', coalesce(d1m, '(probe row missing)'), coalesce(d1, false)),
  (22, 'D2 aborts when a policy appears, and says how many it found', coalesce(d2m, '(probe row missing)'), coalesce(d2, false)),
  (23, 'D3 aborts on a COLUMN-level SELECT grant to a client role', coalesce(d3m, '(probe row missing)'), coalesce(d3, false)),
  (24, 'D4 aborts when service_role loses INSERT (otherwise a silent outage)', coalesce(d4m, '(probe row missing)'), coalesce(d4, false)),
  (25, 'D5 aborts when the unique index is NOT PARTIAL, which would swallow share clicks', coalesce(d5m, '(probe row missing)'), coalesce(d5, false)),
  (26, 'D6 aborts when the index is partial but not UNIQUE', coalesce(d6m, '(probe row missing)'), coalesce(d6, false)),
  (27, 'D7 aborts when the summary becomes SECURITY DEFINER', coalesce(d7m, '(probe row missing)'), coalesce(d7, false)),
  (28, 'D8 aborts when the summary returns NOTHING, which every catalog check passes', coalesce(d8m, '(probe row missing)'), coalesce(d8, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART E: idempotence. Part D mutated the index and replaced the function, so
-- this restores the real definitions and asserts the end state is the SAME
-- state, which is the re-run a hand-applied file actually gets.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  CREATE TABLE IF NOT EXISTS public.attribution_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    event_type   text NOT NULL,
    session_key  text NOT NULL,
    src          text,
    code         text,
    attr_ref     text,
    utm_source   text,
    utm_medium   text,
    utm_campaign text,
    utm_content  text,
    landing_path text
  );
  DROP INDEX IF EXISTS public.attribution_events_one_visit_per_session;
  CREATE UNIQUE INDEX IF NOT EXISTS attribution_events_one_visit_per_session
    ON public.attribution_events (session_key)
    WHERE event_type = 'visit';
  CREATE INDEX IF NOT EXISTS attribution_events_created_idx
    ON public.attribution_events (created_at DESC);
  ALTER TABLE public.attribution_events ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.attribution_events FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE public.attribution_events TO service_role;

  e1_state := 'tables=' || (SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.attribution_events'))
           || ' rls=' || (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.attribution_events'))::text
           || ' policies=' || (SELECT count(*) FROM pg_policies
                                WHERE schemaname = 'public' AND tablename = 'attribution_events')
           || ' indexes=' || (SELECT count(*) FROM pg_indexes
                               WHERE schemaname = 'public' AND tablename = 'attribution_events'
                                 AND indexname IN ('attribution_events_one_visit_per_session',
                                                   'attribution_events_created_idx'))
           || ' partial_unique=' || (SELECT count(*) FROM pg_indexes
                                      WHERE schemaname = 'public' AND tablename = 'attribution_events'
                                        AND indexname = 'attribution_events_one_visit_per_session'
                                        AND indexdef ILIKE '%UNIQUE%'
                                        AND indexdef ILIKE '%event_type = ''visit''%')
           || ' client_select=' || has_any_column_privilege('authenticated', 'public.attribution_events', 'SELECT')::text;
  e1_ok := (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.attribution_events'))
       AND (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'attribution_events') = 0
       AND (SELECT count(*) FROM pg_indexes
             WHERE schemaname = 'public' AND tablename = 'attribution_events'
               AND indexname = 'attribution_events_one_visit_per_session'
               AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%event_type = ''visit''%') = 1
       AND NOT has_any_column_privilege('authenticated', 'public.attribution_events', 'SELECT');
EXCEPTION WHEN OTHERS THEN
  e1_state := 'second run raised: ' || SQLSTATE || ' ' || SQLERRM; e1_ok := false;
END;

INSERT INTO reh_probe VALUES
  (29, 'E1 a second run restores the same table, the PARTIAL unique index and the same grants',
       coalesce(e1_state, '(probe row missing)'), coalesce(e1_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART F: the premises. Measured rather than inherited from a header.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- F1: PostgREST aggregates really are disabled on this project
  -- The premise for this being a database function at all. If aggregates worked,
  -- the Origen tab could group over the wire and this migration would be
  -- unnecessary surface. Asked of the catalog rather than over HTTP, which is the
  -- most this file can do from here; the behavioural half is the PGRST123 that
  -- lib/dal/adminLeads.ts and fetchGymsAndStudios both already document.
  SELECT coalesce(string_agg(setting, ', '), '(not set, so the default applies)') INTO f1_state
    FROM pg_settings WHERE name = 'pgrst.db_aggregates_enabled';
  f1_state := 'pgrst.db_aggregates_enabled = ' || f1_state
           || ' | see lib/dal/adminLeads.ts: select=count() returns PGRST123 on this project';
  -- Informational, so it passes either way: a FAIL here would read as a defect in
  -- 213 when it is a fact about the platform. The number is what matters.
  f1_ok := true;
EXCEPTION WHEN OTHERS THEN
  f1_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f1_ok := true;
END;

BEGIN  -- F2: service_role has BYPASSRLS, which is why zero policies is workable
  SELECT coalesce(string_agg(r.rolname || ' bypassrls=' || r.rolbypassrls::text, ', '), '(no such role)')
    INTO f2_state FROM pg_roles r WHERE r.rolname = 'service_role';
  SELECT coalesce(bool_and(r.rolbypassrls), false) INTO f2_ok FROM pg_roles r WHERE r.rolname = 'service_role';
EXCEPTION WHEN OTHERS THEN
  f2_state := 'could not read: ' || SQLSTATE || ' ' || SQLERRM; f2_ok := false;
END;

INSERT INTO reh_probe VALUES
  (30, 'F1 CONTEXT: the PostgREST aggregate setting, printed (this is why the grouping is a function)', coalesce(f1_state, '(probe row missing)'), coalesce(f1_ok, false)),
  (31, 'F2 PREMISE: service_role has BYPASSRLS, so RLS on with zero policies still works', coalesce(f2_state, '(probe row missing)'), coalesce(f2_ok, false));

END $outer$;

-- The one result set for the transaction. Every row must read PASS. 31 of 31.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

-- ══════════════════════════════════════════════════════════════════════════
-- PART G: nothing escaped.
--
-- RUN THIS AS ITS OWN STATEMENT, AFTER THE ROLLBACK ABOVE HAS ENDED. A check
-- placed inside would read a database in which the migration IS applied and
-- could not observe whether it escaped.
--
-- Expected BEFORE apply: no attribution_events, no summary function, none of
-- 211's columns, no reh- partner, no reh- lead.
-- ══════════════════════════════════════════════════════════════════════════

SELECT t.seq, CASE WHEN t.passed THEN 'PASS' ELSE 'FAIL' END AS result, t.check_name, t.detail
FROM (VALUES
  (1, 'G1 attribution_events is NOT on the live database',
      coalesce(to_regclass('public.attribution_events')::text, '(absent, as expected)'),
      to_regclass('public.attribution_events') IS NULL),
  (2, 'G2 admin_attribution_summary is NOT on the live database',
      coalesce(to_regprocedure('public.admin_attribution_summary(timestamptz)')::text, '(absent, as expected)'),
      to_regprocedure('public.admin_attribution_summary(timestamptz)') IS NULL),
  (3, 'G3 PART 0 did not escape: none of 211''s columns is on pass_leads',
      (SELECT coalesce(string_agg(attname, ', ' ORDER BY attname), '(none, as expected)') FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')),
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'public.pass_leads'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                          'utm_content', 'landing_path', 'first_touch')) = 0),
  (4, 'G4 the throwaway partner did not escape',
      (SELECT coalesce(string_agg(slug, ', '), '(none, as expected)') FROM public.featured_partners
        WHERE slug LIKE 'reh%'),
      (SELECT count(*) FROM public.featured_partners WHERE slug LIKE 'reh%') = 0),
  (5, 'G5 no rehearsal lead escaped and the live rows are untouched',
      (SELECT count(*)::text || ' leads, '
              || count(*) FILTER (WHERE email LIKE 'reh213-%@example.com')::text || ' rehearsal, '
              || count(attended_at)::text || ' attended, '
              || count(contacted_at)::text || ' contacted'
         FROM public.pass_leads),
      (SELECT count(*) FILTER (WHERE email LIKE 'reh213-%@example.com') = 0
              AND count(*) FILTER (WHERE slug LIKE 'reh%') = 0
         FROM public.pass_leads)),
  (6, 'G6 neither 211 nor 213 is recorded as applied',
      (SELECT coalesce(string_agg(migration, ', ' ORDER BY migration), '(neither recorded, as expected)')
         FROM public.migrations_applied WHERE migration LIKE '211%' OR migration LIKE '213%'),
      (SELECT count(*) FROM public.migrations_applied
        WHERE migration LIKE '211%' OR migration LIKE '213%') = 0)
) AS t(seq, check_name, detail, passed)
ORDER BY t.seq;

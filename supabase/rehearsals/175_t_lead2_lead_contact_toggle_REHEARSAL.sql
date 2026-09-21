-- 175_t_lead2_lead_contact_toggle_REHEARSAL.sql
--
-- Rehearsal for 175_t_lead2_lead_contact_toggle.sql. Run in the Supabase SQL
-- editor. Everything through the ROLLBACK is inside BEGIN ... ROLLBACK;
-- production is not modified. ONE result set for the transaction, because the
-- editor shows only the last statement's result.
--
-- Part A  the migration body applies clean, and the catalog says what it should
-- Part B  the function's decisions, every arm: admin marks and clears, the
--         owning partner marks, a different partner is refused, an ordinary
--         athlete is refused, a signed-out caller is refused, anon cannot even
--         reach it, a missing lead is told apart from a forbidden one
-- Part C  the capability question: a whole-row diff across a real call shows
--         contacted_at as the only column that moved
-- Part D  guard non-vacuity, eleven arms, each reintroducing the mistake its
--         guard names. D7a is the one that failed on the first run and changed
--         the migration.
-- Part E  idempotence
-- Part F  the pre-existing facts this whole design rests on, measured here
--         rather than inherited from a claim: anon 42501, ordinary
--         authenticated zero rows, the owning partner their own rows
-- Part G  nothing escaped -- DELIBERATELY OUTSIDE THE TRANSACTION, see below
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE OBVIOUS VERSION OF THE re-mark CHECK WOULD HAVE BEEN VACUOUS.
--
-- The function coalesces so that marking an already-contacted lead does not
-- move its timestamp. The natural way to test that is to mark twice and assert
-- the value did not change. INSIDE A REHEARSAL THAT ASSERTION CANNOT FAIL:
-- now() is transaction start time, so a second now() in the same transaction
-- returns the identical value, and the check passes with the coalesce deleted.
--
-- So B8 seeds an explicitly OLD contacted_at (2020-01-01) and then marks. With
-- the coalesce, the old stamp survives; without it, the column becomes
-- transaction time, which is six years away and unmistakable.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- COUNTER-REHEARSALS RUN, 2026-09-20. Both on production, both rolled back.
--
--   1. coalesce(contacted_at, now()) -> now()
--      B8 FAILED, 'returned 2026-09-20 13:15:02.977217+00' where 2020 was
--      required. One failure, no collateral.
--
--   2. the function widened, after Part A's guard had already run, to
--      SET contacted_at = now(), notified_at = now(), name = name || ' x'
--      C1 FAILED, 'columns that moved: contacted_at, name, notified_at'.
--      It had to be injected after the guard because the guard aborts the
--      whole script on that shape, which is itself the behaviour D9 proves.
--
-- Production re-verified untouched after each: no function, no index, 3
-- policies, 2 leads, 0 contacted.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY PART G IS NOT IN THE TRANSACTION.
--
-- Everything above it runs inside BEGIN, so a check for "did the migration
-- escape" placed there would be reading a database in which the migration IS
-- applied, and would have to assert the opposite of the truth to pass. A
-- verification cannot observe the mutation it shares a transaction with. Part G
-- is a separate statement after the ROLLBACK, and it is the only part of this
-- file that reads the live state.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PART A IS PROVED BY ARRIVAL, NOT BY A ROW.
--
-- The migration body, including its own guard block, runs as top-level
-- statements before the probe table exists. If any guard raises, the script
-- aborts and there is no result table at all -- which is the loud failure, and
-- is why it is placed first. The A rows below re-assert the catalog facts
-- independently, so a body that ran clean for the wrong reason still shows.
--
-- Scaffolding note, per the same finding 174 records: nothing running as
-- `authenticated` or `anon` writes to the probe table. Every arm restores the
-- role, findings go into plpgsql variables, and rows are written afterwards.
-- Every probe read is COALESCEd so a missing row reads FAIL rather than NULL.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- PART A: the migration body, verbatim from
--         supabase/migrations/175_t_lead2_lead_contact_toggle.sql
--
-- VERBATIM MEANS BYTE FOR BYTE, comments included, and that is checkable:
--
--   python3 -c "m=open('supabase/migrations/175_t_lead2_lead_contact_toggle.sql').read().rstrip(); \
--               r=open('supabase/rehearsals/175_t_lead2_lead_contact_toggle_REHEARSAL.sql').read(); \
--               print(m in r)"
--
-- The comments are not decoration here. The last guard reads the function's
-- prosrc and strips line comments before parsing its SET clause, so a rehearsal
-- that paraphrased the body would be exercising a different input than the
-- migration will. Rerun that check after editing either file.
-- ══════════════════════════════════════════════════════════════════════════

-- 175_t_lead2_lead_contact_toggle.sql
--
-- T-LEAD2, the data half. Two things: the one index the unfiltered admin list
-- needs, and the only write either leads view is allowed to make.
--
-- Numbered against origin/main re-read at the moment of writing (highest: 174,
-- 174_reviews_self_review_policy). 172 collided once already because two
-- sessions each inferred a number from their own branch rather than from main.
--
-- WHAT THIS DOES NOT DO, because 173 already did it:
--   * the (partner_id, created_at DESC) index -- exists as idx_pass_leads_partner_created
--   * the partial uncontacted index          -- exists as idx_pass_leads_uncontacted
--   * an admin SELECT policy                 -- exists as "Admins manage pass leads"
--   * a partner SELECT policy                -- exists as "Partner reads own leads"
-- Measured on production before writing, not inferred from the migration files.
-- NO POLICY IS ADDED OR CHANGED HERE. The guard at the bottom asserts the count
-- is still 3.

-- ── The missing index ─────────────────────────────────────────────────────
--
-- 173 indexed (partner_id, created_at DESC) because everything it anticipated
-- was per-partner: the digest and the partner dashboard. The admin view asks a
-- question neither of those does -- every lead, newest first, across all
-- partners -- and a leading partner_id cannot serve an ordering that does not
-- filter on it.
--
-- Also the driver for two of the three tiles (totales, ultimos 7 dias), which
-- count without a partner predicate whenever the filter is on Todos.
CREATE INDEX IF NOT EXISTS idx_pass_leads_created
  ON public.pass_leads (created_at DESC);

-- ── The Contactado toggle ─────────────────────────────────────────────────
--
-- 173 said this would be a SECURITY DEFINER function when it shipped, and gave
-- the reason: a policy grants the WHOLE ROW, and an UPDATE policy's WITH CHECK
-- cannot see the OLD row, so an owner UPDATE policy here would let a partner
-- rewrite a lead's email and phone number. That is migration 018's mistake on
-- this table family, which 104 had to undo.
--
-- THERE IS ALSO NO OTHER OPTION, which is worth stating because it is easy to
-- reach for the panel's usual pattern and find it silently impossible.
-- Measured with has_column_privilege on production: `authenticated` holds
-- SELECT on all 19 columns of pass_leads and UPDATE on NONE. So the existing
-- "Admins manage pass leads" policy (FOR ALL, is_app_admin()) is unreachable
-- for writes from any browser client -- an admin gets 42501 on a direct
-- update, and so does a partner. The grants are narrower than the policies,
-- deliberately (173 narrowed them), and this function is the doorway.
--
-- ONE FUNCTION, TWO AUDIENCES. The admin Leads tab and the partner dashboard
-- both call this. Splitting them would mean two places where the writable
-- surface could widen independently.
--
-- THE WRITABLE SURFACE IS ONE COLUMN BY CONSTRUCTION. Not "by policy", which
-- someone can widen with an ALTER; the function names contacted_at and there is
-- nowhere else for a value to go.
CREATE OR REPLACE FUNCTION public.set_pass_lead_contacted(p_lead_id uuid, p_contacted boolean)
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
  -- SECURITY DEFINER runs as the owner, so nothing below is protected by RLS.
  -- Every check has to be made here, explicitly, starting with whether there is
  -- a caller at all. auth.uid() reads the JWT claim and is unaffected by the
  -- role switch.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_pass_lead_contacted: no authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.partner_id, true INTO v_partner_id, v_found
  FROM public.pass_leads l
  WHERE l.id = p_lead_id;

  -- A missing lead is told apart from a forbidden one only in the error code;
  -- both are dead ends for the caller. They are separate branches because
  -- collapsing them would make "you may not" and "it is gone" the same answer,
  -- and the UI would report the wrong thing for one of them.
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'set_pass_lead_contacted: lead % does not exist', p_lead_id
      USING ERRCODE = 'P0002';
  END IF;

  -- An admin, or the partner whose lead it is. v_partner_id IS NULL when the
  -- partner row was deleted (partner_id is ON DELETE SET NULL), and the EXISTS
  -- is then false for everyone: an orphaned lead is admin-only, which is right.
  -- It is still a real person who left a phone number, so it stays readable and
  -- workable rather than being hidden.
  IF NOT (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.featured_partners fp
      WHERE fp.id = v_partner_id
        AND fp.user_id = auth.uid()
    )
  ) THEN
    -- RAISES RATHER THAN UPDATING ZERO ROWS. A no-op would return successfully
    -- and the toggle would flip back on the next reload with no error shown,
    -- which reads as a flaky product rather than as a refusal.
    RAISE EXCEPTION 'set_pass_lead_contacted: caller may not modify lead %', p_lead_id
      USING ERRCODE = '42501';
  END IF;

  -- coalesce, not a bare now(): marking an already-contacted lead again must
  -- not move the timestamp. "When was this person contacted" is the useful
  -- record, and a double tap should not rewrite it.
  UPDATE public.pass_leads
     SET contacted_at = CASE WHEN p_contacted THEN coalesce(contacted_at, now()) ELSE NULL END
   WHERE id = p_lead_id
  RETURNING contacted_at INTO v_result;

  -- The caller renders THIS, not the value it asked for, so the UI can never
  -- drift from the row.
  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) IS
  'The only write either leads view may make. SECURITY DEFINER because '
  'authenticated holds no UPDATE privilege on pass_leads at all, so the admin '
  'policy is unreachable from a browser client. Serves the admin tab and the '
  'partner dashboard from one implementation; the writable surface is '
  'contacted_at by construction rather than by policy. Raises 42501 for a '
  'caller who is neither an admin nor the lead''s partner, rather than '
  'updating zero rows.';

-- Default privileges grant EXECUTE on a new function to PUBLIC, which includes
-- anon -- the key that ships in the client bundle. Revoke first, then grant the
-- one role that may call it. anon is deliberately absent: a stranger filing a
-- lead has no business marking one contacted.
REVOKE ALL ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) TO authenticated;

-- ── Guards ────────────────────────────────────────────────────────────────
--
-- Each of these was proved to fire by reintroducing the mistake it names and
-- watching it raise; a guard that has only ever been observed staying quiet has
-- not been shown to do anything.
DO $$
DECLARE
  n_pol   int;
  setters text;
BEGIN
  IF to_regclass('public.pass_leads') IS NULL THEN
    RAISE EXCEPTION '175 guard: pass_leads does not exist -- 173 has not been applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pass_leads' AND indexname = 'idx_pass_leads_created'
  ) THEN
    RAISE EXCEPTION '175 guard: idx_pass_leads_created is missing';
  END IF;

  IF to_regprocedure('public.set_pass_lead_contacted(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() is missing -- neither '
                    'leads view can mark anything contacted';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure) THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() is not SECURITY DEFINER -- '
                    'it would run as the caller, who holds no UPDATE on pass_leads, '
                    'and every toggle would fail with 42501';
  END IF;

  -- An unpinned search_path in a SECURITY DEFINER function is the classic
  -- privilege-escalation hole: the caller chooses which schema `pass_leads`
  -- resolves to.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
  ) THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() has no pinned search_path';
  END IF;

  IF has_function_privilege('anon', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '175 guard: anon can EXECUTE set_pass_lead_contacted() -- the key '
                    'in the client bundle could mark any lead contacted';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '175 guard: authenticated cannot EXECUTE set_pass_lead_contacted() -- '
                    'the toggle is dead for admins and partners alike';
  END IF;

  -- THE POINT OF THE WHOLE DESIGN: the function is the doorway BECAUSE the
  -- table has no other one. If a later migration grants UPDATE to a client
  -- role, the single-column guarantee is gone and nothing else would say so.
  -- has_ANY_column_privilege, NOT has_table_privilege, and the rehearsal is
  -- what found it. D7 granted UPDATE (contacted_at) to authenticated and the
  -- guard STAYED QUIET: has_table_privilege answers only "is the privilege held
  -- at table level", so a column-level grant is invisible to it. That is the
  -- exact hole this guard exists to close -- a later migration granting
  -- UPDATE (email) on pass_leads would have sailed past it, and a partner could
  -- then rewrite a lead's address.
  --
  -- has_any_column_privilege is true for a table-level grant OR a grant on any
  -- single column, so it strictly subsumes the question that was being asked.
  -- Both arms are proved in the rehearsal: a column grant and a table grant.
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '175 guard: a client role holds UPDATE on pass_leads -- the '
                    'single-column write surface is no longer guaranteed';
  END IF;

  -- No policy was added or changed here. 173 left three; three is still right.
  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads';
  IF n_pol <> 3 THEN
    RAISE EXCEPTION '175 guard: pass_leads has % policies, expected 3 -- 175 adds none', n_pol;
  END IF;

  -- EVERY assignment target in the UPDATE's SET clause, not just the first.
  --
  -- The first version of this guard matched '\mSET\s+([a-z_]+)\s*=' and was
  -- proved useless by its own counter-rehearsal: adding a SECOND column on the
  -- next line ("SET contacted_at = ..., notified_at = now()") left the guard
  -- green, because only the first target follows the word SET. It could see the
  -- shape it was built for and nothing else -- which is the entire failure this
  -- guard exists to catch, wearing the guard's own clothes.
  --
  -- So: take the whole clause between SET and WHERE and read every target in
  -- it. Line comments are stripped first, because a guard that matches prose
  -- inside the body it is reading is migration 165's finding repeated.
  --
  -- The limits are real and worth stating: this reads the text of one function
  -- rather than asking the database what the function can do, and Postgres
  -- offers no capability form of the question. The rehearsal's Part D does ask
  -- the capability question -- it diffs the whole row before and after a real
  -- call -- and that is the stronger proof. This is the cheap always-on version.
  SELECT string_agg(DISTINCT m[1], ', ' ORDER BY m[1]) INTO setters
  FROM pg_proc p,
       LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
       LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
       LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
  WHERE p.oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure;
  IF setters IS DISTINCT FROM 'contacted_at' THEN
    RAISE EXCEPTION '175 guard: the UPDATE assigns to [%], expected contacted_at alone', setters;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- The probe table
-- ══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE reh_probe (
  seq integer, check_name text, detail text, passed boolean
) ON COMMIT DROP;

-- Part A, re-asserted from the catalog. Driven off a VALUES list so a missing
-- row FAILS rather than dropping its check from the output.
INSERT INTO reh_probe
SELECT t.seq, t.check_name, coalesce(t.detail, '(probe row missing)'), coalesce(t.passed, false)
FROM (VALUES
  (1, 'A1 idx_pass_leads_created exists and is a DESC index on created_at',
      (SELECT coalesce(max(indexdef), '(none)') FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'pass_leads' AND indexname = 'idx_pass_leads_created'),
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'pass_leads'
          AND indexname = 'idx_pass_leads_created'
          AND indexdef ILIKE '%created_at DESC%') = 1),
  (2, 'A2 the three indexes 173 shipped are untouched',
      (SELECT string_agg(indexname, ', ' ORDER BY indexname) FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'pass_leads'),
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'pass_leads'
          AND indexname IN ('idx_pass_leads_partner_created', 'idx_pass_leads_uncontacted', 'pass_leads_pkey')) = 3),
  (3, 'A3 set_pass_lead_contacted(uuid,boolean) exists, returns timestamptz, SECURITY DEFINER',
      (SELECT 'secdef=' || prosecdef::text || ' returns=' || pg_get_function_result(oid)
         FROM pg_proc WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure),
      (SELECT prosecdef AND pg_get_function_result(oid) = 'timestamp with time zone'
         FROM pg_proc WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure)),
  (4, 'A4 its search_path is pinned',
      (SELECT coalesce(array_to_string(proconfig, ' '), '(none)')
         FROM pg_proc WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure),
      (SELECT proconfig IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
         FROM pg_proc WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure)),
  (5, 'A5 EXECUTE: authenticated yes, anon no, PUBLIC no',
      'authenticated=' || has_function_privilege('authenticated', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE')::text
      || ' anon=' || has_function_privilege('anon', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE')::text,
      has_function_privilege('authenticated', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE')),
  (6, 'A6 no policy was added: pass_leads still has exactly the three 173 shipped',
      (SELECT string_agg(policyname, ' | ' ORDER BY policyname) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pass_leads'),
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') = 3),
  (7, 'A7 no client role gained UPDATE on pass_leads',
      'authenticated=' || has_table_privilege('authenticated', 'public.pass_leads', 'UPDATE')::text
      || ' anon=' || has_table_privilege('anon', 'public.pass_leads', 'UPDATE')::text,
      NOT has_table_privilege('authenticated', 'public.pass_leads', 'UPDATE')
      AND NOT has_table_privilege('anon', 'public.pass_leads', 'UPDATE'))
) AS t(seq, check_name, detail, passed);

DO $outer$
DECLARE
  -- Production ids, read 2026-09-20. Named constants rather than inline
  -- literals so a wrong one is wrong in one place.
  k_admin     constant uuid := 'eaff348f-5df3-4df5-bd80-69ec233aad0e';  -- Al
  k_leo       constant uuid := '0df617e9-7547-4a8d-a0b1-8be4d52a673a';  -- owns BullBox
  k_other     constant uuid := 'a8bea932-7e1e-4b65-baaf-83c30e48ba13';  -- owns Marce Anahata
  k_athlete   constant uuid := '813cb405-47ce-4bca-860a-d8e62f37f335';  -- an ordinary account
  k_lead      constant uuid := '770d3cfa-b59c-461e-8a35-54813f1afbb6';  -- a BullBox lead
  k_lead2     constant uuid := '4292a726-27c2-4dd9-a333-702d7e86a099';  -- the other one
  k_absent    constant uuid := '00000000-0000-0000-0000-0000000175ab';  -- no such lead
  k_bullbox   constant uuid := '040cbc21-1b11-4ae1-aa99-9fe35a32bda0';

  b1_state text := '(never ran)';  b1_ok boolean := false;
  b2_state text := '(never ran)';  b2_ok boolean := false;
  b3_state text := '(never ran)';  b3_ok boolean := false;
  b4_state text := '(never ran)';  b4_ok boolean := false;
  b5_state text := '(never ran)';  b5_ok boolean := false;
  b6_state text := '(never ran)';  b6_ok boolean := false;
  b7_state text := '(never ran)';  b7_ok boolean := false;
  b8_state text := '(never ran)';  b8_ok boolean := false;
  b9_state text := '(never ran)';  b9_ok boolean := false;

  c1_state text := '(never ran)';  c1_ok boolean := false;

  d1 boolean := false; d1m text := '(none)';
  d2 boolean := false; d2m text := '(none)';
  d3 boolean := false; d3m text := '(none)';
  d4 boolean := false; d4m text := '(none)';
  d5 boolean := false; d5m text := '(none)';
  d6 boolean := false; d6m text := '(none)';
  d7 boolean := false; d7m text := '(none)';
  d8 boolean := false; d8m text := '(none)';
  d9 boolean := false; d9m text := '(none)';
  d10 boolean := false; d10m text := '(none)';

  e1_state text := '(never ran)';  e1_ok boolean := false;

  f1_state text := '(never ran)';  f1_ok boolean := false;
  f2_state text := '(never ran)';  f2_ok boolean := false;
  f3_state text := '(never ran)';  f3_ok boolean := false;
  f4_state text := '(never ran)';  f4_ok boolean := false;

  v_stamp   timestamptz;
  v_before  jsonb;
  v_after   jsonb;
  v_diff    text;
  v_n       int;
  v_setters text;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════
-- PART B: what the function decides
-- ══════════════════════════════════════════════════════════════════════════

-- B1: an admin marks a lead contacted.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead, true);
    b1_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b1_ok := v_stamp IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    b1_state := SQLSTATE || ' ' || SQLERRM; b1_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Read back on the live row rather than trusting the return value: the
  -- assertion is that the ROW changed, not that the function said so.
  SELECT contacted_at INTO v_stamp FROM public.pass_leads WHERE id = k_lead;
  b1_ok := b1_ok AND v_stamp IS NOT NULL;
  b1_state := b1_state || '; row reads ' || coalesce(v_stamp::text, 'NULL');
  RAISE EXCEPTION 'REH_UNWIND_B1';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B1' AND b1_state = '(never ran)' THEN
    b1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b1_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B2: the same admin clears it again. Off must be reachable, or a mis-tap is
-- permanent and the "leads sin contactar" tile can only ever go down.
BEGIN
  UPDATE public.pass_leads SET contacted_at = now() WHERE id = k_lead;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead, false);
    b2_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b2_ok := v_stamp IS NULL;
  EXCEPTION WHEN OTHERS THEN
    b2_state := SQLSTATE || ' ' || SQLERRM; b2_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT contacted_at INTO v_stamp FROM public.pass_leads WHERE id = k_lead;
  b2_ok := b2_ok AND v_stamp IS NULL;
  b2_state := b2_state || '; row reads ' || coalesce(v_stamp::text, 'NULL');
  RAISE EXCEPTION 'REH_UNWIND_B2';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B2' AND b2_state = '(never ran)' THEN
    b2_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b2_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B3: the partner who OWNS the lead marks it. This is part D's whole write
-- path, and it must work without the caller being an admin.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_leo::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead2, true);
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

-- B4: a DIFFERENT active partner. Not a stranger off the street: someone who
-- owns a featured_partners row and would pass any check that merely asked
-- "are you a partner".
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_other::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead, true);
    b4_state := 'SUCCEEDED -- another partner marked a BullBox lead, returned ' || coalesce(v_stamp::text, 'NULL');
    b4_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b4_state := SQLSTATE || ' ' || SQLERRM;
    b4_ok := (SQLSTATE = '42501');
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

-- B5: an ordinary athlete.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_athlete::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead, true);
    b5_state := 'SUCCEEDED -- an ordinary account marked a lead, returned ' || coalesce(v_stamp::text, 'NULL');
    b5_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b5_state := SQLSTATE || ' ' || SQLERRM;
    b5_ok := (SQLSTATE = '42501');
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

-- B6: the `authenticated` ROLE with no JWT at all. This is the body's
-- auth.uid() IS NULL branch, and it is a different refusal from B7's: here the
-- caller may EXECUTE the function and is turned away inside it.
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead, true);
    b6_state := 'SUCCEEDED with no caller, returned ' || coalesce(v_stamp::text, 'NULL');
    b6_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b6_state := SQLSTATE || ' ' || SQLERRM;
    b6_ok := (SQLSTATE = '42501' AND SQLERRM LIKE '%no authenticated caller%');
  END;
  RESET ROLE;
  RAISE EXCEPTION 'REH_UNWIND_B6';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B6' AND b6_state = '(never ran)' THEN
    b6_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b6_ok := false;
  END IF;
  RESET ROLE;
END;

-- B7: anon cannot reach the function at all. The refusal comes from the GRANT,
-- before a line of the body runs, which is the stronger of the two and is why
-- both are checked rather than one standing in for the other.
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead, true);
    b7_state := 'SUCCEEDED as anon, returned ' || coalesce(v_stamp::text, 'NULL');
    b7_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b7_state := SQLSTATE || ' ' || SQLERRM;
    b7_ok := (SQLSTATE = '42501' AND SQLERRM ILIKE '%permission denied for function%');
  END;
  RESET ROLE;
  RAISE EXCEPTION 'REH_UNWIND_B7';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B7' AND b7_state = '(never ran)' THEN
    b7_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b7_ok := false;
  END IF;
  RESET ROLE;
END;

-- B8: re-marking preserves the ORIGINAL timestamp.
--
-- Seeded with an explicitly old value rather than by marking twice. now() is
-- transaction start time, so a mark-twice check passes with the coalesce
-- deleted and proves nothing. 2020 against transaction time is unmistakable.
BEGIN
  UPDATE public.pass_leads SET contacted_at = timestamptz '2020-01-01 09:00:00-05' WHERE id = k_lead;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_lead, true);
    b8_state := 'returned ' || coalesce(v_stamp::text, 'NULL');
    b8_ok := (v_stamp = timestamptz '2020-01-01 09:00:00-05');
  EXCEPTION WHEN OTHERS THEN
    b8_state := SQLSTATE || ' ' || SQLERRM; b8_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B8';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B8' AND b8_state = '(never ran)' THEN
    b8_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b8_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

-- B9: a lead that does not exist is P0002, not 42501. An admin who pastes a
-- stale id should be told the row is gone, not that they lack permission.
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_stamp := public.set_pass_lead_contacted(k_absent, true);
    b9_state := 'SUCCEEDED on a lead that does not exist';
    b9_ok := false;
  EXCEPTION WHEN OTHERS THEN
    b9_state := SQLSTATE || ' ' || SQLERRM;
    b9_ok := (SQLSTATE = 'P0002');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE EXCEPTION 'REH_UNWIND_B9';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_B9' AND b9_state = '(never ran)' THEN
    b9_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; b9_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

INSERT INTO reh_probe VALUES
  ( 8, 'B1 an admin marks a lead contacted and the ROW carries the stamp', coalesce(b1_state, '(probe row missing)'), coalesce(b1_ok, false)),
  ( 9, 'B2 an admin clears it again, and the row reads NULL', coalesce(b2_state, '(probe row missing)'), coalesce(b2_ok, false)),
  (10, 'B3 the OWNING partner marks their own lead without being an admin', coalesce(b3_state, '(probe row missing)'), coalesce(b3_ok, false)),
  (11, 'B4 a DIFFERENT active partner is refused 42501', coalesce(b4_state, '(probe row missing)'), coalesce(b4_ok, false)),
  (12, 'B5 an ordinary athlete is refused 42501', coalesce(b5_state, '(probe row missing)'), coalesce(b5_ok, false)),
  (13, 'B6 the authenticated role with NO jwt is refused inside the body', coalesce(b6_state, '(probe row missing)'), coalesce(b6_ok, false)),
  (14, 'B7 anon cannot EXECUTE it at all, refused before the body runs', coalesce(b7_state, '(probe row missing)'), coalesce(b7_ok, false)),
  (15, 'B8 re-marking preserves the ORIGINAL timestamp, not transaction time', coalesce(b8_state, '(probe row missing)'), coalesce(b8_ok, false)),
  (16, 'B9 a lead that does not exist raises P0002, told apart from a refusal', coalesce(b9_state, '(probe row missing)'), coalesce(b9_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART C: the capability question
--
-- The migration's last guard reads the TEXT of the function and asserts the
-- SET clause names contacted_at alone. Postgres offers no capability form of
-- that question, so this asks it the only way available: diff the whole row
-- across a real call and name every column that moved. This is the stronger
-- proof; the text guard is the cheap always-on version of it.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  SELECT to_jsonb(l.*) INTO v_before FROM public.pass_leads l WHERE l.id = k_lead;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.set_pass_lead_contacted(k_lead, true);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT to_jsonb(l.*) INTO v_after FROM public.pass_leads l WHERE l.id = k_lead;

  SELECT coalesce(string_agg(key, ', ' ORDER BY key), '(nothing changed)')
    INTO v_diff
  FROM jsonb_each(v_before) b
  WHERE b.value IS DISTINCT FROM (v_after -> b.key);

  -- Both halves. "(nothing changed)" would mean the call did nothing at all,
  -- which is a different failure and must not read as a pass.
  c1_state := 'columns that moved: ' || v_diff;
  c1_ok := (v_diff = 'contacted_at');
  RAISE EXCEPTION 'REH_UNWIND_C1';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_C1' AND c1_state = '(never ran)' THEN
    c1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; c1_ok := false;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

INSERT INTO reh_probe VALUES
  (17, 'C1 a whole-row diff across a real call shows contacted_at as the ONLY column that moved',
       coalesce(c1_state, '(probe row missing)'), coalesce(c1_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART D: guard non-vacuity
--
-- Each arm reintroduces the mistake its guard names and requires the guard to
-- raise with that guard's own message. A guard that has only ever been seen
-- staying quiet has not been shown to do anything.
--
-- The guard condition in each arm is copied verbatim from the migration. That
-- is the house shape (174 Part F does the same) and its residual risk is
-- stated plainly: this proves the LOGIC fires, while Part A proves the
-- migration's actual block runs clean on this database.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- D1: the index is missing
  DROP INDEX IF EXISTS public.idx_pass_leads_created;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pass_leads' AND indexname = 'idx_pass_leads_created'
  ) THEN
    RAISE EXCEPTION '175 guard: idx_pass_leads_created is missing';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d1m := SQLERRM; d1 := SQLERRM LIKE '175 guard: idx_pass_leads_created is missing%';
END;

BEGIN  -- D2: the function is missing
  DROP FUNCTION IF EXISTS public.set_pass_lead_contacted(uuid, boolean);
  IF to_regprocedure('public.set_pass_lead_contacted(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() is missing -- neither '
                    'leads view can mark anything contacted';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d2m := SQLERRM; d2 := SQLERRM LIKE '175 guard: set_pass_lead_contacted() is missing%';
END;

BEGIN  -- D3: it is not SECURITY DEFINER
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.set_pass_lead_contacted(p_lead_id uuid, p_contacted boolean)
    RETURNS timestamptz LANGUAGE plpgsql VOLATILE SET search_path = public, pg_catalog
    AS $b$ BEGIN
      UPDATE public.pass_leads SET contacted_at = now() WHERE id = p_lead_id;
      RETURN now();
    END $b$;
  $m$;
  IF NOT (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure) THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() is not SECURITY DEFINER -- '
                    'it would run as the caller, who holds no UPDATE on pass_leads, '
                    'and every toggle would fail with 42501';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d3m := SQLERRM; d3 := SQLERRM LIKE '175 guard: set_pass_lead_contacted() is not SECURITY DEFINER%';
END;

BEGIN  -- D4: the search_path is not pinned
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.set_pass_lead_contacted(p_lead_id uuid, p_contacted boolean)
    RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    AS $b$ BEGIN
      UPDATE public.pass_leads SET contacted_at = now() WHERE id = p_lead_id;
      RETURN now();
    END $b$;
  $m$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure
      AND proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search\_path=%')
  ) THEN
    RAISE EXCEPTION '175 guard: set_pass_lead_contacted() has no pinned search_path';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d4m := SQLERRM; d4 := SQLERRM LIKE '175 guard: set_pass_lead_contacted() has no pinned search_path%';
END;

BEGIN  -- D5: anon can execute it
  GRANT EXECUTE ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) TO anon;
  IF has_function_privilege('anon', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '175 guard: anon can EXECUTE set_pass_lead_contacted() -- the key '
                    'in the client bundle could mark any lead contacted';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d5m := SQLERRM; d5 := SQLERRM LIKE '175 guard: anon can EXECUTE set_pass_lead_contacted()%';
END;

BEGIN  -- D6: authenticated cannot execute it
  REVOKE EXECUTE ON FUNCTION public.set_pass_lead_contacted(uuid, boolean) FROM authenticated;
  IF NOT has_function_privilege('authenticated', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '175 guard: authenticated cannot EXECUTE set_pass_lead_contacted() -- '
                    'the toggle is dead for admins and partners alike';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d6m := SQLERRM; d6 := SQLERRM LIKE '175 guard: authenticated cannot EXECUTE set_pass_lead_contacted()%';
END;

BEGIN  -- D7a: a client role holds UPDATE on ONE COLUMN
  -- THIS ARM IS WHY THE GUARD CHANGED. The first version asked
  -- has_table_privilege, which answers only "is UPDATE held at TABLE level" and
  -- is FALSE while a role genuinely holds UPDATE on a column. This mutation
  -- left the guard green on the first run of this rehearsal. Measured:
  -- after GRANT UPDATE (contacted_at) TO authenticated,
  --   has_table_privilege      = false
  --   has_any_column_privilege = true
  --   has_column_privilege(contacted_at) = true, (email) = false
  -- A later migration granting UPDATE (email) would have passed the guard, and
  -- a partner could then rewrite a lead's address. This is the column-grant
  -- arm; D7b keeps the table-level case covered so the fix cannot trade one
  -- blindness for the other.
  GRANT UPDATE (contacted_at) ON public.pass_leads TO authenticated;
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '175 guard: a client role holds UPDATE on pass_leads -- the '
                    'single-column write surface is no longer guaranteed';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d7m := SQLERRM; d7 := SQLERRM LIKE '175 guard: a client role holds UPDATE on pass_leads%';
END;

BEGIN  -- D7b: a client role holds UPDATE on the whole table
  GRANT UPDATE ON public.pass_leads TO authenticated;
  IF has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
     OR has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE') THEN
    RAISE EXCEPTION '175 guard: a client role holds UPDATE on pass_leads -- the '
                    'single-column write surface is no longer guaranteed';
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d10m := SQLERRM; d10 := SQLERRM LIKE '175 guard: a client role holds UPDATE on pass_leads%';
END;

BEGIN  -- D8: a fourth policy appears
  CREATE POLICY "reh 175 fourth policy" ON public.pass_leads FOR SELECT USING (false);
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads';
  IF v_n <> 3 THEN
    RAISE EXCEPTION '175 guard: pass_leads has % policies, expected 3 -- 175 adds none', v_n;
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d8m := SQLERRM; d8 := SQLERRM LIKE '175 guard: pass_leads has 4 policies, expected 3%';
END;

BEGIN  -- D9a: the UPDATE assigns a SECOND column
  -- This is the mutant that defeated the guard's first version, which matched
  -- only the target immediately after the word SET.
  EXECUTE $m$
    CREATE OR REPLACE FUNCTION public.set_pass_lead_contacted(p_lead_id uuid, p_contacted boolean)
    RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
    AS $b$ DECLARE v timestamptz; BEGIN
      UPDATE public.pass_leads
         SET contacted_at = now(),
             notified_at = now()
       WHERE id = p_lead_id
      RETURNING contacted_at INTO v;
      RETURN v;
    END $b$;
  $m$;
  SELECT string_agg(DISTINCT m[1], ', ' ORDER BY m[1]) INTO v_setters
  FROM pg_proc p,
       LATERAL (SELECT regexp_replace(p.prosrc, '--[^\n]*', '', 'g') AS body) b,
       LATERAL (SELECT (regexp_match(b.body, '\mSET\s+((?:.|\n)*?)\mWHERE\M'))[1] AS set_clause) c,
       LATERAL regexp_matches(c.set_clause, '([a-z_]+)\s*=', 'g') AS m
  WHERE p.oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure;
  IF v_setters IS DISTINCT FROM 'contacted_at' THEN
    RAISE EXCEPTION '175 guard: the UPDATE assigns to [%], expected contacted_at alone', v_setters;
  END IF;
  RAISE EXCEPTION 'GUARD_DID_NOT_FIRE';
EXCEPTION WHEN OTHERS THEN
  d9m := SQLERRM;
  -- Names BOTH columns, in order. A guard reporting only one of them would be
  -- the old version passing half the time.
  d9 := SQLERRM LIKE '175 guard: the UPDATE assigns to [contacted_at, notified_at]%';
END;

INSERT INTO reh_probe VALUES
  (18, 'D1 aborts when idx_pass_leads_created is missing', coalesce(d1m, '(probe row missing)'), coalesce(d1, false)),
  (19, 'D2 aborts when the function is missing', coalesce(d2m, '(probe row missing)'), coalesce(d2, false)),
  (20, 'D3 aborts when the function is not SECURITY DEFINER', coalesce(d3m, '(probe row missing)'), coalesce(d3, false)),
  (21, 'D4 aborts when the search_path is not pinned', coalesce(d4m, '(probe row missing)'), coalesce(d4, false)),
  (22, 'D5 aborts when anon can EXECUTE it', coalesce(d5m, '(probe row missing)'), coalesce(d5, false)),
  (23, 'D6 aborts when authenticated cannot EXECUTE it', coalesce(d6m, '(probe row missing)'), coalesce(d6, false)),
  (24, 'D7a aborts on a COLUMN-level UPDATE grant, which has_table_privilege could not see', coalesce(d7m, '(probe row missing)'), coalesce(d7, false)),
  (25, 'D7b aborts on a TABLE-level UPDATE grant, so the fix did not trade one blindness for another', coalesce(d10m, '(probe row missing)'), coalesce(d10, false)),
  (26, 'D8 aborts at 4 policies and says how many it found', coalesce(d8m, '(probe row missing)'), coalesce(d8, false)),
  (27, 'D9 names BOTH columns when a second assignment is added, which the first version of this guard could not see',
       coalesce(d9m, '(probe row missing)'), coalesce(d9, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART E: idempotence
-- ══════════════════════════════════════════════════════════════════════════

BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pass_leads_created ON public.pass_leads (created_at DESC)';
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'pass_leads' AND indexname = 'idx_pass_leads_created';
  e1_state := 'second run left ' || v_n || ' index(es) named idx_pass_leads_created';
  e1_ok := (v_n = 1);
  RAISE EXCEPTION 'REH_UNWIND_E1';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'REH_UNWIND_E1' AND e1_state = '(never ran)' THEN
    e1_state := 'scaffolding failed: ' || SQLSTATE || ' ' || SQLERRM; e1_ok := false;
  END IF;
END;

INSERT INTO reh_probe VALUES
  (28, 'E1 a second run of the index is a no-op rather than a duplicate or an error',
       coalesce(e1_state, '(probe row missing)'), coalesce(e1_ok, false));

-- ══════════════════════════════════════════════════════════════════════════
-- PART F: the pre-existing facts the design rests on
--
-- 175 adds no policy because 173's are already right, and both leads views are
-- built on that claim. Measured here rather than inherited. F3 is the POSITIVE
-- CONTROL: without it, F1, F2 and F4 are equally consistent with a policy that
-- hides the table from everybody, which is a passing test that proves nothing.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN  -- F1: anon
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n FROM public.pass_leads;
    f1_state := v_n || ' rows, no error'; f1_ok := false;
  EXCEPTION WHEN OTHERS THEN
    f1_state := SQLSTATE || ' ' || SQLERRM; f1_ok := (SQLSTATE = '42501');
  END;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
END;

BEGIN  -- F2: an ordinary authenticated athlete
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_athlete::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_n FROM public.pass_leads;
    f2_state := v_n || ' rows, no error'; f2_ok := (v_n = 0);
  EXCEPTION WHEN OTHERS THEN
    f2_state := SQLSTATE || ' ' || SQLERRM; f2_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

BEGIN  -- F3: the owning partner, the positive control
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_leo::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_n FROM public.pass_leads WHERE partner_id = k_bullbox;
    f3_state := v_n || ' rows, no error'; f3_ok := (v_n > 0);
  EXCEPTION WHEN OTHERS THEN
    f3_state := SQLSTATE || ' ' || SQLERRM; f3_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

BEGIN  -- F4: a different partner asking for BullBox's rows by id
  PERFORM set_config('request.jwt.claims', json_build_object('sub', k_other::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_n FROM public.pass_leads WHERE partner_id = k_bullbox;
    f4_state := v_n || ' rows, no error'; f4_ok := (v_n = 0);
  EXCEPTION WHEN OTHERS THEN
    f4_state := SQLSTATE || ' ' || SQLERRM; f4_ok := false;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END;

INSERT INTO reh_probe VALUES
  (29, 'F1 anon SELECT on pass_leads is 42501', coalesce(f1_state, '(probe row missing)'), coalesce(f1_ok, false)),
  (30, 'F2 an ordinary authenticated account reads ZERO rows, no error', coalesce(f2_state, '(probe row missing)'), coalesce(f2_ok, false)),
  (31, 'F3 POSITIVE CONTROL: the owning partner reads their own rows', coalesce(f3_state, '(probe row missing)'), coalesce(f3_ok, false)),
  (32, 'F4 a different partner asking for BullBox by id reads ZERO rows', coalesce(f4_state, '(probe row missing)'), coalesce(f4_ok, false));

END $outer$;

-- The one result set for the transaction. Every row must read PASS. 32 of 32.
SELECT seq, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, check_name, detail
FROM reh_probe ORDER BY seq;

ROLLBACK;

-- ══════════════════════════════════════════════════════════════════════════
-- PART G: nothing escaped.
--
-- RUN THIS AS ITS OWN STATEMENT, AFTER THE ROLLBACK ABOVE HAS ENDED. It is
-- outside the transaction on purpose: a check placed inside would be reading a
-- database in which the migration is applied, and could not observe whether it
-- escaped. It is the only part of this file that reads live state.
--
-- Expected before apply: no function, no index, 3 policies, 2 leads, 0
-- contacted, no rehearsal policy left behind, no client UPDATE grant.
-- ══════════════════════════════════════════════════════════════════════════

SELECT t.seq, CASE WHEN t.passed THEN 'PASS' ELSE 'FAIL' END AS result, t.check_name, t.detail
FROM (VALUES
  (1, 'G1 set_pass_lead_contacted() is NOT on the live database',
      coalesce(to_regprocedure('public.set_pass_lead_contacted(uuid,boolean)')::text, '(absent)'),
      to_regprocedure('public.set_pass_lead_contacted(uuid,boolean)') IS NULL),
  (2, 'G2 idx_pass_leads_created is NOT on the live database',
      (SELECT string_agg(indexname, ', ' ORDER BY indexname) FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'pass_leads'),
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'pass_leads'
          AND indexname = 'idx_pass_leads_created') = 0),
  (3, 'G3 pass_leads still has exactly 3 policies and no rehearsal one',
      (SELECT string_agg(policyname, ' | ' ORDER BY policyname) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pass_leads'),
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pass_leads') = 3
      AND (SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'pass_leads' AND policyname ILIKE 'reh %') = 0),
  (4, 'G4 no client role holds UPDATE on pass_leads',
      'authenticated=' || has_table_privilege('authenticated', 'public.pass_leads', 'UPDATE')::text
      || ' anon=' || has_table_privilege('anon', 'public.pass_leads', 'UPDATE')::text,
      NOT has_table_privilege('authenticated', 'public.pass_leads', 'UPDATE')
      AND NOT has_table_privilege('anon', 'public.pass_leads', 'UPDATE')),
  (5, 'G5 the lead rows are untouched: still 2, still 0 contacted',
      (SELECT count(*)::text || ' leads, ' || count(contacted_at)::text || ' contacted' FROM public.pass_leads),
      (SELECT count(*) = 2 AND count(contacted_at) = 0 FROM public.pass_leads))
) AS t(seq, check_name, detail, passed)
ORDER BY t.seq;

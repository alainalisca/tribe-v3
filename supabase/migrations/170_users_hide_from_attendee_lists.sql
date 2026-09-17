-- 170_users_hide_from_attendee_lists.sql
--
-- T-ATH1, tier groundwork: an athlete's opt-out from being listed as an
-- attendee to other athletes. Additive; nothing reads it yet.
--
-- THE COLUMN GOES ON public.users. There is no public.profiles table -- the
-- live database returns PGRST205 for it. The 104-column users table is the
-- profile table, and it currently has NO privacy or visibility flag of any
-- kind: no hide_*, no visibility, no private. This is the first.
--
-- 107 rows (94 not soft-deleted). NOT NULL DEFAULT false so no reader needs a
-- COALESCE and no row can be ambiguous; Postgres stores the default in the
-- catalog rather than rewriting the table for it.
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHY THERE ARE TWO STATEMENTS, AND WHY THE SECOND IS THE ONE THAT GETS
-- FORGOTTEN
--
-- public.users is under COLUMN-LEVEL SELECT grants. Migration 066 revoked the
-- table-level SELECT and re-granted it column by column, precisely so future
-- Tribe.OS billing columns would be invisible by default. The consequence is
-- that a column added afterwards is invisible to authenticated and anon until
-- it is granted explicitly -- and because PostgREST rejects the WHOLE request
-- when a select names an ungranted column, the first query naming it fails with
-- 42501 and takes its entire caller down with it.
--
-- This is not hypothetical. Migration 157 exists only because 156 added
-- onboarding_completed_at and dismissed_banners and granted neither, which
-- silently killed the first-run introduction, all five dismissible banners and
-- the What's New badge. 066's own header states the rule; it lived in a comment
-- and was missed.
--
-- ─────────────────────────────────────────────────────────────────────────
-- anon IS DELIBERATELY NOT GRANTED
--
-- Visibility tiers are authenticated-only by design: a tier is a function of
-- who is looking, and a logged-out visitor is nobody. Granting anon "just in
-- case" would widen the users surface for a reader that has no tier to compute.
-- If a logged-out surface ever needs this flag, that is a deliberate later
-- decision and its own migration -- the same shape as 157, which is a cost
-- worth paying to keep the default narrow.
--
-- ─────────────────────────────────────────────────────────────────────────
-- UPDATE IS A DIFFERENT REGIME, AND THIS MIGRATION ASSERTS IT RATHER THAN
-- ASSUMING IT
--
-- The 157 failure was a read grant. The mirror-image failure is a WRITE grant:
-- a settings toggle the user flips, that reports success and never persists.
-- updateUser (lib/dal/users.ts:238) already guards the reporting half -- it
-- selects back and returns no_rows_updated on a 0-row write rather than
-- claiming success -- but a missing column privilege would surface as an error
-- the settings screen has to handle, not as a saved value.
--
-- NO migration in this repo grants or revokes UPDATE on public.users at all.
-- 066, 067, 093, 113, 118, 156 and 157 all deal exclusively with SELECT. So
-- UPDATE is the Supabase default table-level grant to authenticated, which
-- covers columns added later automatically -- unlike SELECT. The browser-side
-- profile editor writing to users in production is the behavioural evidence
-- that the grant and the self-update RLS policy are both in place.
--
-- That reasoning is sound and it is still an inference, so the guard below
-- CHECKS it instead. has_column_privilege asks the capability question ("can
-- this role do it") rather than information_schema.column_privileges, which
-- asks whether a row happens to say so and cannot see table-level grants.
--
-- If the assertion fires, the remedy is one line and it is in the message --
-- but it is a deliberate decision about the users write surface, so this
-- migration raises and leaves it to a human rather than quietly granting.

-- ── 1. The column ──────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hide_from_attendee_lists boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.hide_from_attendee_lists IS
  'T-ATH1: when true, this athlete is not listed as an attendee to other '
  'athletes. Authenticated-only (no anon grant, migration 170). Does NOT hide '
  'the host of a session -- sessions.creator_id is public by construction.';

-- ── 2. The grant that 156 forgot ───────────────────────────────────────────
GRANT SELECT (hide_from_attendee_lists) ON public.users TO authenticated;

-- Intentionally absent, see the header:
--   GRANT SELECT (hide_from_attendee_lists) ON public.users TO anon;

-- ── 3. Assert the end state, rather than trusting the two statements above ──
DO $$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.users', 'hide_from_attendee_lists', 'SELECT') THEN
    RAISE EXCEPTION
      '170 ABORTED: authenticated cannot SELECT users.hide_from_attendee_lists. '
      'Every query naming this column would fail with 42501 and take its whole caller down (the 156/157 failure).';
  END IF;

  IF has_column_privilege('anon', 'public.users', 'hide_from_attendee_lists', 'SELECT') THEN
    RAISE EXCEPTION
      '170 ABORTED: anon can SELECT users.hide_from_attendee_lists, which this migration deliberately does not grant. '
      'Supabase re-grants anon by default on some object changes (the default-grant trap); '
      'add an explicit REVOKE SELECT (hide_from_attendee_lists) ON public.users FROM anon.';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.users', 'hide_from_attendee_lists', 'UPDATE') THEN
    RAISE EXCEPTION
      '170 ABORTED: authenticated cannot UPDATE users.hide_from_attendee_lists, so the settings toggle could never save. '
      'This contradicts the expectation that UPDATE on public.users is a table-level grant covering new columns. '
      'Decide deliberately, then add: GRANT UPDATE (hide_from_attendee_lists) ON public.users TO authenticated;';
  END IF;

  RAISE NOTICE '170: hide_from_attendee_lists added; authenticated has SELECT and UPDATE, anon has neither.';
END $$;

-- ── 4. Visible confirmation ────────────────────────────────────────────────
-- The assertions above RAISE on failure, which is loud. Success is not: the
-- Supabase SQL editor has no Notices panel, so a script ending in a DO block
-- reports only "success, no rows returned" and the RAISE NOTICE goes nowhere.
-- That was the lesson from applying 169 by hand -- the operator could not tell a
-- real apply from a silent no-op branch without running a separate query, and
-- "success, no rows returned" is also exactly what a wrong-target run prints.
--
-- So this migration ends by RETURNING ITS OWN END STATE AS ROWS. Read the table;
-- it is the confirmation. Do not infer success from silence.
SELECT 'hide_from_attendee_lists' AS column_name,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='users'
           AND column_name='hide_from_attendee_lists')                    AS column_present,
       has_column_privilege('authenticated','public.users','hide_from_attendee_lists','SELECT')
                                                                          AS authenticated_select,
       has_column_privilege('authenticated','public.users','hide_from_attendee_lists','UPDATE')
                                                                          AS authenticated_update,
       has_column_privilege('anon','public.users','hide_from_attendee_lists','SELECT')
                                                                          AS anon_select_must_be_false,
       (SELECT count(*) FROM public.users WHERE hide_from_attendee_lists)  AS rows_currently_true,
       (SELECT count(*) FROM public.users)                                 AS total_user_rows;

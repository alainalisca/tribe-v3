-- 187_athlete_setup.sql
--
-- An athlete must choose at least one sport, enforced WHERE IT IS SAVED.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS ACTUALLY WRONG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- There is no athlete onboarding wizard. app/onboarding/role/page.tsx asks one
-- question and then, for an athlete, does:
--
--     router.push(consumePendingReturnTo() ?? '/profile/edit');
--
-- /profile/edit is a free-form form where every field is optional. Sports and
-- photo are never ASKED FOR -- not optional-within-a-wizard, never asked.
--
-- Measured on 60 live athletes: 28 have neither sports nor photo, 6 lack
-- sports only, 4 lack photo only, 22 are complete. An athlete with no sports
-- is invisible to find_training_partners (which ranks group 1 entirely by
-- shared sports), contributes nothing to sport_demand_counts, and cannot match
-- in the smart-match cron. Nearly half the athlete population does not exist
-- to any discovery surface built this month.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE RPC EXISTS BECAUSE A DISABLED BUTTON IS NOT A REQUIREMENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Sports is required" enforced only by a greyed-out Continue button is the
-- same shape as checking an invite's recipient in validate_invite_token and
-- not in join_session: the UI declines to offer the action while the write
-- itself accepts it. Anyone calling the DAL directly, or a later screen
-- reusing updateUser, writes an empty array and nothing objects.
--
-- So the write goes through a function that REFUSES. complete_athlete_setup
-- raises on an empty or whitespace-only list, and that refusal is what the
-- requirement actually is.
--
-- IT DOES NOT VALIDATE AGAINST A CANONICAL SPORT LIST, deliberately.
-- lib/sports.ts is the single source of that vocabulary, and CLAUDE.md records
-- what happened when SPORTS_LIST was declared independently in five modules:
-- they drifted until an instructor who teaches Jiu-Jitsu could not tag it. A
-- copy of the list in SQL would be a sixth, and the one hardest to notice
-- drifting. The UI offers only canonical chips; this function requires only
-- that something was chosen.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ITS OWN COLUMN. onboarding_completed_at IS NOT REUSED.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- onboarding_completed_at means the first-run INTRO TOUR -- "finished OR
-- DISMISSED", per its own comment -- and migration 156 backfilled it to NOW()
-- for every account that existed then. It says nothing about what a user
-- filled in.
--
-- That ambiguity already cost us: a query reading it as "completed onboarding"
-- concluded 27 athletes had finished a wizard and left fields blank, when the
-- truth is there is no wizard and most of those timestamps are a backfill.
-- Giving one column a second meaning is how that happened; this migration does
-- not repeat it.
--
-- The comment on onboarding_completed_at is also sharpened below, so the next
-- person querying it reads what it means before drawing a conclusion from it.

-- ── 1. The column ──────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS athlete_setup_completed_at timestamptz;

COMMENT ON COLUMN public.users.athlete_setup_completed_at IS
  'When this athlete finished the one-screen sports step (migration 187). NULL '
  'means they have not. DISTINCT from onboarding_completed_at, which is the '
  'first-run intro TOUR and was backfilled for every pre-156 account.';

-- public.users is under COLUMN-LEVEL select grants (066/067): a new column is
-- invisible to authenticated until named, and PostgREST fails the WHOLE
-- request when a select mentions an ungranted column. That is migration 157's
-- outage exactly -- 156 added two columns, granted neither, and silently
-- killed the first-run introduction, five banners and the What's New badge.
GRANT SELECT (athlete_setup_completed_at) ON public.users TO authenticated;

-- ── 2. Sharpen the comment that misled a query ─────────────────────────────
COMMENT ON COLUMN public.users.onboarding_completed_at IS
  'THE FIRST-RUN INTRO TOUR, NOT PROFILE COMPLETENESS. Set when the athlete '
  'finished OR DISMISSED the walkthrough (dismissing counts as completing), '
  'and BACKFILLED TO NOW() BY MIGRATION 156 for every account existing on '
  '2026-09-09. It therefore says nothing about what a user filled in, and a '
  'non-NULL value does not mean they completed any form. For "did this athlete '
  'choose their sports", read athlete_setup_completed_at (migration 187).';

-- ── 3. The write that refuses ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_athlete_setup(p_sports text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clean text[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'complete_athlete_setup: authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Trim and drop blanks BEFORE judging emptiness. '{"", "  "}' is not a
  -- choice, and a check on array_length alone would accept it -- which is the
  -- form an empty selection takes when a client serialises untouched inputs.
  SELECT coalesce(array_agg(DISTINCT btrim(s)) FILTER (WHERE btrim(s) <> ''), '{}')
    INTO v_clean
    FROM unnest(coalesce(p_sports, '{}'::text[])) AS s;

  -- THE REQUIREMENT. Not a disabled button: a refusal at the write.
  IF coalesce(array_length(v_clean, 1), 0) = 0 THEN
    RAISE EXCEPTION
      'complete_athlete_setup: at least one sport is required. An athlete with '
      'no sports is invisible to partner matching, to demand counts and to the '
      'smart-match cron.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.users
     SET sports = v_clean,
         athlete_setup_completed_at = now()
   WHERE id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_athlete_setup: no user row for the caller';
  END IF;

  RETURN jsonb_build_object('success', true, 'sports', v_clean);
END;
$$;

-- Supabase grants EXECUTE on new functions to PUBLIC, which reaches anon
-- DIRECTLY; revoking from PUBLIC alone misses it (the T-SEC3 trap, four times).
REVOKE ALL ON FUNCTION public.complete_athlete_setup(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_athlete_setup(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_athlete_setup(text[]) TO authenticated;

-- ── 4. Guards ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src  text;
  v_auth boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p WHERE p.oid = 'public.complete_athlete_setup(text[])'::regprocedure;

  -- NON-VACUITY FIRST: every assertion below is true of an empty string.
  IF v_src IS NULL OR length(v_src) < 500 THEN
    RAISE EXCEPTION
      '187 ABORTED: could not read the function definition (% chars), so the '
      'checks below would pass vacuously.', coalesce(length(v_src), 0);
  END IF;

  -- The refusal IS the requirement. Without it this is a column with a nice
  -- comment and a button that can be bypassed by anyone calling the DAL.
  IF v_src !~ 'at least one sport is required' THEN
    RAISE EXCEPTION
      '187 ABORTED: the function does not refuse an empty sports list. A '
      'requirement enforced only by a disabled button is not enforced.';
  END IF;

  -- Blanks must be stripped before the emptiness test, or '{""}' passes.
  IF v_src !~ 'btrim' THEN
    RAISE EXCEPTION
      '187 ABORTED: the function does not trim before judging emptiness, so a '
      'list of blank strings would count as a choice.';
  END IF;

  -- It must NOT touch onboarding_completed_at. That column means the intro
  -- tour and was backfilled; a second meaning is what misled a query already.
  IF v_src ~ 'onboarding_completed_at' THEN
    RAISE EXCEPTION
      '187 ABORTED: the function writes onboarding_completed_at. That column is '
      'the intro tour, backfilled by 156. Use athlete_setup_completed_at.';
  END IF;

  v_auth := has_column_privilege('authenticated', 'public.users',
                                 'athlete_setup_completed_at', 'SELECT');
  IF NOT v_auth THEN
    RAISE EXCEPTION
      '187 ABORTED: authenticated cannot SELECT users.athlete_setup_completed_at. '
      'public.users is under column-level grants (066/067) and PostgREST fails '
      'the WHOLE request when a select names an ungranted column -- migration '
      '157 exists because 156 skipped exactly this.';
  END IF;

  IF has_function_privilege('anon', 'public.complete_athlete_setup(text[])', 'EXECUTE') THEN
    RAISE EXCEPTION '187 ABORTED: anon holds EXECUTE on complete_athlete_setup.';
  END IF;

  RAISE NOTICE '187: athlete setup column and refusing write created.';
END $$;

-- ── 5. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('187_athlete_setup', 'sports required at the WRITE; own column, onboarding_completed_at untouched')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name='athlete_setup_completed_at')                       AS new_column_type,
  has_column_privilege('authenticated','public.users','athlete_setup_completed_at','SELECT')
                                                                          AS authenticated_can_read_ok,
  (SELECT pg_get_functiondef(p.oid) ~ 'at least one sport is required' FROM pg_proc p
    WHERE p.oid = 'public.complete_athlete_setup(text[])'::regprocedure)  AS refuses_empty_ok,
  (SELECT pg_get_functiondef(p.oid) !~ 'onboarding_completed_at' FROM pg_proc p
    WHERE p.oid = 'public.complete_athlete_setup(text[])'::regprocedure)  AS leaves_tour_column_alone_ok,
  (NOT has_function_privilege('anon','public.complete_athlete_setup(text[])','EXECUTE'))
                                                                          AS anon_cannot_execute_ok,
  -- The population this exists for, so the size is on the record.
  (SELECT count(*) FROM public.users
    WHERE deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE
      AND is_instructor IS NOT TRUE
      AND coalesce(array_length(sports, 1), 0) = 0)                       AS athletes_with_no_sports;

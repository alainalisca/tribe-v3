-- 165_protect_verified_instructor_raises.sql
--
-- Fixes public.protect_verified_instructor(), the BEFORE UPDATE trigger on
-- public.users that guards is_verified_instructor, total_earnings_cents and
-- total_participants_served.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  THE LIVE DEFECT, AND THE ANSWER TO THE QUESTION IT RAISED               ║
-- ║                                                                          ║
-- ║  The is_verified_instructor branch is missing the `auth.uid() IS NOT     ║
-- ║  NULL AND` clause that the other two branches have. With auth.uid()      ║
-- ║  NULL the subquery returns NULL, COALESCE makes it false, NOT false is   ║
-- ║  true -- so the branch REVERTS. That blocks the service role and every   ║
-- ║  SQL-editor session, which is the only way this column has ever been     ║
-- ║  set, and it does it SILENTLY: the caller gets a successful UPDATE with  ║
-- ║  the write discarded.                                                    ║
-- ║                                                                          ║
-- ║  MEASURED 2026-09-14 with the anon key, three consecutive agreeing       ║
-- ║  reads, taken after the API settled (mid-migration readings were         ║
-- ║  discarded -- 502s while PostgREST reloaded):                           ║
-- ║                                                                          ║
-- ║      is_verified_instructor = true   ->  0 rows                          ║
-- ║      is_verified_instructor = false  -> 97 rows                          ║
-- ║      is_verified_instructor IS NULL  ->  0 rows                          ║
-- ║      (97 users total, 24 with is_instructor = true)                      ║
-- ║                                                                          ║
-- ║  ZERO. So it is the second case, not the first: NOBODY HAS EVER          ║
-- ║  SUCCESSFULLY VERIFIED AN INSTRUCTOR, and the verified badge has never   ║
-- ║  rendered for anyone. Every surface that reads it -- the storefront      ║
-- ║  header, the instructor directory's sort order                           ║
-- ║  (lib/dal/instructors.ts:179), the spotlight filter                      ║
-- ║  (lib/dal/spotlight.ts:164), the feed's author badge -- has been         ║
-- ║  rendering the false branch since the trigger was created.               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- THREE CHANGES, NOTHING ELSE. The body below is the live definition from
-- pg_get_functiondef against production, with only these edits:
--
--   a. `auth.uid() IS NOT NULL AND` added to the is_verified_instructor
--      branch, so all three branches now read identically.
--
--   b. All three silent reverts become RAISE, matching users_is_admin_guard
--      and users_banned_guard. A non-admin now gets an error instead of a 200
--      with the write thrown away. Safe: nothing in the repository writes any
--      of these three columns -- verified across app/, components/, lib/,
--      scripts/ and supabase/, where every occurrence is a SELECT list, one
--      .order() and one .eq() filter -- so no existing path can start failing.
--      Each branch still fires only on IS DISTINCT FROM, so a write that does
--      not change the value is untouched.
--
--   c. SET search_path TO 'public' is stated explicitly in the definition.
--      164 already pinned it with ALTER FUNCTION, but CREATE OR REPLACE
--      REPLACES the whole definition including its config -- so omitting it
--      here would silently UNPIN it again. Stating it makes the order of
--      application irrelevant, and the guard asserts proconfig either way.
--
-- WHAT THIS DOES NOT DO: it does not verify anybody. After this lands, setting
-- is_verified_instructor still has no UI and no code path; it is a SQL-editor
-- or service-role write, which is now possible where before it was silently
-- discarded. Building the actual verification flow is a separate ticket.

CREATE OR REPLACE FUNCTION public.protect_verified_instructor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_verified_instructor IS DISTINCT FROM OLD.is_verified_instructor THEN
    -- THE FIX: this branch used to omit the non-null caller test below,
    -- which is why a NULL-caller write was reverted instead of allowed.
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'is_verified_instructor can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.total_earnings_cents IS DISTINCT FROM OLD.total_earnings_cents THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'total_earnings_cents can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.total_participants_served IS DISTINCT FROM OLD.total_participants_served THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'total_participants_served can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.protect_verified_instructor() IS
  'BEFORE UPDATE guard on public.users for is_verified_instructor, '
  'total_earnings_cents and total_participants_served. RAISEs for a non-admin '
  'caller; a NULL auth.uid() (service role, SQL editor) passes, which is what '
  '165 fixed -- the is_verified_instructor branch used to revert silently for '
  'everyone including the service role. Each branch fires only on '
  'IS DISTINCT FROM, so an unchanged value is never blocked.';

-- ══════════════════════════════════════════════════════════════════════════
-- GUARD. Assert the outcome rather than trusting the statement.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  src  TEXT;
  cfg  TEXT;
  n    INT;
BEGIN
  SELECT pg_get_functiondef(p.oid),
         (SELECT c FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%')
  INTO src, cfg
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'protect_verified_instructor';

  IF src IS NULL THEN
    RAISE EXCEPTION '165 guard: protect_verified_instructor does not exist';
  END IF;

  -- (c) still pinned after CREATE OR REPLACE replaced the definition
  IF cfg IS NULL THEN
    RAISE EXCEPTION '165 guard: protect_verified_instructor lost its pinned '
                    'search_path -- CREATE OR REPLACE dropped 164''s ALTER';
  END IF;

  -- (b) no silent revert survives anywhere in the body
  IF src ~ 'NEW\.(is_verified_instructor|total_earnings_cents|total_participants_served)\s*:=' THEN
    RAISE EXCEPTION '165 guard: a silent revert (NEW.x := OLD.x) is still in the body';
  END IF;

  -- (a) all three branches guard on a non-null auth.uid().
  --
  -- Anchored on the whole IF condition, not on the phrase alone. The first
  -- version of this guard counted `auth.uid() IS NOT NULL AND` and found FOUR
  -- matches, because a COMMENT inside the body quoted the phrase while
  -- explaining the fix. A guard that matches prose is the CLAUDE.md
  -- name-detector failure in its purest form -- caught here by the guard
  -- failing on its own author's comment.
  SELECT count(*) INTO n
  FROM regexp_matches(src, 'IF auth\.uid\(\) IS NOT NULL AND NOT COALESCE', 'g');
  IF n <> 3 THEN
    RAISE EXCEPTION '165 guard: expected 3 non-null-caller branches, found %', n;
  END IF;

  -- and all three raise, one per guarded column
  SELECT count(*) INTO n FROM regexp_matches(src, 'RAISE EXCEPTION ''[a-z_]+ can only be changed by an admin''', 'g');
  IF n <> 3 THEN
    RAISE EXCEPTION '165 guard: expected 3 RAISE branches, found %', n;
  END IF;

  -- still SECURITY DEFINER, or it cannot read users.is_admin at all
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'protect_verified_instructor' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION '165 guard: protect_verified_instructor is no longer SECURITY DEFINER';
  END IF;

  -- the trigger is still attached and enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE c.relname = 'users'
      AND c.relnamespace = 'public'::regnamespace
      AND p.proname = 'protect_verified_instructor'
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION '165 guard: the protect_verified_instructor trigger is '
                    'missing or disabled on public.users';
  END IF;
END $$;

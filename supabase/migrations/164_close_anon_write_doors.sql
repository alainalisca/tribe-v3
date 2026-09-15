-- 164_close_anon_write_doors.sql
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  LIVE HOLE: anon can INSERT arbitrary rows into public.users.             ║
-- ║                                                                          ║
-- ║  The drift probe (2026-09-14) found:                                      ║
-- ║    has_table_privilege('anon','public.users','INSERT') = true             ║
-- ║    all 100 columns INSERT-granted, NOT_granted empty                      ║
-- ║    policy "Users can insert own profile" :: INSERT :: {public}            ║
-- ║                                         :: WITH CHECK true                ║
-- ║    every trigger on users is BEFORE/AFTER *UPDATE* -- nothing guards      ║
-- ║    INSERT at all (users_is_admin_guard, users_banned_guard,               ║
-- ║    protect_verified_instructor, users_is_admin_audit are all UPDATE).     ║
-- ║                                                                          ║
-- ║  A request carrying only the anon key -- which ships in the client        ║
-- ║  bundle -- can create a users row with is_instructor = true and any name, ║
-- ║  bio and avatar it likes. That row appears in the public instructor       ║
-- ║  directory and in users_discoverable. Fake coaches, any volume, no        ║
-- ║  account required.                                                       ║
-- ║                                                                          ║
-- ║  WHAT THIS IS NOT: privilege escalation. auth.users is a separate table   ║
-- ║  and nobody can authenticate as a row they invented. This is             ║
-- ║  impersonation and spam, not admin takeover.                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- THE WORKED EXAMPLE WE ARE COPYING: public.sessions is already correct.
-- The probe confirms table-level INSERT and UPDATE are false for
-- `authenticated`, with exactly 50 column grants each, excluding partner_id,
-- partner_status and partner_reviewed_at. 158 and 162 did precisely what their
-- headers said. This migration brings the anon side of users and sessions up to
-- the same standard.
--
-- SCOPE. This migration does NOT touch the UPDATE allowlist on public.users.
-- That needs the 46-column browser-write list and goes in 165, after this lands
-- and after signup is confirmed working on a device.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. anon loses INSERT on public.users
-- ══════════════════════════════════════════════════════════════════════════
--
-- PROVEN BEFORE WRITING THIS, not assumed -- no client path inserts into
-- public.users as anon:
--
--   * app/api/auth/signup/route.ts calls auth.signUp() ONLY. It never touches
--     public.users. The public row is created by the handle_new_user trigger on
--     auth.users, which is SECURITY DEFINER and runs as its owner.
--   * upsertUserProfile (lib/auth-helpers.ts:49 -> lib/dal/users.ts:304) is the
--     only other writer, and every call site runs it AFTER a session exists:
--       app/auth/useAuthHandlers.ts:111  after signInWithIdToken() succeeded
--       app/auth/useAuthHandlers.ts:326  after verifyOtp() succeeded
--       app/auth/callback/page.tsx:90    in the OAuth callback, post-session
--     So that upsert runs as `authenticated`, which keeps its INSERT.
--
-- If signup breaks after this, nobody can register, so this is the claim to
-- re-verify on a device first: create a brand-new account in an incognito
-- window and confirm the profile row appears.
-- REVISED 2026-09-14, and this is why 164 applied as nothing the first time.
-- Guard 5a below asserts anon holds NO write privilege on users: INSERT,
-- UPDATE *and* DELETE. This statement revoked only INSERT. On a database
-- still carrying Supabase's default broad grant to anon -- and it is, because
-- anon was measured holding UPDATE and DELETE on public.sessions on
-- 2026-09-14 -- guard 5a raises, and the SQL editor rolls the whole script
-- back. Sections 1-5 then leave no trace, which is exactly what was measured.
-- REVOKE of a privilege the role does not hold is a no-op, never an error,
-- so widening is safe whatever the live state turns out to be.
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. The INSERT policy stops accepting anything
-- ══════════════════════════════════════════════════════════════════════════
--
-- WITH CHECK true means "any row". Even with anon revoked, this lets any
-- authenticated user insert a row for somebody else's id.
--
-- Enumerate before replacing, per the 159/160 lesson: DROP POLICY IF EXISTS is
-- SILENT when the name does not match, so a replacement aimed at a name that is
-- not the live name leaves the original in place and looks like it worked. The
-- name below is the one the 2026-09-14 probe reported.
DO $$
DECLARE live TEXT;
BEGIN
  SELECT string_agg(policyname || ' [with_check=' || coalesce(with_check, 'NULL') || ']',
                    E'\n  ' ORDER BY policyname)
  INTO live
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT';

  RAISE NOTICE E'INSERT policies on public.users before this migration:\n  %',
    coalesce(live, '(none)');
END $$;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ══════════════════════════════════════════════════════════════════════════
-- 3. anon loses INSERT, UPDATE and DELETE on public.sessions
-- ══════════════════════════════════════════════════════════════════════════
--
-- anon holds all three at table level today. They are blocked only because
-- every sessions policy requires auth.uid(), which is NULL for anon -- so RLS
-- is the single thing holding that door, and one `USING (true)` policy away
-- from the users bug. Nothing legitimate uses them: anon reads sessions through
-- public.sessions_public (140), and the guest-join paths are SECURITY DEFINER
-- RPCs (128) that run as their owner.
REVOKE INSERT, UPDATE, DELETE ON public.sessions FROM anon;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Pin search_path on every unpinned SECURITY DEFINER function
-- ══════════════════════════════════════════════════════════════════════════
--
-- A SECURITY DEFINER function without SET search_path resolves its names
-- against the CALLER's search_path.
--
-- is_app_admin() is the urgent one and SEC-14 understated it. The probe shows
-- it is the entire gate for roughly ten live RLS policies: featured_partners
-- (an ALL policy for role {public}), community_bulletin, community_news,
-- local_fitness_events, tribe_os_waitlist, reported_messages and
-- session_recap_photos.
--
-- Done as a loop over pg_proc rather than four ALTER statements with typed
-- signatures, because these functions exist in NO migration in this repository
-- -- they were applied by hand -- so their exact signatures are not knowable
-- from version control. The loop also covers every overload and is idempotent.
DO $$
DECLARE
  fn RECORD;
  n  INT := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname IN ('is_app_admin',
                        'protect_verified_instructor',
                        'set_payment_status_on_join',
                        'update_instructor_stats')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO %L', fn.sig, 'public');
    RAISE NOTICE 'pinned search_path on %', fn.sig;
    n := n + 1;
  END LOOP;

  RAISE NOTICE '% function(s) pinned', n;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. GUARDS. Assert the outcome; do not trust the statements above.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  bad      TEXT;
  n_pinned INT;
BEGIN
  -- 5a. anon can no longer write users or sessions.
  --     has_table_privilege, never information_schema.table_privileges: that
  --     view cannot see table-level grants and passes either way.
  SELECT string_agg(t.tbl || '.' || t.priv, ', ' ORDER BY t.tbl, t.priv)
  INTO bad
  FROM (VALUES ('users','INSERT'), ('users','UPDATE'), ('users','DELETE'),
               ('sessions','INSERT'), ('sessions','UPDATE'), ('sessions','DELETE')) t(tbl, priv)
  WHERE has_table_privilege('anon', ('public.' || t.tbl)::regclass, t.priv);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '164 guard: anon still holds write privileges: %', bad;
  END IF;

  -- 5b. The anon read path survives. REWRITTEN 2026-09-14 -- the original
  --     asserted anon holds SELECT on public.sessions, aborted the migration,
  --     and was simply wrong about this database. MEASURED on production:
  --       anon SELECT on public.sessions       : false
  --       anon column-level SELECTs on sessions: 0
  --       public.sessions_public exists        : true
  --       anon SELECT on sessions_public       : true
  --     anon reads sessions through public.sessions_public (140), an
  --     owner-executed view, exactly as designed. The base-table SELECT was
  --     never anon's to lose.
  --
  --     LABEL, honestly: this is a PRECONDITION, not an outcome of 164.
  --     Nothing in this migration touches sessions_public, and because the
  --     view is owner-executed it does not depend on anon's base-table grants
  --     either. It is kept as forward insurance against a later edit widening
  --     a REVOKE onto the view, and it is safe to keep ONLY because both
  --     halves were measured true on 2026-09-14.
  IF to_regclass('public.sessions_public') IS NULL THEN
    RAISE EXCEPTION '164 guard 5b: public.sessions_public is missing -- that '
                    'view is the anon read path for sessions (140)';
  END IF;
  IF NOT has_table_privilege('anon', 'public.sessions_public'::regclass, 'SELECT') THEN
    RAISE EXCEPTION '164 guard 5b: anon lost SELECT on public.sessions_public '
                    '-- the anon read path for sessions is broken';
  END IF;

  -- 5c. authenticated keeps INSERT on users, or signup dies.
  --     LABEL: a PRECONDITION that 164 could plausibly break. This migration
  --     issues REVOKEs against public.users, so a mis-edit of section 1 (FROM
  --     anon -> FROM anon, authenticated) would remove it and kill every
  --     signup silently. Kept for that reason. NOT measured on production as
  --     of 2026-09-14 -- run the pre-flight before this migration, because a
  --     false value here aborts the whole script and is NOT caused by 164.
  IF NOT has_table_privilege('authenticated', 'public.users'::regclass, 'INSERT') THEN
    RAISE EXCEPTION '164 guard: authenticated lost INSERT on users -- '
                    'upsertUserProfile runs post-session and needs it';
  END IF;

  -- 5d. No INSERT policy on users accepts an arbitrary row any more.
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT'
    AND (with_check IS NULL OR btrim(with_check) = 'true');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '164 guard: INSERT policy on users still accepts any row: %', bad;
  END IF;

  -- 5e. Exactly the intended INSERT policy exists, and it is scoped to the
  --     caller's own id. Catches a hand-applied duplicate surviving the DROP
  --     under a different name -- the featured_partners fifth-policy shape.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT'
      AND with_check LIKE '%auth.uid()%' AND with_check LIKE '%id%'
  ) THEN
    RAISE EXCEPTION '164 guard: no self-scoped INSERT policy on users';
  END IF;

  -- 5f. The four functions are pinned. POSITIVE assertion against an expected
  --     count, not an emptiness check. REVISED 2026-09-14: the original
  --     asserted that the set of UNPINNED functions was empty, and that is
  --     silent in three different worlds -- "I pinned them", "they were
  --     already pinned", and "the loop never ran". It cannot tell them apart.
  --     The loop's counter was the only thing that could, and it was emitted
  --     on RAISE NOTICE, which the Supabase SQL editor discards entirely.
  SELECT count(*)
  INTO n_pinned
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosecdef
    AND p.proname IN ('is_app_admin', 'protect_verified_instructor',
                      'set_payment_status_on_join', 'update_instructor_stats')
    AND EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
      WHERE cfg = 'search_path=public'
    );
  IF n_pinned <> 4 THEN
    SELECT string_agg(
             p.proname || '=' ||
             coalesce((SELECT c FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
                        WHERE c LIKE 'search_path=%'), 'NULL'),
             ', ' ORDER BY p.proname)
    INTO bad
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('is_app_admin', 'protect_verified_instructor',
                        'set_payment_status_on_join', 'update_instructor_stats');
    RAISE EXCEPTION '164 guard 5f: expected 4 functions pinned to '
                    'search_path=public, found %. Live state: %',
                    n_pinned, coalesce(bad, '(no such functions)');
  END IF;

END $$;

COMMENT ON TABLE public.users IS
  'Public profile rows. anon has NO write privilege (164). authenticated keeps '
  'INSERT for upsertUserProfile, which runs only after a session exists, and '
  'the INSERT policy is scoped to auth.uid() = id. Table-level UPDATE is still '
  'wide open to authenticated across all 100 columns -- that is 165.';

-- ══════════════════════════════════════════════════════════════════════════
-- 6. POST-STATE. A result set, not a notice.
-- ══════════════════════════════════════════════════════════════════════════
--
-- The guards above abort on failure; this returns the evidence on success, in
-- the one channel the Supabase SQL editor actually displays. Paste the whole
-- grid back. Every row must read PASS.
WITH post_state(sort, check_name, actual, expected) AS (
  VALUES
    -- OUTCOMES of section 1
    (1, 'anon INSERT on public.users',
        has_table_privilege('anon', 'public.users'::regclass, 'INSERT')::text, 'false'),
    (2, 'anon UPDATE on public.users',
        has_table_privilege('anon', 'public.users'::regclass, 'UPDATE')::text, 'false'),
    (3, 'anon DELETE on public.users',
        has_table_privilege('anon', 'public.users'::regclass, 'DELETE')::text, 'false'),
    -- OUTCOMES of section 3
    (4, 'anon INSERT on public.sessions',
        has_table_privilege('anon', 'public.sessions'::regclass, 'INSERT')::text, 'false'),
    (5, 'anon UPDATE on public.sessions',
        has_table_privilege('anon', 'public.sessions'::regclass, 'UPDATE')::text, 'false'),
    (6, 'anon DELETE on public.sessions',
        has_table_privilege('anon', 'public.sessions'::regclass, 'DELETE')::text, 'false'),
    -- The read path. Row 7 records that anon has NO base-table SELECT and is
    -- not supposed to; row 8 is the privilege that actually carries anon reads.
    (7, 'anon SELECT on public.sessions (base table -- never held)',
        has_table_privilege('anon', 'public.sessions'::regclass, 'SELECT')::text, 'false'),
    (8, 'anon SELECT on public.sessions_public (THE anon read path)',
        (SELECT CASE WHEN to_regclass('public.sessions_public') IS NULL THEN 'MISSING'
                ELSE has_table_privilege('anon', 'public.sessions_public'::regclass,
                                         'SELECT')::text END), 'true'),
    -- PRECONDITIONS. Reported, never asserted here. 164 establishes neither.
    (9, 'PRECONDITION authenticated INSERT on public.users (signup)',
        has_table_privilege('authenticated', 'public.users'::regclass, 'INSERT')::text, 'true'),
    (10, 'PRECONDITION handle_new_user is SECURITY DEFINER (was guard 5g)',
        (SELECT coalesce((SELECT p.prosecdef::text FROM pg_proc p
                           WHERE p.proname = 'handle_new_user' LIMIT 1), 'MISSING')), 'true'),
    -- OUTCOME of section 2
    (11, 'INSERT policies on public.users',
        (SELECT coalesce(string_agg(policyname || ' [' || array_to_string(roles, ',') || '] '
                                    || coalesce(with_check, 'NULL'), ' | ' ORDER BY policyname),
                         '(none)')
           FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT'),
        'Users can insert own profile [authenticated] (auth.uid() = id)'),
    -- OUTCOME of section 4 (protect_verified_instructor was pinned by 165)
    (12, 'SECURITY DEFINER functions pinned to search_path=public',
        (SELECT count(*)::text FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
            AND p.proname IN ('is_app_admin', 'protect_verified_instructor',
                              'set_payment_status_on_join', 'update_instructor_stats')
            AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                         WHERE cfg = 'search_path=public')),
        '4'),
    (13, 'per-function proconfig',
        (SELECT string_agg(p.proname || '=' ||
                  coalesce((SELECT c FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
                             WHERE c LIKE 'search_path=%'), 'NULL'), ' | ' ORDER BY p.proname)
           FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace
            AND p.proname IN ('is_app_admin', 'protect_verified_instructor',
                              'set_payment_status_on_join', 'update_instructor_stats')),
        'is_app_admin=search_path=public | protect_verified_instructor=search_path=public'
        ' | set_payment_status_on_join=search_path=public'
        ' | update_instructor_stats=search_path=public')
)
SELECT check_name,
       actual,
       expected,
       CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM post_state
ORDER BY sort;

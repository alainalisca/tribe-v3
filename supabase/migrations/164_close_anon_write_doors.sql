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
REVOKE INSERT ON public.users FROM anon;

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
  bad TEXT;
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

  -- 5b. anon keeps SELECT on sessions. 140 made sessions_public the anon read
  --     path, but revoking the base-table SELECT is NOT this migration's job
  --     and an over-broad REVOKE here would be a silent outage.
  IF NOT has_table_privilege('anon', 'public.sessions'::regclass, 'SELECT') THEN
    RAISE EXCEPTION '164 guard: anon lost SELECT on sessions -- this migration '
                    'only revokes writes';
  END IF;

  -- 5c. authenticated keeps INSERT on users, or signup dies.
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

  -- 5f. The four functions are pinned.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
  INTO bad
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosecdef
    AND p.proname IN ('is_app_admin', 'protect_verified_instructor',
                      'set_payment_status_on_join', 'update_instructor_stats')
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
      WHERE cfg LIKE 'search_path=%'
    );
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '164 guard: SECURITY DEFINER function(s) still unpinned: %', bad;
  END IF;

  -- 5g. handle_new_user survives. It is the only thing creating a public.users
  --     row at signup now, so its properties are asserted rather than assumed.
  --     SECURITY DEFINER means it runs as its owner and is unaffected by the
  --     anon revoke above; this fails loudly if that ever stops being true.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'handle_new_user' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION '164 guard: handle_new_user is missing or is no longer '
                    'SECURITY DEFINER -- signup creates no profile row';
  END IF;
END $$;

COMMENT ON TABLE public.users IS
  'Public profile rows. anon has NO write privilege (164). authenticated keeps '
  'INSERT for upsertUserProfile, which runs only after a session exists, and '
  'the INSERT policy is scoped to auth.uid() = id. Table-level UPDATE is still '
  'wide open to authenticated across all 100 columns -- that is 165.';

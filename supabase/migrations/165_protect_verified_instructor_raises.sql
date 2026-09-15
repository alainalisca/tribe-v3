-- 165_protect_verified_instructor_raises.sql
--
-- One change of behaviour, on ONE of the three columns public.
-- protect_verified_instructor() guards. The other two are deliberately left
-- exactly as they are, and the reason is the longest comment in this file
-- because it is the part someone will want to "fix" later.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  (a) is_verified_instructor -- FIXED                                     ║
-- ║                                                                          ║
-- ║  The branch was missing the `auth.uid() IS NOT NULL AND` clause the      ║
-- ║  other two have. With auth.uid() NULL the subquery returns NULL,         ║
-- ║  COALESCE makes it false, NOT false is true -- so it REVERTED, silently, ║
-- ║  for the service role and for every SQL-editor session. Those are the    ║
-- ║  only ways this column has ever been writable.                           ║
-- ║                                                                          ║
-- ║  MEASURED 2026-09-14, anon key, three consecutive agreeing reads taken   ║
-- ║  after the API settled (mid-migration 502s were discarded):              ║
-- ║      is_verified_instructor = true   ->   0 rows                         ║
-- ║      is_verified_instructor = false  ->  97 rows                         ║
-- ║      is_verified_instructor IS NULL  ->   0 rows                         ║
-- ║                                                                          ║
-- ║  ZERO of 97. NOBODY HAS EVER SUCCESSFULLY VERIFIED AN INSTRUCTOR and the ║
-- ║  verified badge has never rendered for anyone -- not on the storefront   ║
-- ║  header, not in the directory sort (lib/dal/instructors.ts:179), not in  ║
-- ║  the spotlight filter (lib/dal/spotlight.ts:164), not on the feed.       ║
-- ║                                                                          ║
-- ║  It now RAISEs for a non-admin instead of reverting, matching            ║
-- ║  users_is_admin_guard and users_banned_guard. Safe: nothing in the       ║
-- ║  repository writes this column -- checked across app/, components/,      ║
-- ║  lib/, scripts/ and supabase/, where every occurrence is a SELECT list,  ║
-- ║  one .order() and one .eq() -- so no existing path can start failing.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  (b) total_earnings_cents and total_participants_served -- UNCHANGED     ║
-- ║                                                                          ║
-- ║  DO NOT UNFREEZE THESE. Not with a RAISE, not with a pg_trigger_depth()  ║
-- ║  exemption, not by dropping the branch. Read this before you try.        ║
-- ║                                                                          ║
-- ║  They are frozen today: the silent revert eats every non-admin write,    ║
-- ║  and update_instructor_stats fires from an instructor's own action, so   ║
-- ║  auth.uid() is not null and the recompute is discarded. Measured:        ║
-- ║                                                                          ║
-- ║      instructor           is_admin   counter   confirmed joins           ║
-- ║      Darian                  true          6                34           ║
-- ║      Alexandra Aguirre      false          0                13           ║
-- ║      Caroline Vanegas       false          0                11           ║
-- ║                                                                          ║
-- ║  Darian is the only admin in the database. total_sessions_hosted, which  ║
-- ║  this trigger does NOT guard, moves correctly for everyone.              ║
-- ║                                                                          ║
-- ║  THE REASON TO LEAVE THEM FROZEN is not caution, it is that the write    ║
-- ║  they are blocking is WRONG:                                             ║
-- ║                                                                          ║
-- ║    * update_instructor_stats fires on ANY sessions status change and     ║
-- ║      does total_participants_served + participant_count. Cancelling a    ║
-- ║      session INCREMENTS it, and any status round-trip increments it      ║
-- ║      again.                                                              ║
-- ║    * on_payment_approved separately does total_participants_served + 1   ║
-- ║      on the SAME column with different semantics.                        ║
-- ║                                                                          ║
-- ║  Two triggers double-incrementing one column, one of them counting the   ║
-- ║  wrong event, with all history missing and a base of zero. Unfreezing    ║
-- ║  starts it ACCUMULATING GARBAGE. Frozen is visibly broken; wrong-and-    ║
-- ║  moving looks like it works, which is strictly worse.                    ║
-- ║                                                                          ║
-- ║  THE CONDITION FOR UNFREEZING, and it is a rebuild, not a flag:          ║
-- ║  the counters must be RECOMPUTED from session_participants rather than   ║
-- ║  incremented, by ONE owner rather than two, on a real completion rather  ║
-- ║  than any status change. Until that exists, unfreezing produces a moving ║
-- ║  wrong number. Tracked as COUNTER-01; DRIFT-03 records the measurement.  ║
-- ║                                                                          ║
-- ║  A pg_trigger_depth() > 1 exemption WAS built and validated against a    ║
-- ║  stub -- it works, it correctly distinguishes trigger-originated from    ║
-- ║  client-originated writes, and it does not leak onto the branch above.   ║
-- ║  It was rejected anyway, because a correct mechanism pointed at a broken ║
-- ║  computation just makes the wrong number move faster.                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- (c) SET search_path TO 'public' is stated explicitly below. 164 pinned it
--     with ALTER FUNCTION, but CREATE OR REPLACE replaces the WHOLE definition
--     including its config -- so omitting it here would silently unpin it
--     again. Stating it makes the order of application irrelevant, and the
--     guard asserts proconfig either way.
--
-- The body below is the live definition from pg_get_functiondef against
-- production, with only the (a) and (c) edits applied.

CREATE OR REPLACE FUNCTION public.protect_verified_instructor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CHANGED: the non-null caller test below was missing from this branch, and
  -- the revert became a RAISE.
  IF NEW.is_verified_instructor IS DISTINCT FROM OLD.is_verified_instructor THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      RAISE EXCEPTION 'is_verified_instructor can only be changed by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- UNCHANGED, deliberately. See the second box above before touching this.
  IF NEW.total_earnings_cents IS DISTINCT FROM OLD.total_earnings_cents THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      NEW.total_earnings_cents := OLD.total_earnings_cents;
    END IF;
  END IF;

  -- UNCHANGED, deliberately. See the second box above before touching this.
  IF NEW.total_participants_served IS DISTINCT FROM OLD.total_participants_served THEN
    IF auth.uid() IS NOT NULL AND NOT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) THEN
      NEW.total_participants_served := OLD.total_participants_served;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.protect_verified_instructor() IS
  'BEFORE UPDATE guard on public.users. is_verified_instructor RAISEs for a '
  'non-admin caller (165). total_earnings_cents and total_participants_served '
  'keep the SILENT REVERT on purpose: two triggers double-increment them with '
  'different semantics and one counts the wrong event, so unfreezing them '
  'would produce a moving wrong number instead of a visibly stuck one. They '
  'cannot be unfrozen until they are recomputed rather than incremented, by '
  'one owner, on a real completion -- COUNTER-01. A NULL auth.uid() (service '
  'role, SQL editor) passes every branch.';

-- ══════════════════════════════════════════════════════════════════════════
-- GUARD. Assert the outcome, and assert what was deliberately NOT done.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  src TEXT;
  cfg TEXT;
  n   INT;
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
    RAISE EXCEPTION '165 guard: lost the pinned search_path -- CREATE OR '
                    'REPLACE dropped 164''s ALTER FUNCTION';
  END IF;

  -- (a) the claim column raises, and no longer reverts.
  --     Anchored on the full statement, not on a phrase: an earlier version of
  --     this guard counted the bare string `auth.uid() IS NOT NULL AND` and
  --     matched a COMMENT in the body that quoted it. CLAUDE.md: assert on
  --     structure, never on an identifier or prose.
  IF src ~ 'NEW\.is_verified_instructor\s*:=' THEN
    RAISE EXCEPTION '165 guard: is_verified_instructor still reverts silently';
  END IF;
  SELECT count(*) INTO n
  FROM regexp_matches(src, 'RAISE EXCEPTION ''is_verified_instructor can only be changed by an admin''', 'g');
  IF n <> 1 THEN
    RAISE EXCEPTION '165 guard: expected exactly 1 RAISE on is_verified_instructor, found %', n;
  END IF;

  -- (b) the two counters STILL revert. This guard exists to catch a future
  --     well-meaning unfreeze that skips the box above.
  SELECT count(*) INTO n
  FROM regexp_matches(src, 'NEW\.(total_earnings_cents|total_participants_served)\s*:=', 'g');
  IF n <> 2 THEN
    RAISE EXCEPTION '165 guard: expected the 2 counter reverts to remain, found % -- '
                    'read the second box in this migration before unfreezing them', n;
  END IF;
  IF src ~ 'RAISE EXCEPTION ''total_' THEN
    RAISE EXCEPTION '165 guard: a counter column now RAISEs. A thrown error on a '
                    'derived counter breaks the user action that was maintaining it';
  END IF;
  IF src ~ 'pg_trigger_depth' THEN
    RAISE EXCEPTION '165 guard: a pg_trigger_depth exemption was added. It works, '
                    'and it was rejected on purpose -- see COUNTER-01';
  END IF;

  -- all three branches guard on a non-null caller
  SELECT count(*) INTO n
  FROM regexp_matches(src, 'IF auth\.uid\(\) IS NOT NULL AND NOT COALESCE', 'g');
  IF n <> 3 THEN
    RAISE EXCEPTION '165 guard: expected 3 non-null-caller branches, found %', n;
  END IF;

  -- still SECURITY DEFINER, or it cannot read users.is_admin at all
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'protect_verified_instructor' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION '165 guard: no longer SECURITY DEFINER';
  END IF;

  -- and the trigger is still attached and enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE c.relname = 'users' AND c.relnamespace = 'public'::regnamespace
      AND p.proname = 'protect_verified_instructor' AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION '165 guard: the trigger is missing or disabled on public.users';
  END IF;
END $$;

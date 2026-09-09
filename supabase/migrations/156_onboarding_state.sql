-- 156_onboarding_state.sql
--
-- T-ONB1: move first-run state off localStorage and onto the user row.
--
-- WHY:
-- Onboarding "seen" state lived only in localStorage, across six separate keys.
-- That is per-device and per-browser, so the same athlete was re-onboarded on
-- their laptop, inside the Capacitor shell, in the WhatsApp in-app browser, and
-- after any cache clear. Al's report — "after i first log in and click through
-- that, i shouldn't be seeing the same pop ups over and over" — is that design
-- working as built.
--
-- WHAT:
--   onboarding_completed_at  NULL = never finished the intro. Set when the
--                            sequence completes OR is dismissed by any means;
--                            dismissing counts as done (Al, 2026-09-09).
--   dismissed_banners        One text[] rather than a boolean column per
--                            banner, so adding the seventh banner needs no
--                            migration. Values are stable string ids:
--                            'profile-completion', 'streak', 'referral',
--                            'instructor-upsell', 'notification-prompt', and
--                            the QuickGuide ids 'tribe-welcome',
--                            'tribe-os-welcome', 'os-clients', 'os-revenue',
--                            'os-coaches'.
--
-- BACKFILL:
-- Every existing user is treated as already onboarded. Nobody who has been
-- using Tribe for months should get a first-run tour because we shipped this.
-- 92 users at time of writing.
--
-- WHY THE DEFAULT STAYS NULL AND THE BACKFILL IS A ONE-TIME UPDATE:
-- Defaulting the column to now() would look equivalent and would silently kill
-- onboarding forever — every account created afterwards would be born
-- "completed". NULL default + one-off UPDATE is what makes existing users done
-- while new accounts still get their one introduction. Do not "simplify" this
-- into a DEFAULT.
--
-- RLS: no new policy needed for the columns. `Users can update own profile`
-- (auth.uid() = id, schema.sql:79) already covers them, and the BEFORE UPDATE
-- guards on users (043_lock_is_admin, 098_rls_self_escalation_guards) only
-- constrain is_admin and banned-status, neither of which is touched here.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_banners TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.users.onboarding_completed_at IS
  'When the athlete finished OR dismissed the first-run introduction. NULL means they have never seen it. Dismissing counts as completing (T-ONB1).';

COMMENT ON COLUMN public.users.dismissed_banners IS
  'Stable ids of banners and guides this athlete has dismissed for good. One array rather than a column per banner (T-ONB1).';

-- One-time backfill: existing accounts are done, new ones are not.
UPDATE public.users
SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;

-- ── Atomic single-banner dismissal ────────────────────────────────────────
-- WHY AN RPC RATHER THAN A CLIENT-SIDE UPDATE:
-- Dismissing a banner from the client would be read-modify-write: read the
-- array, append, write the whole array back. Two dismissals in the same
-- session — or the same account in two tabs — race, and the second write
-- clobbers the first, resurrecting a banner the athlete already dismissed.
-- Appending inside the database makes it a single atomic statement.
--
-- The uniqueness guard keeps the array from growing without bound when a
-- dismissal is retried (an optimistic client re-sends after a failed network
-- write). The length bound is hygiene: the id set is ours, and a caller has no
-- reason to push arbitrary strings onto their own row.
--
-- SECURITY: SECURITY DEFINER, but it can only ever touch the caller's own row
-- (WHERE id = auth.uid()). An anonymous caller matches no row and the function
-- is a no-op.
CREATE OR REPLACE FUNCTION public.dismiss_banner(banner_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET dismissed_banners = array_append(dismissed_banners, banner_id)
  WHERE id = auth.uid()
    AND banner_id IS NOT NULL
    AND length(banner_id) BETWEEN 1 AND 64
    AND NOT (dismissed_banners @> ARRAY[banner_id]);
$$;

COMMENT ON FUNCTION public.dismiss_banner(TEXT) IS
  'Atomically append one banner id to the calling user''s dismissed_banners. No-op if already present (T-ONB1).';

REVOKE ALL ON FUNCTION public.dismiss_banner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_banner(TEXT) TO authenticated;

-- Column-level SELECT grants for the two new columns.
--
-- public.users has NO table-level SELECT grant for authenticated/anon: 066
-- revoked it and re-granted SELECT column by column (067 extended the list).
-- A column added afterwards is therefore invisible to every non-service caller
-- until it is granted explicitly, and the client fails with
-- 42501 permission denied for table users.
--
-- These two lines were missing when this migration first ran against
-- production, which is why the introduction and every dismissible banner
-- rendered nothing. They are repeated in 157 because this file had already
-- been applied; here they exist so a database rebuilt from the migrations does
-- not reproduce the bug. Running both is harmless -- GRANT is idempotent.
GRANT SELECT (onboarding_completed_at, dismissed_banners)
  ON public.users TO authenticated;

GRANT SELECT (onboarding_completed_at, dismissed_banners)
  ON public.users TO anon;

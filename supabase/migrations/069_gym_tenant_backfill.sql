-- 069_gym_tenant_backfill.sql
-- Phase 2 Tribe.OS gym-tenant Path B: data backfill.
--
-- Synthesizes one gym per existing Tribe.OS user, adds that user as
-- the gym's owner in gym_coaches, and backfills gym_id on every
-- tenant-scoped row that was previously keyed only by
-- instructor_user_id (or, in the case of payments, by
-- sessions.creator_id).
--
-- MUST READ BEFORE APPLYING
-- -------------------------
-- Take a manual Supabase backup via the Dashboard BEFORE applying
-- this migration. If anything fails partway through, restore from
-- that backup. The Pro plan retains daily automatic backups but the
-- timing may not align with the moment this runs.
--
-- Idempotency
-- -----------
-- Each statement is written to be safe to re-run:
--   - Gym INSERT uses NOT EXISTS to skip users who already have a gym
--     (e.g. partial backfill, or a user who created their gym
--     through the new Mission 6 flow before this migration ran).
--   - gym_coaches INSERT uses ON CONFLICT DO NOTHING.
--   - Tenant table UPDATEs filter `gym_id IS NULL` so re-running
--     touches zero already-backfilled rows.
--
-- Predicate for "existing Tribe.OS user"
-- --------------------------------------
-- A user is considered an existing Tribe.OS user if ANY of:
--   tribe_os_tier IS NOT NULL
--   tribe_os_granted_at IS NOT NULL
--   tribe_os_status IS NOT NULL
--   tribe_os_stripe_subscription_id IS NOT NULL
--   tribe_os_stripe_customer_id IS NOT NULL
-- The last two catch users mid-checkout. We want a gym for any user
-- who has touched the subscription system, not just successful grants.

-- ------------------------------------------------------------------
-- Step 1: synthesize gyms for existing Tribe.OS users
-- ------------------------------------------------------------------
-- One gym per user. Owner is the user themselves. Slug is derived
-- from the email local-part with a 6-char md5 suffix for uniqueness.
-- The slug regex on the gyms table forbids non-[a-z0-9-]; the
-- regexp_replace below scrubs anything else out of the email
-- local-part before the suffix is appended.

INSERT INTO public.gyms (
  id,
  name,
  slug,
  owner_user_id,
  tribe_os_status,
  tribe_os_tier,
  tribe_os_stripe_customer_id,
  tribe_os_stripe_subscription_id,
  tribe_os_granted_at,
  tribe_os_granted_by,
  timezone,
  default_currency
)
SELECT
  gen_random_uuid(),
  -- Display name: user's name if present, else email local-part, else
  -- a fallback. Capped at 255 chars to satisfy the gyms.name CHECK.
  LEFT(
    COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1), 'Solo Practice'),
    255
  ),
  -- Slug: lowercase, scrubbed, suffixed with first 6 hex chars of
  -- md5(user.id) so it's deterministic and unique across re-runs.
  -- The slug column has UNIQUE constraint + a regex CHECK; we
  -- pre-scrub and lowercase to satisfy both. Empty local-part falls
  -- back to 'gym' to avoid leading-dash slugs.
  LEFT(
    LOWER(regexp_replace(
      COALESCE(NULLIF(split_part(u.email, '@', 1), ''), 'gym'),
      '[^a-z0-9-]',
      '-',
      'g'
    )) || '-' || substring(md5(u.id::text) FROM 1 FOR 6),
    80
  ),
  u.id,
  u.tribe_os_status,
  u.tribe_os_tier,
  u.tribe_os_stripe_customer_id,
  u.tribe_os_stripe_subscription_id,
  u.tribe_os_granted_at,
  u.tribe_os_granted_by,
  COALESCE(u.timezone, 'America/Bogota'),
  u.tribe_os_revenue_currency_default
FROM public.users u
WHERE (
    u.tribe_os_tier IS NOT NULL
    OR u.tribe_os_granted_at IS NOT NULL
    OR u.tribe_os_status IS NOT NULL
    OR u.tribe_os_stripe_subscription_id IS NOT NULL
    OR u.tribe_os_stripe_customer_id IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.gyms g WHERE g.owner_user_id = u.id
  );

-- ------------------------------------------------------------------
-- Step 2: add the owner to gym_coaches with role 'owner'
-- ------------------------------------------------------------------

INSERT INTO public.gym_coaches (gym_id, user_id, role)
SELECT g.id, g.owner_user_id, 'owner'
FROM public.gyms g
ON CONFLICT (gym_id, user_id) DO NOTHING;

-- ------------------------------------------------------------------
-- Step 3: backfill clients.gym_id from instructor_user_id
-- ------------------------------------------------------------------
-- A client's instructor becomes the gym's owner during this transition.
-- If the instructor doesn't yet have a gym (i.e. they have clients but
-- none of the tribe_os_* columns set — unlikely but possible), the
-- subquery returns NULL and we leave gym_id as NULL. Those rows still
-- work via the legacy RLS path until the cleanup migration.

UPDATE public.clients c
SET gym_id = sub.gym_id
FROM (
  SELECT g.id AS gym_id, g.owner_user_id
  FROM public.gyms g
) sub
WHERE c.instructor_user_id = sub.owner_user_id
  AND c.gym_id IS NULL;

-- ------------------------------------------------------------------
-- Step 4: backfill client_attendance.gym_id by joining through clients
-- ------------------------------------------------------------------

UPDATE public.client_attendance ca
SET gym_id = c.gym_id
FROM public.clients c
WHERE ca.client_id = c.id
  AND c.gym_id IS NOT NULL
  AND ca.gym_id IS NULL;

-- ------------------------------------------------------------------
-- Step 5: backfill payments.gym_id by joining through sessions.creator_id
-- ------------------------------------------------------------------
-- Payments are tied to sessions; sessions are owned by creator_id.
-- If the session creator has a gym, that's the gym the revenue
-- belongs to. Payments for sessions whose creators are NOT premium
-- (free Tribe sessions) keep gym_id = NULL, which is correct — they
-- aren't Tribe.OS revenue.

UPDATE public.payments p
SET gym_id = g.id
FROM public.sessions s
JOIN public.gyms g ON g.owner_user_id = s.creator_id
WHERE p.session_id = s.id
  AND p.gym_id IS NULL;

-- ------------------------------------------------------------------
-- Verification queries (run manually after the migration completes)
-- ------------------------------------------------------------------
-- All of these should match the operator's expectations. Mismatches
-- mean the backfill didn't cover everything; do NOT proceed to
-- migration 070 (dual-path RLS) until these are clean.
--
--   -- Should equal the count of Tribe.OS users
--   SELECT COUNT(*) FROM public.gyms;
--
--   -- Should equal COUNT(*) FROM public.gyms (one owner per gym)
--   SELECT COUNT(*) FROM public.gym_coaches WHERE role = 'owner';
--
--   -- Should be 0
--   SELECT COUNT(*) FROM public.clients
--   WHERE gym_id IS NULL
--     AND instructor_user_id IN (SELECT owner_user_id FROM public.gyms);
--
--   -- Should be 0
--   SELECT COUNT(*) FROM public.client_attendance ca
--   WHERE ca.gym_id IS NULL
--     AND EXISTS (
--       SELECT 1 FROM public.clients c
--       WHERE c.id = ca.client_id AND c.gym_id IS NOT NULL
--     );
--
--   -- Should be 0 (every payment whose session creator owns a gym
--   --              must have gym_id populated)
--   SELECT COUNT(*) FROM public.payments p
--   WHERE p.gym_id IS NULL
--     AND EXISTS (
--       SELECT 1 FROM public.sessions s
--       JOIN public.gyms g ON g.owner_user_id = s.creator_id
--       WHERE s.id = p.session_id
--     );

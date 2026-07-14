-- 127_rls_h3_gate1_participant_views.sql
-- RLS-H3 GATE 1 (additive — nothing removed, nothing revoked yet).
--
-- Today the public anon key reads all 68 session_participants rows in full,
-- including guest_name, guest_phone, guest_email, and guest_token (the guest's
-- unjoin credential) plus payment_* metadata. This gate adds the two read
-- surfaces that legitimate consumers will move onto BEFORE the raw table is
-- locked (Gate 3 revokes SELECT from anon + authenticated and consolidates the
-- SELECT policies). Rolling-safe, same shape as T-SEC4's users_discoverable.
--
-- Both objects are owner-executed views (security_invoker = false) so they keep
-- reading the raw columns after Gate 3 revokes them from anon/authenticated.

-- ── 1. session_participants_public — ANON: aggregate COUNTS ONLY ──────────────
-- Social proof ("8 going") with ZERO identities. No user_id, no names, no guest
-- fields — an anonymous scraper cannot enumerate WHO trains WHERE/WHEN (a real
-- physical-safety concern). One row per session; counts derived, not row-level.
CREATE OR REPLACE VIEW public.session_participants_public
WITH (security_invoker = false) AS
SELECT
  sp.session_id,
  count(*) FILTER (WHERE sp.status = 'confirmed')        AS confirmed_count,
  count(*)                                               AS participant_count
FROM public.session_participants sp
GROUP BY sp.session_id;

COMMENT ON VIEW public.session_participants_public IS
  'RLS-H3: anon-safe aggregate. Per-session participant counts ONLY — no identities, '
  'no user_id, no guest PII. Owner-executed so it survives the Gate 3 column revoke. '
  'Granted to anon + authenticated.';

-- anon is INTENDED here (counts only). Revoke PUBLIC for tidiness, then grant
-- both roles explicitly.
REVOKE ALL ON public.session_participants_public FROM PUBLIC;
GRANT SELECT ON public.session_participants_public TO anon, authenticated;

-- ── 2. session_participants_roster — AUTHENTICATED: identities, NO guest PII ──
-- Names/avatars for real users + guest DISPLAY name only. Deliberately omits
-- guest_phone, guest_email, guest_token, and every payment_* column. Not granted
-- to anon. (guest_name is included as the guest's display label, at parity with
-- the user names already shown in the same roster — see the report's open
-- decision if a bare first name should also be hidden.)
CREATE OR REPLACE VIEW public.session_participants_roster
WITH (security_invoker = false) AS
SELECT
  sp.id,
  sp.session_id,
  sp.user_id,
  sp.status,
  sp.is_guest,
  sp.guest_name,
  sp.joined_at,
  u.id         AS user_profile_id,
  u.name       AS user_name,
  u.avatar_url AS user_avatar_url
FROM public.session_participants sp
LEFT JOIN public.users u ON u.id = sp.user_id;

COMMENT ON VIEW public.session_participants_roster IS
  'RLS-H3: authenticated roster projection of session_participants. Identities + guest '
  'DISPLAY name + status only; NO guest_phone/guest_email/guest_token, NO payment_*. '
  'Owner-executed so it survives the Gate 3 column revoke. authenticated only; no anon.';

-- CRITICAL: Supabase default privileges grant SELECT on new public objects to
-- `anon` DIRECTLY (not via PUBLIC), so `REVOKE ... FROM PUBLIC` alone leaves the
-- roster (participant names + guest names) readable by the logged-out anon key.
-- Must REVOKE FROM anon explicitly. (Same trap as join_session /
-- get_admin_ids_by_email / accept_waitlist_offer.)
REVOKE ALL ON public.session_participants_roster FROM PUBLIC, anon;
GRANT SELECT ON public.session_participants_roster TO authenticated;

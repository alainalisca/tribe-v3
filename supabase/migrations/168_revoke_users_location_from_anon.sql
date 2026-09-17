-- 168_revoke_users_location_from_anon.sql
--
-- ⚠ DO NOT APPLY UNTIL GATE 0 IS DEPLOYED AND VERIFIED IN PRODUCTION.
--   Gate 0 = commit d272ccf, "fix(share): stop reading users.location as anon
--   on /i/[id]". See the ORDERING section below. This is the one migration in
--   this sequence that can blank a live public page if it runs early.
--
-- EXPOSURE (measured live, column by column, against the deployed anon key):
-- public.users has NO RLS SELECT policy at all. Access is governed purely by
-- column grants, so every ROW is readable and only COLUMNS are restricted. A
-- logged-out caller holding the public anon key reads id, name, avatar_url,
-- bio, location, sports, created_at and is_instructor for all 104 users.
--
-- users.location is the one in that set that is not obviously public. It is
-- free text, and it routinely holds the BARRIO rather than the city: the
-- instructor onboarding placeholder is 'Laureles, Medellín' and /profile/edit
-- is a plain text input with no city/neighbourhood split. T-ATH5's tier model
-- places the barrio at tier 3 -- visible only to someone who has co-attended a
-- past session. Today it is tier 0: visible to someone with no account.
--
-- Same pattern, and the same reversal note, as 115 (location_lat/location_lng)
-- and 118 (email).
--
-- Reversible:
--   GRANT SELECT (location) ON public.users TO anon;
--
-- ── ORDERING: WHY THIS IS NOT SAFE TO RUN ALONE ────────────────────────────
-- PostgREST rejects the WHOLE request when a select names a column the role
-- cannot read. It does not drop the column and return the rest. So any anon
-- query naming `location` goes from 200 to 401 the moment this runs.
--
-- Exactly one such caller existed: app/i/[id]/InstructorShareClient.tsx, the
-- PUBLIC instructor share page, which fetches client-side and therefore as anon
-- for a logged-out visitor. Its `if (!profile)` guard means a 401 there blanks
-- the ENTIRE page -- name, avatar, bio, sports, rating, sessions -- not just
-- the city line. That page is a bio-link destination.
--
-- Gate 0 removed `location` from that select. It must be DEPLOYED and verified
-- logged-out in production before this runs, not merely merged.
--
-- ── WHAT THIS DOES NOT BREAK, VERIFIED ─────────────────────────────────────
-- * /i/[id] generateMetadata reads public.users as anon but selects id, name,
--   avatar_url, bio, instructor_bio, sports, average_rating -- no location. OG
--   cards and WhatsApp link previews are unaffected either way.
-- * /api/og reads no database at all; every value arrives as a query param.
-- * /s/[id] reads sessions_public. /g/[id] reads featured_partners. Neither
--   touches public.users.
-- * Logged out, `/` returns <LandingPage/> before any feed query runs
--   (app/page.tsx:83), so ExploreCitySection's users.location read never fires
--   for anon.
-- * /profile/[userId] selects location via fetchUserProfile (lib/dal/users.ts:37)
--   through lib/supabase/server.ts, which uses the ANON key plus the viewer's
--   cookie. That would be the dangerous case if the route were prerendered
--   cookieless -- but `npm run build` marks it `ƒ (Dynamic)`, because
--   createClient() awaits cookies() and that opts the route out of static
--   generation. Every request carries a session, and middleware redirects
--   logged-out callers to /auth before the route renders at all.
-- * users_discoverable is owner-executed (security_invoker = false, migration
--   114), so it keeps reading location regardless of this revoke -- and anon
--   has no grant on that view anyway.
--
-- The remaining readers -- /storefront/[id], /instructors, ExploreCitySection,
-- leadDiscovery, the instructor discover tab, admin -- are all authenticated
-- surfaces and keep the grant. Narrowing location for authenticated VIEWERS is
-- the T-ATH5 tier work, not this file.
--
-- ORDERING, since the number no longer matches the sequence. 168 was written
-- first and HELD unapplied while 169 (delete host participant rows) and 170
-- (users.hide_from_attendee_lists) were written, rehearsed and applied. So this
-- lands THIRD despite being numbered first. Nothing here depends on the order:
-- it is one REVOKE on one column, it touches no object either of those created,
-- and the verifier keys its entry by name rather than position. The file keeps
-- its number so that the applied history and the repo agree.
--
-- PREMISE RE-MEASURED AGAINST PRODUCTION 2026-09-17T11:22Z: public.users has 101
-- columns, 84 readable by anon and 17 denied, and `location` is still among the
-- readable ones. The exposure is still open. The rehearsal's precheck fails
-- loudly if that ever stops being true rather than reporting a vacuous pass.
--
-- Rehearsal: supabase/rehearsals/168_revoke_users_location_from_anon_REHEARSAL.sql

REVOKE SELECT (location) ON public.users FROM anon;

-- ── Visible confirmation ───────────────────────────────────────────────────
-- A bare REVOKE reports only "success, no rows returned" in the Supabase SQL
-- editor, which is also exactly what a wrong-target run prints. That was the
-- lesson from applying 169 by hand: never hand over a migration whose only
-- confirmation is silence. This returns the end state as rows -- read it.
--
-- pub_cols is a MATERIALIZED CTE, and both of those words are load-bearing.
-- 'public.users'::regclass resolves to exactly ONE table, so the auth.users
-- columns that broke the first rehearsal cannot appear. MATERIALIZED forces the
-- CTE to be evaluated before has_column_privilege sees anything, because SQL's
-- AND does not short-circuit and the planner would otherwise be free to hand the
-- function a DROP COLUMN tombstone, whose attname is mangled and raises 42703.
WITH pub_cols AS MATERIALIZED (
  SELECT a.attname
  FROM pg_attribute a
  WHERE a.attrelid = 'public.users'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
)
SELECT
  has_column_privilege('anon', 'public.users', 'location', 'SELECT')
    AS anon_location_must_be_false,
  has_column_privilege('authenticated', 'public.users', 'location', 'SELECT')
    AS authenticated_location_must_be_true,
  (SELECT count(*) FROM pub_cols
    WHERE has_column_privilege('anon', 'public.users', attname, 'SELECT'))
    AS anon_readable_columns,
  (SELECT count(*) FROM pub_cols) AS total_columns,
  (SELECT count(*) FROM public.users) AS user_rows;

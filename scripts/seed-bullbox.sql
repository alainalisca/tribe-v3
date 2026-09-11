-- scripts/seed-bullbox.sql
--
-- Seeds CrossFit BullBox as an active gym partner, plus its roster.
-- NOT a migration: it is data, it is run once, by hand, and it is specific to
-- one gym. Keep it out of supabase/migrations/.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- READ BEFORE RUNNING
--
-- Nothing here is filled in. Every <PLACEHOLDER> is a decision only Al or
-- BullBox can make, and the script is written to FAIL rather than to invent a
-- value: a UUID placeholder will not cast, so a half-filled script aborts
-- instead of creating a half-real gym.
--
-- Verified against production on 2026-09-09:
--   featured_partners      2 rows, both business_type 'independent'. No BullBox.
--   partner_instructors    0 rows. The table is empty.
--   users                  no account matching bull / bullbox / hyrox / crossfit.
--   gyms (Tribe.OS)        3 rows, all solo tenants named after instructors.
-- BullBox exists in production only as free text in sessions.location, on 31
-- sessions, in five spellings.
--
-- STEP 0 IS NOT IN THIS SCRIPT. featured_partners.user_id is a NOT NULL foreign
-- key to users, and BullBox has no account. Someone has to sign BullBox up
-- through the app (or you create the auth user in the Supabase dashboard)
-- BEFORE this will run. I cannot create accounts.
--
-- Order: 1) BullBox signs up  2) fill in the placeholders  3) run section A
--        4) confirm the roster with Leo  5) run section B  6) run section C
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── A. THE PARTNER ROW ─────────────────────────────────────────────────────
INSERT INTO public.featured_partners (
  user_id,                  -- REQUIRED. FK to users.id. BullBox's own account,
                            -- from step 0. This is what makes the gym "the
                            -- host" on its own sessions and what /storefront/
                            -- [id] is keyed by.
  business_name,            -- REQUIRED. Canonical spelling, decided 2026-09-09.
                            -- Production has five variants in session text;
                            -- this is the one the app will show everywhere.
  business_type,            -- REQUIRED. 'gym' -- verified the CHECK constraint
                            -- accepts it. NOT 'independent': that value means a
                            -- solo trainer and would keep BullBox in the
                            -- instructor list instead of the gym section.
  status,                   -- REQUIRED. 'active'. Identity renders only while
                            -- active; set 'expired' and every chip disappears
                            -- while the sessions keep rendering.
  address,                  -- REQUIRED for the venue line and the map. Taken
                            -- from the fullest live session string.
  lat, lng,                 -- Needed for distance and for pre-filling a
                            -- session's coords when a coach picks the venue.
                            -- NULL on both existing partners, so nothing in the
                            -- app has exercised this path yet.
  logo_url,                 -- Needs BullBox's PERMISSION, not just the file.
                            -- NULL renders the monogram square, which is a
                            -- deliberate, complete fallback -- not a broken
                            -- image. Shipping without it is fine.
  banner_url,               -- Storefront header background. Same permission
                            -- point. NULL is fine.
  specialties,              -- Max 2 render in the storefront type line.
                            -- "official HYROX Training Club" is BullBox's claim
                            -- to make, not Tribe's to assert -- put it here
                            -- only if BullBox says it.
  description_es,           -- Spanish blurb. Column is not in the ticket spec
                            -- but both live partners populate it and the
                            -- storefront reads it.
  auto_approve_roster,      -- Added by migration 158. TRUE = the coaches below
                            -- publish at BullBox without asking. FALSE = every
                            -- session waits for BullBox to approve.
  tier,
  starts_at,
  expires_at,
  monthly_fee_cents,
  currency
) VALUES (
  '<BULLBOX_USER_UUID>'::uuid,
  'CrossFit BullBox',
  'gym',
  'active',
  'Cra 43G #25a-50, El Poblado, Medellín',
  NULL,                     -- <BULLBOX_LAT> when you have it
  NULL,                     -- <BULLBOX_LNG> when you have it
  NULL,                     -- '<LOGO_URL>' once BullBox approves its use
  NULL,                     -- '<BANNER_URL>' once BullBox approves its use
  ARRAY['CrossFit']::text[],       -- add a second only if BullBox confirms it
  '<DESCRIPCION_EN_ESPANOL>',
  TRUE,
  'standard',               -- matches both existing partners
  NOW(),
  NOW() + INTERVAL '6 months',     -- both existing partners run 6 months
  0,                        -- both existing partners are at 0
  'COP'
);

-- ── B. THE ROSTER ──────────────────────────────────────────────────────────
-- CONFIRM WITH LEO BEFORE RUNNING THIS SECTION.
--
-- These two are inferred from session history, not from anything either of them
-- told us: they are the only creators of the 31 sessions whose location names
-- BullBox (Leo Garcia 17, Darian 14). That is evidence they TRAIN there. It is
-- not evidence that BullBox considers them staff, and adding someone to a gym's
-- roster publishes that claim on their profile and on the gym's storefront.
--
-- Being on the roster also means their sessions auto-publish at BullBox while
-- auto_approve_roster is TRUE, without BullBox reviewing them.
--
-- Leave this section commented until Leo confirms both names.
--
-- INSERT INTO public.partner_instructors (partner_id, instructor_id, role, is_active)
-- VALUES
--   ((SELECT id FROM public.featured_partners WHERE business_name = 'CrossFit BullBox'),
--    '0df617e9-7547-4a8d-a0b1-8be4d52a673a'::uuid,   -- Leo Garcia, 17 sessions
--    '<ROLE_EN_ESPANOL>',                            -- shown under the name
--    TRUE),
--   ((SELECT id FROM public.featured_partners WHERE business_name = 'CrossFit BullBox'),
--    'eaff348f-5df3-4df5-bd80-69ec233aad0e'::uuid,   -- Darian, 14 sessions
--    '<ROLE_EN_ESPANOL>',
--    TRUE);

COMMIT;

-- ── C. BACKFILL THE EXISTING SESSIONS ──────────────────────────────────────
-- Section 1 of the ticket: existing BullBox sessions need an explicit approved
-- link, because the card deliberately does NOT infer a venue from the creator's
-- roster. Until this runs, the 31 historical sessions show a plain address.
--
-- COUNT FIRST. Run this and read the number before running the UPDATE:
--
--   SELECT count(*) FROM public.sessions s
--   WHERE s.partner_id IS NULL
--     AND s.location ILIKE '%bullbox%'
--     AND s.creator_id IN (
--       SELECT user_id FROM public.featured_partners WHERE business_name = 'CrossFit BullBox'
--       UNION
--       SELECT instructor_id FROM public.partner_instructors
--       WHERE partner_id = (SELECT id FROM public.featured_partners WHERE business_name = 'CrossFit BullBox')
--         AND is_active
--     );
--
-- Expected 31 as of 2026-09-09, IF both coaches above are on the roster. With
-- an empty roster it returns 0, which is the correct answer, not a bug.
--
-- ILIKE '%bullbox%' rather than matching the address: the five live spellings
-- ("CrossFit BullBox Ciudad del Río", "CrossFit bullbox", one with a trailing
-- space) share the gym's name and nothing else. Matching the partner address
-- would catch none of them.
--
-- This writes partner_status directly, which the app cannot do -- 158 revoked
-- that column from `authenticated`. It works here because the SQL editor runs
-- as the table owner. That asymmetry is the point: the gym's verdict is not
-- client-writable, and a backfill is Al asserting it on BullBox's behalf.
--
-- UPDATE public.sessions s
-- SET partner_id = (SELECT id FROM public.featured_partners WHERE business_name = 'CrossFit BullBox'),
--     partner_status = 'approved',
--     partner_reviewed_at = NOW()
-- WHERE s.partner_id IS NULL
--   AND s.location ILIKE '%bullbox%'
--   AND s.creator_id IN (
--     SELECT user_id FROM public.featured_partners WHERE business_name = 'CrossFit BullBox'
--     UNION
--     SELECT instructor_id FROM public.partner_instructors
--     WHERE partner_id = (SELECT id FROM public.featured_partners WHERE business_name = 'CrossFit BullBox')
--       AND is_active
--   );

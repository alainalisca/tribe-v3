-- ════════════════════════════════════════════════════════════════════════════
-- The TEST partner for the Tribe Athletes dark phase. PRODUCTION, pasted by Al.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Runbook: docs/ATHLETE_VALUE_MERGE_GATE.md, section 6, step 12. Paste the
-- WHOLE file into the Supabase SQL editor once. It is one transaction: if any
-- check fails, nothing is written. Re-running it is safe (it changes nothing
-- the second time and says so).
--
-- WHY IT EXISTS. Testing a pass claim on a real partner's /pase/{slug}/ sends a
-- real lead email to that gym's owner, and testing venue or program flows on a
-- real gym's live record put invented classes on CrossFit BullBox's public page
-- (CLAUDE.md, T-GYM2). Every production test of the pass and of the athlete
-- program uses this row instead.
--
-- WHAT IT CREATES
--   public.featured_partners    one row, slug 'tribe-test-pass', named TEST
--   public.partner_lead_routing one row, leads go to the app admin's email
-- WHAT IT DOES NOT CREATE: an athlete program. That is section 7, step 2, done
-- in /admin/atletas/ when the voucher test starts, and switched off after it.
--
-- HOW IT STAYS HIDDEN (audited 2026-10-06 against the athlete/main code and the
-- production schema dump; the full list is in the runbook)
--   status = 'pending'. Every public surface hides a pending partner:
--     - RLS on featured_partners: SELECT is status = 'active' OR is_app_admin()
--       (home carousel, /instructors gyms section, venue picker, storefront
--       header and pass button, session venue chips, set_session_partner);
--     - the partners_public view (/g/{slug}) hides exactly 'pending'. NOT
--       'paused' or 'expired': those would render on /g/{slug}. Never change
--       this row's status to anything but 'pending'.
--   /pase/tribe-test-pass/ and POST /api/pase still serve it, because
--   fetchPassConfig reads with the service role and checks only slug,
--   pass_active and the routing row. Pass pages are noindex and the sitemap
--   lists four static URLs, so crawlers do not find it.
--   user_id = NULL, ON PURPOSE. With an owner set, that owner's
--   /partners/apply screen shows the pending row with an "Activate" button,
--   and one tap (self_activate_featured_partner) makes it 'active' and public
--   everywhere. NULL also keeps the claim response from linking to a person's
--   storefront, and avoids featured_partners' UNIQUE user_id.
-- STILL VISIBLE, ADMINS ONLY: /admin (pending count +1), /admin/partners (with
-- an Approve button: do not press it), the admin leads and athletes screens.
--
-- WHERE THE LEADS GO. To the email of the one account with users.is_admin
-- (Al), read from auth.users here, so no address is written into this
-- repository. The pre-flight aborts unless there is exactly one app admin:
-- run the step 9 admin query first. Every claim also emails the address typed
-- into the form, so testers use an address they control.
--
-- TO REMOVE IT LATER (not part of this file): delete the featured_partners row
-- by slug; partner_lead_routing goes with it (ON DELETE CASCADE), and any test
-- leads keep their row with partner_id set to NULL.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_admins int;
  v_email  text;
  v_row    record;
BEGIN
  SELECT count(*) INTO v_admins FROM public.users WHERE is_admin IS TRUE;
  IF v_admins <> 1 THEN
    RAISE EXCEPTION 'TEST PARTNER ABORTED: expected exactly one app admin (Al), found %. Run the step 9 admin query and decide first. Nothing was changed.', v_admins;
  END IF;

  SELECT au.email INTO v_email
    FROM public.users u JOIN auth.users au ON au.id = u.id
   WHERE u.is_admin IS TRUE;
  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'TEST PARTNER ABORTED: the app admin has no usable email in auth.users. Nothing was changed.';
  END IF;

  -- The slug must be ours or free. A row with this slug that is not the TEST
  -- row means someone else took it: do not touch it.
  SELECT business_name, status, user_id INTO v_row
    FROM public.featured_partners WHERE slug = 'tribe-test-pass';
  IF FOUND AND (v_row.business_name NOT LIKE 'TEST %' OR v_row.status IS DISTINCT FROM 'pending' OR v_row.user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'TEST PARTNER ABORTED: slug tribe-test-pass exists and is not the hidden TEST row (name %, status %, owner %). Nothing was changed.',
      v_row.business_name, v_row.status, v_row.user_id;
  END IF;
  IF FOUND THEN
    RAISE NOTICE 'TEST partner already exists; this run changes nothing.';
  END IF;
END $pre$;

-- ── 1. The partner row: pending (hidden), pass on, no owner ───────────────────
INSERT INTO public.featured_partners
  (business_name, business_type, description, description_es, slug, status, pass_active, user_id, display_order)
VALUES
  ('TEST Tribe pass (not a real gym)', 'studio',
   'Internal test partner for the Tribe Athletes dark phase. Not a real gym.',
   'Socio de prueba interno para la fase oscura de Tribe Atletas. No es un gimnasio real.',
   'tribe-test-pass', 'pending', true, NULL, 0)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Lead routing: to the one app admin ─────────────────────────────────────
INSERT INTO public.partner_lead_routing (partner_id, lead_email)
SELECT fp.id, au.email
  FROM public.featured_partners fp
  CROSS JOIN public.users u
  JOIN auth.users au ON au.id = u.id
 WHERE fp.slug = 'tribe-test-pass' AND u.is_admin IS TRUE
ON CONFLICT (partner_id) DO NOTHING;

-- ── 3. Checks. Any failure rolls back everything above. ───────────────────────
DO $post$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.featured_partners
   WHERE slug = 'tribe-test-pass' AND business_name LIKE 'TEST %'
     AND status = 'pending' AND pass_active IS TRUE AND user_id IS NULL;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST PARTNER CHECK FAILED: the row is missing or not pending / pass on / unowned.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_lead_routing
                  WHERE partner_id = v_id AND position('@' in lead_email) > 0) THEN
    RAISE EXCEPTION 'TEST PARTNER CHECK FAILED: no lead routing with an email.';
  END IF;
  -- Hidden from the public view that /g/{slug} reads.
  IF EXISTS (SELECT 1 FROM public.partners_public WHERE slug = 'tribe-test-pass') THEN
    RAISE EXCEPTION 'TEST PARTNER CHECK FAILED: partners_public shows the row, so /g/tribe-test-pass would render.';
  END IF;
  -- No athlete program yet (the table exists once 202 is applied).
  IF to_regclass('public.athlete_programs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.athlete_programs WHERE partner_id = v_id) THEN
      RAISE EXCEPTION 'TEST PARTNER CHECK FAILED: an athlete program already exists for the TEST partner.';
    END IF;
  END IF;
  RAISE NOTICE 'TEST partner ready: /pase/tribe-test-pass/ (hidden everywhere public, leads to the app admin).';
END $post$;

COMMIT;

-- What it looks like now. Read only.
SELECT fp.id, fp.slug, fp.business_name, fp.status, fp.pass_active, fp.user_id,
       r.lead_email
  FROM public.featured_partners fp
  JOIN public.partner_lead_routing r ON r.partner_id = fp.id
 WHERE fp.slug = 'tribe-test-pass';

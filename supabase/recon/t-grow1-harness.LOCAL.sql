-- t-grow1-harness.LOCAL.sql
--
-- A MINIMAL LOCAL SCHEMA FOR PARSE-CHECKING THE T-GROW1 REHEARSALS. Not a
-- migration, never applied anywhere, and deliberately NOT a copy of production.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS, AND WHY A PARSE WOULD NOT HAVE DONE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 211's rehearsal failed in the Supabase SQL editor with 42601 at the
-- featured_partners clone: `SELECT * FROM jsonb_populate_record(...) FROM
-- public.featured_partners fp` has TWO FROM clauses. The same statement was in
-- all three files.
--
-- Nothing in CI could have caught it, and the reason is specific and worth
-- writing down: the statement lives inside a `DO $outer$ ... $$` block.
-- PL/pgSQL compiles a block's STRUCTURE when the block is created, but it defers
-- parsing the SQL text of each embedded statement until that statement first
-- EXECUTES. So feeding the whole file to the Postgres parser reports no error --
-- the syntax error is inside a string literal as far as the outer parse is
-- concerned. Only running it finds it.
--
-- That is the whole justification for this file: to run the scaffolding, you
-- need the tables it touches, and this is the smallest set of them.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IT IS AND IS NOT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- IS: the column shapes and the UNIQUE constraints of the tables the rehearsal
-- scaffolding writes, plus stubs for the functions it calls, plus the three
-- Supabase client roles so `SET LOCAL ROLE` resolves.
--
-- IS NOT: production's RLS, grants, triggers or data. A rehearsal that passes
-- here has NOT been shown to pass on production -- CLAUDE.md's whole catalogue
-- of findings is about the gap between a catalog read and the live database, and
-- this harness is further from production than a catalog read. It answers
-- exactly one question: does the SQL in these files parse and run at all.
--
-- The column lists come from the migrations, which is the right source for a
-- SHAPE question even though it is the wrong source for a GRANT question:
--   featured_partners  018, plus slug (163) and the pass_* columns (172)
--   pass_leads         173, plus 201's three attendance columns
--   partner_instructors 018
--   users              only the five columns the scaffolding reads

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The three client roles, so `SET LOCAL ROLE anon` resolves. NOLOGIN: nothing
-- here is reachable from outside this throwaway cluster.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  -- BYPASSRLS because production's service_role has it, and Part F of 211's
  -- rehearsal measures exactly that.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

-- auth.uid() reads the JWT claim the rehearsals set with set_config.
--
-- THE nullif GOES BEFORE THE CAST, and the first version of this stub had it
-- after. set_config(..., NULL, true) stores the EMPTY STRING, and ''::jsonb is
-- 22P02 -- so the arm that signs nobody in (212's B8) failed with a json syntax
-- error instead of reaching the function's `auth.uid() IS NULL` branch. That was
-- the harness being wrong, not the rehearsal: Supabase's real auth.uid() guards
-- with nullif first for exactly this reason.
--
-- Worth recording because it is the harness-as-instrument failure this repo
-- keeps finding elsewhere: a stub that is subtly unlike the thing it stands in
-- for makes a correct test report a defect that does not exist.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

CREATE TABLE IF NOT EXISTS public.users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  email      text UNIQUE,
  is_admin   boolean DEFAULT false,
  deleted_at timestamptz
);

-- 018 + slug (163) + the pass_* columns (172). The three UNIQUE constraints are
-- the point of this table being here: id, user_id and slug are what the clone
-- has to override, and the rehearsal's A7/A10 arm asserts there is no fourth.
CREATE TABLE IF NOT EXISTS public.featured_partners (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  business_name          text NOT NULL,
  business_type          text DEFAULT 'studio' CHECK (business_type IN ('studio','gym','academy','club','independent')),
  description            text,
  description_es         text,
  logo_url               text,
  banner_url             text,
  website_url            text,
  phone                  text,
  address                text,
  lat                    double precision,
  lng                    double precision,
  specialties            text[] DEFAULT '{}',
  tier                   text DEFAULT 'standard' CHECK (tier IN ('standard','premium','elite')),
  status                 text DEFAULT 'pending' CHECK (status IN ('pending','active','paused','expired')),
  starts_at              timestamptz,
  expires_at             timestamptz,
  monthly_fee_cents      int DEFAULT 0,
  currency               text DEFAULT 'COP',
  total_impressions      int DEFAULT 0,
  total_clicks           int DEFAULT 0,
  total_bookings         int DEFAULT 0,
  min_sessions_per_month int DEFAULT 4,
  min_rating             numeric(2,1) DEFAULT 4.0,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  -- 163: NOT NULL, and a CHECK on shape and length. Both were missing from the
  -- first version of this harness, so a clone with an upper-case or over-long
  -- slug would have passed locally and failed live.
  slug                   text NOT NULL,
  pass_headline          text,
  pass_sub               text,
  pass_options           jsonb,
  -- 172.
  pass_active            boolean NOT NULL DEFAULT false,
  lead_whatsapp          text,
  -- 158 and 161: both NOT NULL with a default, which the first version had as
  -- plain nullable columns.
  auto_approve_roster    boolean NOT NULL DEFAULT true,
  display_order          integer NOT NULL DEFAULT 0,
  CONSTRAINT featured_partners_slug_check
    CHECK (char_length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9-]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS featured_partners_slug_key ON public.featured_partners (slug);

CREATE TABLE IF NOT EXISTS public.partner_instructors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid REFERENCES public.featured_partners(id) ON DELETE CASCADE,
  instructor_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  role          text DEFAULT 'instructor',
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (partner_id, instructor_id)
);

-- 173 + 201's three attendance columns + 204's eight.
--
-- 204's ARE here, and the first version of this harness left them out. 211's
-- body carries a guard asserting the claim policy still contains
-- `referred_by_athlete_id IS NULL`, which is how it proves it did not recreate
-- that policy -- so without 204 the rehearsal aborted on a fact about the
-- harness. The guard was right; the harness was short.
--
-- 211's SEVEN are deliberately still absent: its own body adds them when the
-- rehearsal runs, and that is the thing being rehearsed.
CREATE TABLE IF NOT EXISTS public.pass_leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  slug               text NOT NULL,
  partner_id         uuid REFERENCES public.featured_partners(id) ON DELETE SET NULL,
  instructor_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  name               text NOT NULL,
  whatsapp           text NOT NULL,
  email              text NOT NULL,
  choice_1           text,
  choice_2           text,
  src                text,
  code               text,
  pass_code          text NOT NULL UNIQUE,
  consent_text       text NOT NULL,
  consent_at         timestamptz NOT NULL DEFAULT now(),
  user_agent         text,
  notified_at        timestamptz,
  contacted_at       timestamptz,
  tribe_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  attended_at        timestamptz,
  attended_marked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  attended_method    text,
  -- 204. referred_by_athlete_id references program_athletes on production; here
  -- it is a bare uuid, because program_athletes is a whole T-AV22 subtree this
  -- harness has no reason to carry and nothing in these rehearsals reads it.
  referred_by_athlete_id uuid,
  outcome                text,
  outcome_at             timestamptz,
  outcome_marked_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  retained_at            timestamptz,
  bonus_eligible         boolean,
  bonus_settled_at       timestamptz,
  bonus_settled_by       uuid REFERENCES public.users(id) ON DELETE SET NULL
);
-- ══════════════════════════════════════════════════════════════════════════
-- 173's EIGHT CHECK CONSTRAINTS, which the first version of this harness had
-- NONE of. That omission is the whole reason 211's live run failed where the
-- local run passed.
--
-- WHAT IT COST: five arms in 211 (B1, B5, B7, C2, C4) insert a lead, and every
-- rehearsal pass_code was shaped 'REHB1' / 'REH212A' -- which violates
-- pass_leads_pass_code, `^[A-Z]{2}-[A-Z2-9]{4}$`. Live, all five failed 23514.
--
-- AND WHY THE NEGATIVE ARMS HID IT. Postgres evaluates CHECKs in NAME ORDER, and
-- pass_leads_attr_tag_bounds, _first_touch_bounds and _landing_path_bounds all
-- sort before pass_leads_pass_code -- so every arm that EXPECTED a violation got
-- the one it was looking for and reported PASS over a row that was invalid for a
-- second, unnoticed reason. Only the arms expecting SUCCESS could see it, and
-- they are the arms this harness existed to protect.
--
-- The ordering is not contractual, and the arms do not rely on it: each asserts
-- the constraint NAME out of SQLERRM, so a different firing order makes them FAIL
-- rather than pass wrongly. That is the safe direction, and it is why a reader
-- could not spot this by eye.
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_name_len;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_name_len
  CHECK (char_length(name) BETWEEN 2 AND 80);
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_email_shape;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_email_shape
  CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_email_len;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_email_len
  CHECK (char_length(email) <= 255);
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_whatsapp_e164;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_whatsapp_e164
  CHECK (whatsapp ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_consent_text;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_consent_text
  CHECK (char_length(consent_text) BETWEEN 20 AND 500);
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_pass_code;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_pass_code
  CHECK (pass_code ~ '^[A-Z]{2}-[A-Z2-9]{4}$');
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_src_shape;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_src_shape
  CHECK (src IS NULL OR src ~ '^[A-Za-z0-9_-]{1,40}$');
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_code_shape;
ALTER TABLE public.pass_leads ADD CONSTRAINT pass_leads_code_shape
  CHECK (code IS NULL OR code ~ '^[A-Za-z0-9_-]{1,40}$');

-- 201.
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_attended_method_check;
ALTER TABLE public.pass_leads
  ADD CONSTRAINT pass_leads_attended_method_check
  CHECK (attended_method IS NULL OR attended_method IN ('toggle','scan','code'));

-- 204. The columns were already here; its CHECK was not.
ALTER TABLE public.pass_leads DROP CONSTRAINT IF EXISTS pass_leads_outcome_check;
ALTER TABLE public.pass_leads
  ADD CONSTRAINT pass_leads_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('joined','follow_up','not_now','already_member'));

-- 184. 211 to 213 each record themselves just before COMMIT; the rehearsals omit
-- that statement, but 211's Part G reads the table.
CREATE TABLE IF NOT EXISTS public.migrations_applied (
  migration  text PRIMARY KEY,
  note       text,
  applied_at timestamptz DEFAULT now()
);

-- ── Function stubs ─────────────────────────────────────────────────────────
--
-- Same signatures and same shapes as production's, because the rehearsals call
-- them by name and arity. The BODIES are only as faithful as the scaffolding
-- needs: production's are the authority and 201/173 own them.

CREATE OR REPLACE FUNCTION public.is_app_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT u.is_admin FROM public.users u WHERE u.id = auth.uid()), false);
$$;

-- 173, verbatim in behaviour: pass_active alone decides.
CREATE OR REPLACE FUNCTION public.pass_is_active(p_partner_id uuid, p_slug text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.featured_partners fp
     WHERE fp.id = p_partner_id AND fp.slug = p_slug AND fp.pass_active IS TRUE
  );
$$;

-- 201. The rehearsal for 212 drops this in arm D9 and Part E restores it, so it
-- has to exist here with the same signature for the drop to be the thing D9
-- intends rather than a no-op.
CREATE OR REPLACE FUNCTION public.av_can_work_door(p_partner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_partner_id IS NOT NULL
     AND (
          EXISTS (SELECT 1 FROM public.featured_partners fp
                   WHERE fp.id = p_partner_id AND fp.user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.partner_instructors pi
                   WHERE pi.partner_id = p_partner_id
                     AND pi.instructor_id = auth.uid()
                     AND pi.is_active IS TRUE)
       OR public.is_app_admin()
     );
$$;
REVOKE ALL ON FUNCTION public.av_can_work_door(uuid) FROM public, anon, authenticated;

-- ── RLS and grants, as 173 left them ──────────────────────────────────────
--
-- Only as much as the arms read. 211's Part C needs the claim policy to exist
-- and needs anon to hold table-level INSERT; its Part F MEASURES both, so
-- getting them wrong here would make those arms report a fact about the harness.
ALTER TABLE public.pass_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pass_leads FROM anon, authenticated, PUBLIC;
GRANT INSERT ON public.pass_leads TO anon, authenticated;
GRANT SELECT ON public.pass_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pass_leads TO service_role;
GRANT EXECUTE ON FUNCTION public.pass_is_active(uuid, text) TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT SELECT ON public.featured_partners TO anon, authenticated, service_role;
GRANT SELECT ON public.users TO authenticated, service_role;

-- AS 204 LEFT IT, all eleven IS NULL clauses. 211's guard reads this policy for
-- `referred_by_athlete_id IS NULL` specifically, to prove 211 did not recreate
-- it, so an abbreviated version here would fail the rehearsal over the harness.
DROP POLICY IF EXISTS "Anyone can claim a pass" ON public.pass_leads;
CREATE POLICY "Anyone can claim a pass" ON public.pass_leads FOR INSERT WITH CHECK (
  char_length(name) BETWEEN 2 AND 80
  AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  AND whatsapp ~ '^\+[1-9][0-9]{7,14}$'
  AND char_length(consent_text) BETWEEN 20 AND 500
  AND notified_at IS NULL AND contacted_at IS NULL AND tribe_user_id IS NULL
  AND public.pass_is_active(partner_id, slug)
  AND attended_at IS NULL AND attended_marked_by IS NULL AND attended_method IS NULL
  AND referred_by_athlete_id IS NULL AND outcome IS NULL AND outcome_at IS NULL
  AND outcome_marked_by IS NULL AND retained_at IS NULL AND bonus_eligible IS NULL
  AND bonus_settled_at IS NULL AND bonus_settled_by IS NULL
);
DROP POLICY IF EXISTS "Admins manage pass leads" ON public.pass_leads;
CREATE POLICY "Admins manage pass leads" ON public.pass_leads FOR ALL USING (public.is_app_admin());
DROP POLICY IF EXISTS "Partner reads own leads" ON public.pass_leads;
CREATE POLICY "Partner reads own leads" ON public.pass_leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.featured_partners fp WHERE fp.id = pass_leads.partner_id AND fp.user_id = auth.uid())
);
-- 208's restrictive policy, so 211's assertion that pass_leads has FOUR policies
-- before it runs is true here too.
DROP POLICY IF EXISTS "Program columns are server only" ON public.pass_leads;
CREATE POLICY "Program columns are server only" ON public.pass_leads
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (attended_at IS NULL AND attended_marked_by IS NULL AND attended_method IS NULL
    AND referred_by_athlete_id IS NULL AND outcome IS NULL AND outcome_at IS NULL
    AND outcome_marked_by IS NULL AND retained_at IS NULL AND bonus_eligible IS NULL
    AND bonus_settled_at IS NULL AND bonus_settled_by IS NULL);

-- ── Seed: enough actors for the scaffolding to resolve ────────────────────
--
-- 212's A7 needs an admin, THREE distinct non-owner users, a fourth for the
-- ordinary-athlete arm, and a real partner with an owner for the other-partner
-- arm. Seeded generously so a "resolved nobody" failure in the harness is a
-- harness problem and visibly not a SQL one.
INSERT INTO public.users (name, email, is_admin)
SELECT 'Harness Admin', 'admin@harness.local', true
WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'admin@harness.local');

INSERT INTO public.users (name, email, is_admin)
SELECT 'Harness User ' || g, 'user' || g || '@harness.local', false
FROM generate_series(1, 8) g
WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'user' || g || '@harness.local');

INSERT INTO public.featured_partners (user_id, business_name, business_type, slug, pass_active, status, created_at)
SELECT (SELECT id FROM public.users WHERE email = 'user8@harness.local'),
       'Harness Gym', 'gym', 'harness-gym', true, 'active', now() - interval '30 days'
WHERE NOT EXISTS (SELECT 1 FROM public.featured_partners WHERE slug = 'harness-gym');

INSERT INTO public.pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text, src, code)
SELECT 'harness-gym', (SELECT id FROM public.featured_partners WHERE slug = 'harness-gym'),
       -- HR-SEED, not HR-0001: the tail charset is [A-Z2-9], so 0 and 1 are
       -- forbidden. The first version of this harness used HR-0001 and could
       -- not have noticed, because it had no pass_code CHECK to violate.
       'Harness Lead', '+573001112233', 'lead@harness.local', 'HR-SEED',
       'Autorizo el tratamiento de mis datos para esta clase de prueba.', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.pass_leads WHERE pass_code = 'HR-SEED');

-- ============================================================================
-- 173_t_lead1_pass_leads_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 173's body verbatim, returns a SINGLE final result set, and ROLLS BACK —
-- ZERO changes persist.
--
-- ORDER MATTERS. 173's INSERT policy calls pass_is_active(), which reads
-- featured_partners.pass_active -- a column 172 adds. So:
--
--   * 172 ALREADY APPLIED -> run this file as it is.
--   * 172 NOT YET APPLIED -> this file fails at CREATE FUNCTION, which is the
--     correct answer and not a bug in the script. To rehearse both before
--     either is applied, paste 172's BODY (everything between its BEGIN and
--     its REHEARSAL CHECKS) immediately after the BEGIN below, and run the
--     result. Both bodies then apply and roll back in one transaction, which
--     is how these two were proved together on 2026-09-18 while neither was
--     applied to production.
--
-- WHAT IT IS PROVING: that anon can file a lead and can never read one. Both
-- halves, because either alone is a different broken product -- no INSERT and
-- the form silently fails for every visitor; SELECT and every stranger's phone
-- number and email is readable with the key that ships in the client bundle.
-- Supabase's default privileges grant ALL on a new public table to anon, so
-- the REVOKE in the body is what stands between those two states.
--
-- It also proves the negative that caused this policy to be rewritten once
-- already (check 6): a lapsed sponsorship must not stop a pass working.
-- featured_partners' SELECT policy is status = 'active', and an inline EXISTS
-- in the INSERT policy would have inherited it, refusing every submission for
-- a partner whose sponsorship expired with pass_active still true. 163 made
-- the bio link survive a lapsed sponsorship; the pass has to survive it too.
--
-- SCOPE OF PROOF: privileges, policy shape and function properties, via
-- has_table_privilege and pg_proc rather than information_schema, which only
-- reports rows where the current user is grantor or grantee and hands back
-- false passes — see drift-probe.sql. It does NOT execute an INSERT as anon:
-- the SQL Editor runs privileged and SET ROLE inside this transaction would
-- prove something about the editor, not about a browser. That path was
-- rehearsed locally instead, as itself, on PostgreSQL 17.11.
--
-- Read the rows: pass = true on every one means 173 is safe to apply.
-- Columns: check_name text | actual text | expected text | pass boolean.
-- ============================================================================

BEGIN;

-- ── MIGRATION 173 BODY (verbatim; header comment omitted) ──────────────────
CREATE TABLE IF NOT EXISTS public.pass_leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  slug          text        NOT NULL,
  partner_id    uuid        REFERENCES public.featured_partners(id) ON DELETE SET NULL,
  -- Nullable and unused for now. Instructors get a featured_partners row with
  -- business_type = 'independent' (T-LEAD1 item 3), so partner_id carries them
  -- too. This column exists for a future where a lead is attached to a person
  -- who has no partner row at all; nothing writes it today.
  instructor_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  name          text        NOT NULL,
  whatsapp      text        NOT NULL,
  email         text        NOT NULL,
  choice_1      text,
  choice_2      text,
  src           text,
  code          text,
  pass_code     text        NOT NULL UNIQUE,
  consent_text  text        NOT NULL,
  consent_at    timestamptz NOT NULL DEFAULT now(),
  user_agent    text,
  notified_at   timestamptz,
  contacted_at  timestamptz,
  tribe_user_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,

  -- The same rules the route applies, where a client cannot route around them.
  CONSTRAINT pass_leads_name_len     CHECK (char_length(name) BETWEEN 2 AND 80),
  CONSTRAINT pass_leads_email_shape  CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT pass_leads_email_len    CHECK (char_length(email) <= 255),
  -- E.164: a leading + and 8 to 15 digits. The route normalises a bare
  -- Colombian 10-digit number to +57 before it gets here.
  CONSTRAINT pass_leads_whatsapp_e164 CHECK (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT pass_leads_consent_text CHECK (char_length(consent_text) BETWEEN 20 AND 500),
  CONSTRAINT pass_leads_pass_code    CHECK (pass_code ~ '^[A-Z]{2}-[A-Z2-9]{4}$'),
  CONSTRAINT pass_leads_src_shape    CHECK (src IS NULL OR src ~ '^[A-Za-z0-9_-]{1,40}$'),
  CONSTRAINT pass_leads_code_shape   CHECK (code IS NULL OR code ~ '^[A-Za-z0-9_-]{1,40}$')
);

-- Newest first, per partner: the shape both the phase-2 dashboard and the
-- weekly digest read.
CREATE INDEX IF NOT EXISTS idx_pass_leads_partner_created
  ON public.pass_leads (partner_id, created_at DESC);

-- The digest's other question: who has not been contacted yet.
CREATE INDEX IF NOT EXISTS idx_pass_leads_uncontacted
  ON public.pass_leads (partner_id, created_at DESC)
  WHERE contacted_at IS NULL;

-- ── The pass-is-live test, as a function ──────────────────────────────────
--
-- WHY THIS IS NOT AN INLINE EXISTS IN THE POLICY, which is what it was first.
--
-- A subquery inside an RLS policy runs as the CALLING role, so it is itself
-- subject to RLS on the table it reads. featured_partners' SELECT policy is
-- (status = 'active' OR is_app_admin()). An inline EXISTS therefore answers
-- "is there a live pass AND can the caller see the partner row", and the second
-- half is not part of the question.
--
-- The consequence is not theoretical: 163 went to some trouble so a gym's bio
-- link would SURVIVE a lapsed sponsorship, because the link lives in someone
-- else's Instagram profile. A partner whose status leaves 'active' with
-- pass_active still true would, under an inline EXISTS, silently stop being
-- able to receive leads from the anon key -- the form would render and every
-- submission would be refused by a policy, with nothing saying why.
--
-- SECURITY DEFINER runs as the owner and reads the base table directly, so the
-- predicate answers only what it means to ask. search_path is pinned, matching
-- 163's slugify_partner_name.
CREATE OR REPLACE FUNCTION public.pass_is_active(p_partner_id uuid, p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.featured_partners fp
    WHERE fp.id = p_partner_id
      AND fp.slug = p_slug
      AND fp.pass_active IS TRUE
  );
$fn$;

COMMENT ON FUNCTION public.pass_is_active(uuid, text) IS
  'Does this partner have a live pass. SECURITY DEFINER so the pass_leads '
  'INSERT policy is not also asking whether the caller can see the partner row '
  '-- see 173 for why that difference matters to a lapsed sponsorship.';

GRANT EXECUTE ON FUNCTION public.pass_is_active(uuid, text) TO anon, authenticated;

ALTER TABLE public.pass_leads ENABLE ROW LEVEL SECURITY;

-- INSERT: a public form may write a lead, but only a well-formed one, and only
-- against a partner whose pass is actually live. The pass_active check is the
-- part a route-only rule could not give us: without it the anon key could file
-- leads against a partner who never agreed to run a pass.
DROP POLICY IF EXISTS "Anyone can claim a pass" ON public.pass_leads;
CREATE POLICY "Anyone can claim a pass"
  ON public.pass_leads FOR INSERT
  WITH CHECK (
    char_length(name) BETWEEN 2 AND 80
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND whatsapp ~ '^\+[1-9][0-9]{7,14}$'
    AND char_length(consent_text) BETWEEN 20 AND 500
    AND notified_at IS NULL
    AND contacted_at IS NULL
    AND tribe_user_id IS NULL
    AND public.pass_is_active(partner_id, slug)
  );

-- SELECT: the partner whose row it is, or an admin. is_app_admin() and not an
-- inlined EXISTS on users.is_admin: 113 revoked that column from authenticated
-- and anon, so a policy naming it makes the whole table unreadable with 42501.
DROP POLICY IF EXISTS "Partner reads own leads" ON public.pass_leads;
CREATE POLICY "Partner reads own leads"
  ON public.pass_leads FOR SELECT
  USING (
    is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.featured_partners fp
      WHERE fp.id = pass_leads.partner_id
        AND fp.user_id = auth.uid()
    )
  );

-- UPDATE: admin only for now. The partner's "Contactado" toggle is phase 2 and
-- needs a row-and-column-scoped write, which has no policy form -- a policy
-- grants the whole row and WITH CHECK cannot see the OLD one, so an owner
-- UPDATE policy here would let a partner rewrite the lead's email and phone.
-- That is migration 018's mistake on this very table family, which 104 had to
-- undo. When the toggle ships it goes in a SECURITY DEFINER function.
DROP POLICY IF EXISTS "Admins manage pass leads" ON public.pass_leads;
CREATE POLICY "Admins manage pass leads"
  ON public.pass_leads FOR ALL
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

-- Supabase's default privileges grant ALL on a new public table to anon and
-- authenticated. Reads and writes beyond the insert above are meant to be
-- impossible, so the grants are narrowed to match the policies rather than
-- left wide with RLS as the only thing standing up.
REVOKE ALL ON public.pass_leads FROM anon, authenticated, PUBLIC;
GRANT INSERT ON public.pass_leads TO anon, authenticated;
GRANT SELECT ON public.pass_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pass_leads TO service_role;

COMMENT ON TABLE public.pass_leads IS
  'Leads from the digital pass at /pase/[slug]. Written by /api/pase with the '
  'service-role client; the anon INSERT policy states the same rules where a '
  'client cannot route around them. anon holds INSERT and NO SELECT, so the '
  'anon key can file a lead and never read one. notified_at is set only when '
  'the partner email resolved -- a NULL there with a row present means the '
  'lead survived a Resend failure and needs chasing.';

COMMENT ON COLUMN public.pass_leads.consent_text IS
  'The exact sentence shown to the person, stored verbatim from a server-side '
  'constant -- never echoed from the client, which would let the submitter '
  'choose what they appear to have agreed to. Personal data leaves Tribe for a '
  'third party on this row, so the wording and consent_at are the record that '
  'they agreed to it.';

COMMENT ON COLUMN public.pass_leads.pass_code IS
  'Short human code shown to the person and quoted at reception: BB-4F7K. Two '
  'letters from the slug plus four from an alphabet with no 0/O/1/I, because '
  'it gets read aloud and typed from memory.';

-- ── Guards ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  leaked text;
  n_pol  int;
BEGIN
  IF to_regclass('public.pass_leads') IS NULL THEN
    RAISE EXCEPTION '173 guard: pass_leads does not exist';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pass_leads'::regclass) THEN
    RAISE EXCEPTION '173 guard: RLS is not enabled on pass_leads';
  END IF;

  -- THE ONE THAT MATTERS: the anon key must never be able to read a lead.
  IF has_table_privilege('anon', 'public.pass_leads', 'SELECT') THEN
    RAISE EXCEPTION '173 guard: anon can SELECT pass_leads -- every stranger''s '
                    'phone number and email is readable with the key that ships '
                    'in the client bundle';
  END IF;

  SELECT string_agg(r || '/' || p, ', ' ORDER BY r || '/' || p) INTO leaked
  FROM unnest(ARRAY['anon','authenticated']) r,
       unnest(ARRAY['UPDATE','DELETE']) p
  WHERE has_table_privilege(r, 'public.pass_leads', p);
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION '173 guard: client roles can modify leads: %', leaked;
  END IF;

  IF NOT has_table_privilege('anon', 'public.pass_leads', 'INSERT') THEN
    RAISE EXCEPTION '173 guard: anon cannot INSERT -- the public form cannot file a lead';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.pass_leads', 'INSERT') THEN
    RAISE EXCEPTION '173 guard: service_role cannot INSERT pass_leads';
  END IF;

  IF to_regprocedure('public.pass_is_active(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '173 guard: pass_is_active() is missing -- the INSERT policy '
                    'cannot answer whether a pass is live';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.pass_is_active(uuid,text)'::regprocedure) THEN
    RAISE EXCEPTION '173 guard: pass_is_active() is not SECURITY DEFINER -- it '
                    'would inherit the caller''s RLS on featured_partners';
  END IF;

  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pass_leads';
  IF n_pol <> 3 THEN
    RAISE EXCEPTION '173 guard: pass_leads has % policies, expected 3', n_pol;
  END IF;

  -- No policy may name users.is_admin directly: 113 revoked that column, and a
  -- policy reading it makes the table unreadable with 42501.
  SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO leaked
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pass_leads'
    AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ILIKE '%is_admin%'
    AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) NOT ILIKE '%is_app_admin%';
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION '173 guard: policies read users.is_admin directly: %', leaked;
  END IF;
END $$;


-- ── REHEARSAL CHECKS ───────────────────────────────────────────────────────
SELECT * FROM (
  SELECT '1_table_created_with_rls' AS check_name,
         coalesce((SELECT relrowsecurity::text FROM pg_class
                    WHERE oid = to_regclass('public.pass_leads')), 'MISSING') AS actual,
         'true' AS expected,
         coalesce((SELECT relrowsecurity FROM pg_class
                    WHERE oid = to_regclass('public.pass_leads')), false) AS pass
  UNION ALL
  SELECT '2_anon_can_file_a_lead',
         has_table_privilege('anon','public.pass_leads','INSERT')::text,
         'true',
         has_table_privilege('anon','public.pass_leads','INSERT')
  UNION ALL
  SELECT '3_anon_can_never_read_a_lead',
         has_table_privilege('anon','public.pass_leads','SELECT')::text,
         'false',
         NOT has_table_privilege('anon','public.pass_leads','SELECT')
  UNION ALL
  SELECT '4_client_roles_cannot_modify_leads',
         coalesce((SELECT string_agg(r || '/' || p, ', ')
                     FROM unnest(ARRAY['anon','authenticated']) r,
                          unnest(ARRAY['UPDATE','DELETE']) p
                    WHERE has_table_privilege(r,'public.pass_leads',p)), 'none'),
         'none',
         NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r,
                                   unnest(ARRAY['UPDATE','DELETE']) p
                      WHERE has_table_privilege(r,'public.pass_leads',p))
  UNION ALL
  SELECT '5_three_policies',
         (SELECT count(*)::text FROM pg_policies
           WHERE schemaname='public' AND tablename='pass_leads'),
         '3',
         (SELECT count(*) FROM pg_policies
           WHERE schemaname='public' AND tablename='pass_leads') = 3
  UNION ALL
  -- The lapsed-sponsorship guarantee, as a property of the function rather
  -- than a story about it. SECURITY DEFINER is the whole difference.
  SELECT '6_pass_is_active_is_security_definer',
         coalesce((SELECT prosecdef::text FROM pg_proc
                    WHERE oid = to_regprocedure('public.pass_is_active(uuid,text)')), 'MISSING'),
         'true',
         coalesce((SELECT prosecdef FROM pg_proc
                    WHERE oid = to_regprocedure('public.pass_is_active(uuid,text)')), false)
  UNION ALL
  SELECT '7_pass_is_active_search_path_pinned',
         coalesce((SELECT array_to_string(proconfig, ', ') FROM pg_proc
                    WHERE oid = to_regprocedure('public.pass_is_active(uuid,text)')), 'UNPINNED'),
         'search_path=public, pg_catalog',
         coalesce((SELECT array_to_string(proconfig, ', ') FROM pg_proc
                    WHERE oid = to_regprocedure('public.pass_is_active(uuid,text)'))
                  LIKE 'search_path=%', false)
  UNION ALL
  -- 113 revoked users.is_admin from anon and authenticated. A policy naming it
  -- directly makes the whole table unreadable with 42501.
  SELECT '8_no_policy_reads_users_is_admin_directly',
         coalesce((SELECT string_agg(policyname, ', ') FROM pg_policies
                    WHERE schemaname='public' AND tablename='pass_leads'
                      AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ILIKE '%is_admin%'
                      AND (coalesce(qual,'')||' '||coalesce(with_check,'')) NOT ILIKE '%is_app_admin%'),
                  'none'),
         'none',
         NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname='public' AND tablename='pass_leads'
                        AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ILIKE '%is_admin%'
                        AND (coalesce(qual,'')||' '||coalesce(with_check,'')) NOT ILIKE '%is_app_admin%')
  UNION ALL
  SELECT '9_service_role_can_write',
         has_table_privilege('service_role','public.pass_leads','INSERT')::text,
         'true',
         has_table_privilege('service_role','public.pass_leads','INSERT')
) checks ORDER BY check_name;

ROLLBACK;

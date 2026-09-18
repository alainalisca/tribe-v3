-- ============================================================================
-- 172_t_lead1_pass_config_and_routing_REHEARSAL.sql  —  NOT A MIGRATION.
-- Paste into the Supabase SQL Editor and Run once. Opens a transaction, applies
-- 172's body verbatim, returns a SINGLE final result set, and ROLLS BACK —
-- ZERO changes persist.
--
-- WHAT IT IS PROVING: that partner_lead_routing is born unreachable. Supabase
-- ships ALTER DEFAULT PRIVILEGES granting ALL on new public tables to anon,
-- authenticated and service_role, so a new table is created with anon already
-- holding SELECT/INSERT/UPDATE/DELETE. The REVOKE in PART B is what takes that
-- away, and check 4 below is the only thing that proves it actually did on THIS
-- database rather than on a local fixture.
--
-- It also proves the negative that the first draft of 172 got wrong: that
-- featured_partners' own grants are untouched (check 6). Keeping a column out
-- of partners_public does not make it private on that table, so nothing secret
-- is stored there at all.
--
-- SCOPE OF PROOF: privileges, policy count and schema state, via
-- has_table_privilege (the capability question) rather than
-- information_schema.table_privileges, which only reports rows where the
-- current user is grantor or grantee and hands back false passes — see
-- drift-probe.sql. It does NOT exercise RLS row predicates: the SQL Editor runs
-- privileged and would not walk the anon auth.uid() paths. partner_lead_routing
-- has no policies by design, so there are none to walk.
--
-- Read the rows: pass = true on every one means 172 is safe to apply.
-- Columns: check_name text | actual text | expected text | pass boolean.
-- ============================================================================

BEGIN;

-- ── MIGRATION 172 BODY (verbatim; header comment omitted) ──────────────────
-- ══════════════════════════════════════════════════════════════════════════
-- PART A — the public pass fields
-- ══════════════════════════════════════════════════════════════════════════
--
-- Every column here is rendered on a public page to a logged-out stranger, so
-- anon reading them through the existing table-level grant is the intended
-- behaviour, not a leak. No GRANT and no REVOKE: featured_partners' privileges
-- are untouched.

ALTER TABLE public.featured_partners
  ADD COLUMN IF NOT EXISTS pass_headline text,
  ADD COLUMN IF NOT EXISTS pass_sub      text,
  ADD COLUMN IF NOT EXISTS pass_options  jsonb,
  ADD COLUMN IF NOT EXISTS pass_active   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_whatsapp text;

COMMENT ON COLUMN public.featured_partners.lead_whatsapp IS
  'PUBLIC BY DESIGN. The pass page renders a wa.me link to this number, so it '
  'is on the page for every visitor. Contrast partner_lead_routing.lead_email, '
  'which is never sent to a client.';

COMMENT ON COLUMN public.featured_partners.pass_options IS
  'Up to two optional radio groups on the pass form, as '
  '{"<group label>": ["<option>", ...]}. Labels render verbatim in Spanish. '
  'Two groups is what the form lays out; more are ignored rather than stacked.';

COMMENT ON COLUMN public.featured_partners.pass_active IS
  'Gate for /pase/[slug]. FALSE by default. The page ALSO requires a '
  'partner_lead_routing row -- a live form with no destination loses the lead '
  'it just collected, so both conditions are checked, not either one.';

-- ══════════════════════════════════════════════════════════════════════════
-- PART B — partner_lead_routing: where the lead notification is sent
-- ══════════════════════════════════════════════════════════════════════════
--
-- Separate table for one reason: anon and authenticated hold nothing on it,
-- and a future column added here inherits that by default instead of needing
-- to be remembered in a grant list.
--
-- RLS is enabled AND the grants are revoked. Either alone would do the job;
-- both are here because they fail differently. RLS with zero policies denies
-- every row to a non-bypassing role, and the REVOKE means the role cannot
-- reach the table at all -- so if a future migration adds a policy meaning to
-- open one narrow read, it still gets nothing until someone also grants, which
-- is a second deliberate act rather than an accident.
--
-- THE REVOKE IS LOAD-BEARING, NOT DEFENSIVE BOILERPLATE. Supabase ships
-- ALTER DEFAULT PRIVILEGES granting ALL on new tables in public to anon,
-- authenticated and service_role. A table created here without the REVOKE is
-- born with anon holding SELECT/INSERT/UPDATE/DELETE on it. PART D asserts the
-- outcome rather than trusting these statements.

CREATE TABLE IF NOT EXISTS public.partner_lead_routing (
  partner_id uuid PRIMARY KEY
    REFERENCES public.featured_partners(id) ON DELETE CASCADE,
  lead_email text        NOT NULL,
  lead_cc    text[]      NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_lead_routing ENABLE ROW LEVEL SECURITY;

-- No policies, deliberately. Zero policies with RLS on is default-deny.
REVOKE ALL ON public.partner_lead_routing FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_lead_routing TO service_role;

COMMENT ON TABLE public.partner_lead_routing IS
  'Where a partner''s pass leads are emailed. SECRET: anon and authenticated '
  'hold NO privilege here and there are NO policies -- service_role is the only '
  'reader, and /api/pase is the only caller. Deliberately NOT columns on '
  'featured_partners: anon can read that table''s columns directly (see 172''s '
  'header), and the column-level-grant alternative would have required every '
  'future migration to remember a GRANT. A partner dashboard must reach this '
  'through a SECURITY DEFINER function, not by granting the table (see '
  'self_activate_featured_partner in 104).';

COMMENT ON COLUMN public.partner_lead_routing.lead_cc IS
  'Tribe''s own inbox, copied on every lead notification so a partner going '
  'quiet is visible to us. Empty array, never NULL, so the route can spread it '
  'without a null check.';

-- ══════════════════════════════════════════════════════════════════════════
-- PART C — seed BullBox's pass fields
-- ══════════════════════════════════════════════════════════════════════════
--
-- Keyed on id, not slug: slug is permanent but editable, and an UPDATE that
-- matches no row succeeds silently. PART D asserts it landed.
--
-- NO partner_lead_routing ROW. Al inserts it and flips pass_active once Leo
-- sends his address. Until then /pase/bullbox renders the inactive state,
-- which is the correct behaviour rather than a gap: a form with nowhere to
-- send the lead is worse than no form.

UPDATE public.featured_partners
   SET pass_headline = 'Tu primera clase gratis en BullBox',
       pass_sub      = 'CrossFit y HYROX en Ciudad del Río',
       pass_options  = '{"tipo": ["CrossFit", "HYROX"], "horario": ["Mañana", "Tarde / noche"]}'::jsonb,
       pass_active   = false
 WHERE id = '040cbc21-1b11-4ae1-aa99-9fe35a32bda0';

-- ══════════════════════════════════════════════════════════════════════════
-- PART D — guards. Assert the capability, never the statement.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  missing   text;
  leaked    text;
  n_pol     int;
  n_seed    int;
  in_view   text;
BEGIN
  -- d1. The five pass columns exist.
  SELECT string_agg(c, ', ' ORDER BY c) INTO missing
  FROM unnest(ARRAY['pass_headline','pass_sub','pass_options','pass_active',
                    'lead_whatsapp']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.featured_partners'::regclass
      AND attname = c AND attnum > 0 AND NOT attisdropped);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '172 guard: PART A did not add: %', missing;
  END IF;

  -- d2. The routing table exists with RLS on.
  IF to_regclass('public.partner_lead_routing') IS NULL THEN
    RAISE EXCEPTION '172 guard: partner_lead_routing does not exist';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.partner_lead_routing'::regclass) THEN
    RAISE EXCEPTION '172 guard: RLS is not enabled on partner_lead_routing';
  END IF;

  -- d3. Zero policies. A policy here would be the only thing between a client
  --     role and the partner's inbox, so its ARRIVAL is the thing to catch.
  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'partner_lead_routing';
  IF n_pol <> 0 THEN
    RAISE EXCEPTION '172 guard: partner_lead_routing has % policies, expected 0', n_pol;
  END IF;

  -- d4. THE POINT OF PART B. has_table_privilege is the capability question;
  --     information_schema.table_privileges would pass either way.
  SELECT string_agg(x, ', ' ORDER BY x) INTO leaked
  FROM (
    SELECT r || '/' || p AS x
    FROM unnest(ARRAY['anon','authenticated']) AS r,
         unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p
    WHERE has_table_privilege(r, 'public.partner_lead_routing', p)
  ) s;
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION '172 guard: client roles hold privileges on the lead '
                    'routing table: % -- Supabase default grants were not '
                    'revoked', leaked;
  END IF;

  -- d5. service_role can still read it, or /api/pase has nowhere to send.
  IF NOT has_table_privilege('service_role', 'public.partner_lead_routing', 'SELECT') THEN
    RAISE EXCEPTION '172 guard: service_role cannot read partner_lead_routing';
  END IF;

  -- d6. featured_partners' OWN grants are untouched. This migration deciding
  --     to tighten them is the mistake the header rejects, so the absence of
  --     that change is asserted rather than assumed.
  IF NOT has_table_privilege('anon', 'public.featured_partners', 'SELECT') THEN
    RAISE EXCEPTION '172 guard: anon lost table-level SELECT on '
                    'featured_partners -- this migration must not change that '
                    'table''s grants';
  END IF;

  -- d7. The seed landed on exactly one row, inactive.
  SELECT count(*) INTO n_seed
  FROM public.featured_partners
  WHERE id = '040cbc21-1b11-4ae1-aa99-9fe35a32bda0'
    AND slug = 'bullbox'
    AND pass_headline = 'Tu primera clase gratis en BullBox'
    AND pass_active IS FALSE;
  IF n_seed <> 1 THEN
    RAISE EXCEPTION '172 guard: BullBox seed matched % rows, expected 1', n_seed;
  END IF;

  -- d8. No pass column reached partners_public. The view is owner-executed, so
  --     its column list is readable by anyone with the anon key -- and for
  --     lead_whatsapp that would be harmless, which is exactly why the check
  --     covers all five rather than only the interesting ones.
  SELECT string_agg(a.attname, ', ' ORDER BY a.attname) INTO in_view
  FROM pg_attribute a
  WHERE a.attrelid = to_regclass('public.partners_public')
    AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname IN ('pass_headline','pass_sub','pass_options','pass_active',
                      'lead_whatsapp');
  IF in_view IS NOT NULL THEN
    RAISE EXCEPTION '172 guard: partners_public exposes pass column(s): %', in_view;
  END IF;
END $$;


-- ── REHEARSAL CHECKS ───────────────────────────────────────────────────────
SELECT * FROM (
  SELECT '1_pass_columns_added' AS check_name,
         (SELECT count(*)::text FROM pg_attribute
           WHERE attrelid = 'public.featured_partners'::regclass AND attnum > 0
             AND NOT attisdropped
             AND attname IN ('pass_headline','pass_sub','pass_options',
                             'pass_active','lead_whatsapp')) AS actual,
         '5' AS expected,
         (SELECT count(*) FROM pg_attribute
           WHERE attrelid = 'public.featured_partners'::regclass AND attnum > 0
             AND NOT attisdropped
             AND attname IN ('pass_headline','pass_sub','pass_options',
                             'pass_active','lead_whatsapp')) = 5 AS pass
  UNION ALL
  SELECT '2_routing_table_rls_enabled',
         coalesce((SELECT relrowsecurity::text FROM pg_class
                    WHERE oid = to_regclass('public.partner_lead_routing')), 'MISSING'),
         'true',
         coalesce((SELECT relrowsecurity FROM pg_class
                    WHERE oid = to_regclass('public.partner_lead_routing')), false)
  UNION ALL
  SELECT '3_routing_table_has_no_policies',
         (SELECT count(*)::text FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'partner_lead_routing'),
         '0',
         (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'partner_lead_routing') = 0
  UNION ALL
  SELECT '4_routing_table_unreachable_by_client_roles',
         coalesce((SELECT string_agg(r || '/' || p, ', ')
                     FROM unnest(ARRAY['anon','authenticated']) r,
                          unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
                    WHERE has_table_privilege(r,'public.partner_lead_routing',p)),
                  'none'),
         'none',
         NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r,
                                   unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
                      WHERE has_table_privilege(r,'public.partner_lead_routing',p))
  UNION ALL
  SELECT '5_service_role_reads_routing_table',
         has_table_privilege('service_role','public.partner_lead_routing','SELECT')::text,
         'true',
         has_table_privilege('service_role','public.partner_lead_routing','SELECT')
  UNION ALL
  SELECT '6_featured_partners_grants_untouched',
         has_table_privilege('anon','public.featured_partners','SELECT')::text,
         'true',
         has_table_privilege('anon','public.featured_partners','SELECT')
  UNION ALL
  SELECT '7_bullbox_seeded_and_inactive',
         (SELECT count(*)::text FROM public.featured_partners
           WHERE id = '040cbc21-1b11-4ae1-aa99-9fe35a32bda0'
             AND pass_headline = 'Tu primera clase gratis en BullBox'
             AND pass_active IS FALSE),
         '1',
         (SELECT count(*) FROM public.featured_partners
           WHERE id = '040cbc21-1b11-4ae1-aa99-9fe35a32bda0'
             AND pass_headline = 'Tu primera clase gratis en BullBox'
             AND pass_active IS FALSE) = 1
  UNION ALL
  SELECT '8_no_pass_column_in_partners_public',
         coalesce((SELECT string_agg(a.attname, ', ') FROM pg_attribute a
                    WHERE a.attrelid = to_regclass('public.partners_public')
                      AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname IN ('pass_headline','pass_sub','pass_options',
                                        'pass_active','lead_whatsapp')), 'none'),
         'none',
         NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = to_regclass('public.partners_public')
                        AND a.attnum > 0 AND NOT a.attisdropped
                        AND a.attname IN ('pass_headline','pass_sub','pass_options',
                                          'pass_active','lead_whatsapp'))
) checks ORDER BY check_name;

ROLLBACK;

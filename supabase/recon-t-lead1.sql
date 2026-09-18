-- ═══════════════════════════════════════════════════════════════════════════
-- T-LEAD1 RECON -- live schema state before migration 172.
--
-- READ ONLY. One statement, one JSON cell. Safe to re-run. Paste into the
-- Supabase SQL editor against PRODUCTION and send the whole cell back.
--
-- Pure SELECTs, so no transaction wrapper is needed (migration-protocol rule 6
-- applies to probes that write; this one never does).
--
-- WHAT IT ANSWERS, and why each question is here:
--
--   1. columns     Does featured_partners already carry any of the seven
--                  pass columns, and what does rate_limits actually look
--                  like. pass_leads is expected ABSENT -- this run is the
--                  "before" half. Re-run after 172 for the "after" half.
--   2. relations   Existence and RLS-enabled state, so an absent table is
--                  reported as absent rather than as an empty column list.
--   3. policies    THE LIVE POLICIES, not the ones the migration files claim.
--                  featured_partners has form here: it carried a fifth policy
--                  ("Read active partners or admin reads all") that existed in
--                  no migration, had been applied by hand to production, and
--                  silently defeated migration 159. Anything written against
--                  the file list is written against a fiction.
--   4. viewdef     partners_public's real SELECT list. Its column list IS the
--                  security boundary (163), and T-LEAD1 must add nothing to
--                  it -- confirming what is in it today is how we prove that.
--   5. grants      Effective privileges, from pg_catalog and has_table_privilege
--                  rather than information_schema.table_privileges: the latter
--                  only shows grants where the current user is grantor or
--                  grantee and hands back false passes (see drift-probe.sql).
--                  163 recorded that featured_partners has NO column-level
--                  grant regime, so its new columns need no GRANT. Seven more
--                  columns are about to be added on that assumption, so it gets
--                  re-checked rather than inherited.
--   6. seed_target The BullBox row the seed in 172 will UPDATE by id, and the
--                  user_id the pass page's "Reserva tu clase en Tribe" button
--                  resolves to. A seed that matches zero rows is silent.
--
-- information_schema is used for COLUMNS only, where it is authoritative, and
-- always filtered to table_schema = 'public': users, sessions and notifications
-- exist in more than one schema on this database and it will hand back all of
-- them. Grants come from pg_catalog for the reason in 5.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT jsonb_pretty(jsonb_build_object(

  'generated_at', now(),
  'database', current_database(),
  'postgres_version', current_setting('server_version'),

  -- ── 1. COLUMNS ────────────────────────────────────────────────────────────
  'columns', (
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'table', (x->>'position')::int), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
               'table', c.table_name,
               'position', c.ordinal_position,
               'column', c.column_name,
               'type', c.data_type,
               'udt', c.udt_name,
               'nullable', c.is_nullable,
               'default', c.column_default,
               'max_length', c.character_maximum_length
             ) AS x
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name IN ('featured_partners', 'pass_leads', 'rate_limits')
    ) s
  ),

  -- ── 2. RELATIONS ──────────────────────────────────────────────────────────
  -- to_regclass rather than a catalog join so a missing relation reports as
  -- null instead of vanishing from the result.
  'relations', (
    SELECT coalesce(jsonb_object_agg(t.name, jsonb_build_object(
             'exists', to_regclass('public.' || t.name) IS NOT NULL,
             'kind', (SELECT CASE c.relkind
                               WHEN 'r' THEN 'table'
                               WHEN 'v' THEN 'view'
                               WHEN 'm' THEN 'matview'
                               ELSE c.relkind::text END
                      FROM pg_class c
                      WHERE c.oid = to_regclass('public.' || t.name)),
             'rls_enabled', (SELECT c.relrowsecurity
                             FROM pg_class c
                             WHERE c.oid = to_regclass('public.' || t.name)),
             'rls_forced', (SELECT c.relforcerowsecurity
                            FROM pg_class c
                            WHERE c.oid = to_regclass('public.' || t.name))
           )), '{}'::jsonb)
    FROM (VALUES ('featured_partners'), ('pass_leads'), ('rate_limits'),
                 ('partners_public')) AS t(name)
  ),

  -- ── 3. LIVE POLICIES ──────────────────────────────────────────────────────
  'policies', (
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'table', x->>'policy'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
               'table', p.tablename,
               'policy', p.policyname,
               'permissive', p.permissive,
               'roles', p.roles,
               'cmd', p.cmd,
               'using', p.qual,
               'with_check', p.with_check
             ) AS x
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename IN ('featured_partners', 'pass_leads', 'rate_limits')
    ) s
  ),

  -- ── 4. partners_public DEFINITION ─────────────────────────────────────────
  'partners_public', jsonb_build_object(
    'security_invoker', (
      SELECT coalesce(
               (SELECT o FROM unnest(c.reloptions) AS o WHERE o LIKE 'security_invoker=%'),
               'unset (owner-executed)')
      FROM pg_class c WHERE c.oid = to_regclass('public.partners_public')
    ),
    'columns', (
      SELECT coalesce(jsonb_agg(a.attname ORDER BY a.attnum), '[]'::jsonb)
      FROM pg_attribute a
      WHERE a.attrelid = to_regclass('public.partners_public')
        AND a.attnum > 0 AND NOT a.attisdropped
    ),
    'definition', (
      SELECT pg_get_viewdef(to_regclass('public.partners_public'), true)
    )
  ),

  -- ── 5. EFFECTIVE GRANTS ───────────────────────────────────────────────────
  'table_grants', (
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'relation', x->>'role'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
               'relation', c.relname,
               'role', r.role,
               'select', has_table_privilege(r.role, c.oid, 'SELECT'),
               'insert', has_table_privilege(r.role, c.oid, 'INSERT'),
               'update', has_table_privilege(r.role, c.oid, 'UPDATE'),
               'delete', has_table_privilege(r.role, c.oid, 'DELETE')
             ) AS x
      -- Joined against pg_class so only relations that EXIST are tested:
      -- has_table_privilege on an absent table raises and would abort the
      -- whole probe, taking the other five sections with it.
      FROM pg_class c
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relname IN ('featured_partners', 'pass_leads', 'rate_limits',
                          'partners_public')
    ) s
  ),

  -- Column-level ACLs on featured_partners. 163 recorded that this table has
  -- NO column-level grant regime, which is why slug needed no GRANT. Migration
  -- 172 adds seven columns on the same assumption. An empty array here confirms
  -- it still holds; anything else means 172 must re-grant, the way 156 failed
  -- to on public.users and broke onboarding three attempts running.
  'featured_partners_column_acls', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'column', a.attname,
             'acl', a.attacl::text
           ) ORDER BY a.attname), '[]'::jsonb)
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.featured_partners')
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attacl IS NOT NULL
  ),

  -- ── 6. SEED TARGET ────────────────────────────────────────────────────────
  -- The row 172's seed UPDATEs by id. An UPDATE that matches nothing succeeds
  -- silently, so the id and the slug are confirmed here rather than assumed.
  'seed_target', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', fp.id,
             'slug', fp.slug,
             'business_name', fp.business_name,
             'business_type', fp.business_type,
             'status', fp.status,
             'user_id', fp.user_id,
             'address', fp.address
           ) ORDER BY fp.slug), '[]'::jsonb)
    FROM public.featured_partners fp
    WHERE fp.id = '040cbc21-1b11-4ae1-aa99-9fe35a32bda0'
       OR fp.slug = 'bullbox'
  )

)) AS t_lead1_recon;

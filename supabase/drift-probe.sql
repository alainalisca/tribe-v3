-- ═══════════════════════════════════════════════════════════════════════════
-- DRIFT PROBE — live permission state vs what the migrations claim.
-- READ ONLY. One statement. Run in the Supabase SQL editor.
--
-- Reads pg_catalog, never information_schema: information_schema.table_privileges
-- and column_privileges only show grants where the current user is grantor or
-- grantee, which is why they hand back false passes. relacl / attacl are the
-- authoritative ACL arrays, and has_*_privilege is the effective answer after
-- role membership is resolved. Both are reported so they can disagree visibly.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT jsonb_pretty(jsonb_build_object(

  'generated_at', now(),
  'database', current_database(),
  'postgres_version', current_setting('server_version'),

  -- ── 1a. TABLE-LEVEL ACLs on users and sessions ──────────────────────────
  'table_acls', (
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'table', x->>'grantee', x->>'privilege'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
               'table', c.relname,
               'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                               ELSE pg_get_userbyid(acl.grantee) END,
               'privilege', acl.privilege_type,
               'grantable', acl.is_grantable
             ) AS x
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relname IN ('users','sessions')
        -- the owner's own full ACL is the default and is pure noise here
        AND acl.grantee <> c.relowner
    ) s
  ),

  -- ── 1b. COLUMN-LEVEL ACLs, grouped so they diff against the archaeology ──
  'column_acls', (
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'table', x->>'grantee', x->>'privilege'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
               'table', c.relname,
               'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                               ELSE pg_get_userbyid(acl.grantee) END,
               'privilege', acl.privilege_type,
               'column_count', count(*),
               'columns', jsonb_agg(a.attname ORDER BY a.attname)
             ) AS x
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relname IN ('users','sessions')
      GROUP BY c.relname, acl.grantee, acl.privilege_type
    ) s
  ),

  -- ── 1c. EFFECTIVE privileges. This is the number that actually decides a
  --        request, and the one that must be diffed against the migrations.
  'effective_table_privileges', (
    SELECT coalesce(jsonb_object_agg(k, v ORDER BY k), '{}'::jsonb)
    FROM (
      SELECT r.rolname || ' | ' || t.tbl || ' | ' || p.priv AS k,
             has_table_privilege(r.rolname, ('public.' || t.tbl)::regclass, p.priv) AS v
      FROM (VALUES ('users'),('sessions')) t(tbl)
      CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
      CROSS JOIN pg_roles r
      WHERE r.rolname IN ('anon','authenticated','service_role')
        AND to_regclass('public.' || t.tbl) IS NOT NULL
    ) s
  ),

  -- ── 1d. Per-column effective privileges on users. The UPDATE list is the
  --        hole; the SELECT lists are what the seven SELECT migrations left.
  'users_effective_columns', (
    SELECT coalesce(jsonb_object_agg(k, v ORDER BY k), '{}'::jsonb)
    FROM (
      SELECT r.rolname || ' | ' || p.priv AS k,
             jsonb_build_object(
               'count', count(*) FILTER (WHERE has_column_privilege(r.rolname, 'public.users'::regclass, a.attname, p.priv)),
               'columns', coalesce(jsonb_agg(a.attname ORDER BY a.attname)
                            FILTER (WHERE has_column_privilege(r.rolname, 'public.users'::regclass, a.attname, p.priv)), '[]'::jsonb),
               'NOT_granted', coalesce(jsonb_agg(a.attname ORDER BY a.attname)
                            FILTER (WHERE NOT has_column_privilege(r.rolname, 'public.users'::regclass, a.attname, p.priv)), '[]'::jsonb)
             ) AS v
      FROM pg_attribute a
      CROSS JOIN (VALUES ('SELECT'),('UPDATE'),('INSERT')) p(priv)
      CROSS JOIN pg_roles r
      WHERE a.attrelid = 'public.users'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND r.rolname IN ('anon','authenticated')
      GROUP BY r.rolname, p.priv
    ) s
  ),

  -- ── 2. EVERY policy in public. A policy that exists here and in no
  --        migration is the featured_partners fifth-policy shape.
  'policies', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'table', tablename,
             'policy', policyname,
             'cmd', cmd,
             'permissive', permissive,
             'roles', to_jsonb(roles),
             'qual', qual,
             'with_check', with_check
           ) ORDER BY tablename, policyname), '[]'::jsonb)
    FROM pg_policies WHERE schemaname = 'public'
  ),
  'policy_count', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
  'policies_per_table', (
    SELECT coalesce(jsonb_object_agg(tablename, n ORDER BY tablename), '{}'::jsonb)
    FROM (SELECT tablename, count(*) AS n FROM pg_policies
          WHERE schemaname = 'public' GROUP BY tablename) s
  ),

  -- ── 3a. TRIGGERS in public, with their function's search_path ───────────
  'triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'table', c.relname,
             'trigger', t.tgname,
             'enabled', t.tgenabled,
             'timing', CASE WHEN (t.tgtype & 2) <> 0 THEN 'BEFORE' ELSE 'AFTER' END,
             'function', p.proname,
             'security_definer', p.prosecdef,
             'search_path', (SELECT cfg FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                              WHERE cfg LIKE 'search_path=%'),
             'MISSING_SEARCH_PATH',
               NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                            WHERE cfg LIKE 'search_path=%')
           ) ORDER BY c.relname, t.tgname), '[]'::jsonb)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND c.relnamespace = 'public'::regnamespace
  ),

  -- ── 3b. EVERY SECURITY DEFINER function in public ───────────────────────
  'security_definer_functions', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'function', p.proname,
             'args', pg_get_function_identity_arguments(p.oid),
             'owner', pg_get_userbyid(p.proowner),
             'search_path', (SELECT cfg FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                              WHERE cfg LIKE 'search_path=%'),
             'MISSING_SEARCH_PATH',
               NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                            WHERE cfg LIKE 'search_path=%')
           ) ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
  ),
  'definer_functions_missing_search_path', (
    SELECT coalesce(jsonb_agg(p.proname ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                       WHERE cfg LIKE 'search_path=%')
  ),

  -- ── 4. VIEWS in public: owner and security_invoker. An owner-executed view
  --        bypasses caller grants, so these survive any revoke untouched.
  'views', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'view', c.relname,
             'owner', pg_get_userbyid(c.relowner),
             'reloptions', to_jsonb(coalesce(c.reloptions, '{}'::text[])),
             'security_invoker', coalesce(
               (SELECT o FROM unnest(coalesce(c.reloptions,'{}'::text[])) o WHERE o LIKE 'security_invoker=%'),
               'security_invoker=false (default)'),
             'grants', (SELECT coalesce(jsonb_agg(DISTINCT
                          CASE WHEN acl2.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl2.grantee) END
                          || ':' || acl2.privilege_type), '[]'::jsonb)
                        FROM aclexplode(c.relacl) acl2
                        WHERE acl2.grantee <> c.relowner)
           ) ORDER BY c.relname), '[]'::jsonb)
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
  ),

  -- ── 5. RLS-enabled tables with ZERO policies, with live row counts.
  --        query_to_xml so a table that does not exist cannot break the
  --        statement at parse time.
  'rls_enabled_zero_policies', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'table', c.relname,
             'rows', (xpath('/row/c/text()',
                        query_to_xml(format('SELECT count(*) AS c FROM %I.%I', 'public', c.relname),
                                     false, true, '')))[1]::text::bigint
           ) ORDER BY c.relname), '[]'::jsonb)
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
  ),

  -- ── 5b. The two clipper tables specifically, whatever their policy state ─
  'clipper', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'table', c.relname,
             'rls_enabled', c.relrowsecurity,
             'policies', (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid = c.oid),
             'rows', (xpath('/row/c/text()',
                        query_to_xml(format('SELECT count(*) AS c FROM %I.%I', 'public', c.relname),
                                     false, true, '')))[1]::text::bigint
           ) ORDER BY c.relname), '[]'::jsonb)
    FROM pg_class c
    WHERE c.oid IN (to_regclass('public.clipper_clips'), to_regclass('public.clipper_videos'))
  ),

  -- ── 6. Tables with RLS OFF. Should be empty; listed so it is proved, not
  --        assumed.
  'rls_disabled_tables', (
    SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity
  )

)) AS drift_report;

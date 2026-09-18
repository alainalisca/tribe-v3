-- capture_reviews_live.sql
--
-- READ ONLY. Run in the Supabase SQL editor and hand back the single result.
-- Nothing here writes, locks or changes anything.
--
-- ONE RESULT SET, ON PURPOSE. The first version of this file was six separate
-- statements; the editor shows only the LAST statement's result, so five of the
-- six were silently discarded and the grants came back alone. That is the same
-- constraint every rehearsal in this repo already folds around
-- (feedback-do-block-no-visible-output), and it applies to captures too. So:
-- one SELECT, UNION ALL, a `kind` column, an `ord` column, sorted at the end.
-- Same shape as 166's capture.
--
-- WHY THIS CAPTURE EXISTS. supabase/migrations/add_reviews.sql sits OUTSIDE the
-- numbered series and disagrees with production in THREE places now:
--   1. its INSERT policy carries `AND host_id != auth.uid()`; the live catalog
--      reports zero policies on public.reviews mentioning host_id
--   2. the live policy's NAME matches nothing in this repo
--   3. it declares update_host_average_rating; the live function is
--      update_host_rating
-- The file is not a record of what exists. It is a record of what someone once
-- intended. Same DB-02 problem as session_attendance, same answer as migration
-- 166: PRODUCTION IS AUTHORITATIVE. Capture what is live, verbatim, including
-- the parts that look like mistakes. Do not renumber a file the database
-- disagrees with -- that enshrines the disagreement.
--
-- This output becomes migration 173 (capture). It is separate from 172, which
-- CHANGES the policy, and it runs FIRST: capture what is there before changing
-- it, or a rollback has nothing to roll back to.
--
-- THE OUTSTANDING QUESTION IS THE `function` SECTION: prosecdef and the full
-- body of whatever update_host_rating actually is. If it is not SECURITY
-- DEFINER, it runs as the reviewer and its `UPDATE users` targets another
-- person's row, which the users UPDATE policy (auth.uid() = id) refuses -- a
-- zero-row update that raises nothing. One host in four measured inconsistent,
-- which is exactly what that looks like.
--
-- A FIRST ATTEMPT RETURNED NULL AND NULL WAS READ AS AN ANSWER.
-- pg_proc.prosecdef is declared NOT NULL and cannot be null; that NULL meant no
-- row matched, because the query named the function from the file rather than
-- following the trigger. So the function section below is reached through the
-- trigger's tgfoid (no name assumed), swept by name pattern as well, and every
-- section ends with an explicit row when it finds nothing -- absence prints as
-- "(NONE FOUND)" rather than as no row at all.
--
-- The function body is emitted ONE LINE PER ROW so it is readable and
-- copy-pasteable from a grid cell, which a single multi-line cell is not.

SELECT kind, ord, name, detail
FROM (

  -- ── rls ────────────────────────────────────────────────────────────────
  SELECT 'rls'::text AS kind, 100::bigint AS ord,
         'public.reviews'::text AS name,
         ('rls_enabled=' || c.relrowsecurity || '  rls_forced=' || c.relforcerowsecurity)::text AS detail
  FROM pg_class c WHERE c.oid = 'public.reviews'::regclass

  UNION ALL

  -- ── column ─────────────────────────────────────────────────────────────
  SELECT 'column', 200 + a.attnum,
         a.attname::text,
         (format_type(a.atttypid, a.atttypmod)
          || CASE WHEN a.attnotnull THEN '  NOT NULL' ELSE '  NULL' END
          || coalesce('  DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''))::text
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.reviews'::regclass AND a.attnum > 0 AND NOT a.attisdropped

  UNION ALL

  -- ── constraint ─────────────────────────────────────────────────────────
  -- Including ON DELETE actions: 166 found an asymmetric FK exactly here.
  SELECT 'constraint', 300 + row_number() OVER (ORDER BY contype, conname),
         conname::text,
         pg_get_constraintdef(oid)::text
  FROM pg_constraint WHERE conrelid = 'public.reviews'::regclass

  UNION ALL
  SELECT 'constraint', 399, '(NONE FOUND)', 'no constraints on public.reviews'
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reviews'::regclass)

  UNION ALL

  -- ── index ──────────────────────────────────────────────────────────────
  SELECT 'index', 400 + row_number() OVER (ORDER BY indexname),
         indexname::text, indexdef::text
  FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'reviews'

  UNION ALL
  SELECT 'index', 499, '(NONE FOUND)', 'no indexes on public.reviews'
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='reviews')

  UNION ALL

  -- ── policy ─────────────────────────────────────────────────────────────
  -- The real names, because the live INSERT policy's name matches no file in
  -- this repo and 172 drops it by a name read from here rather than guessed.
  SELECT 'policy', 500 + row_number() OVER (ORDER BY cmd, policyname),
         (policyname || '  [' || cmd || ']')::text,
         ('roles=' || roles::text
          || '  permissive=' || permissive
          || '  USING=' || coalesce(qual, '(none)')
          || '  WITH CHECK=' || coalesce(with_check, '(none)'))::text
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews'

  UNION ALL
  SELECT 'policy', 599, '(NONE FOUND)', 'no policies on public.reviews -- with RLS enabled that denies everything to anon and authenticated'
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews')

  UNION ALL

  -- ── grant ──────────────────────────────────────────────────────────────
  -- Two readings, because they answer different questions and 168 was bitten
  -- conflating them: information_schema says "is there a row saying so",
  -- has_table_privilege says "can this role actually do it".
  SELECT 'grant', 600 + row_number() OVER (ORDER BY grantee, privilege_type),
         grantee::text,
         ('information_schema: ' || privilege_type)::text
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'reviews'

  UNION ALL

  SELECT 'grant', 650 + row_number() OVER (ORDER BY r.rolname),
         r.rolname::text,
         ('has_table_privilege: select=' || has_table_privilege(r.rolname,'public.reviews','SELECT')
          || ' insert=' || has_table_privilege(r.rolname,'public.reviews','INSERT')
          || ' update=' || has_table_privilege(r.rolname,'public.reviews','UPDATE')
          || ' delete=' || has_table_privilege(r.rolname,'public.reviews','DELETE'))::text
  FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')

  UNION ALL

  -- ── trigger ────────────────────────────────────────────────────────────
  SELECT 'trigger', 700 + row_number() OVER (ORDER BY t.tgname),
         t.tgname::text,
         pg_get_triggerdef(t.oid)::text
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.reviews'::regclass AND NOT t.tgisinternal

  UNION ALL
  SELECT 'trigger', 799, '(NONE FOUND)', 'no user triggers on public.reviews -- average_rating is then maintained by nothing'
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.reviews'::regclass AND NOT tgisinternal)

  UNION ALL

  -- ── function: the summary line ─────────────────────────────────────────
  -- Reached through the trigger's tgfoid, so no name is assumed. THIS IS THE
  -- ANSWER TO THE OUTSTANDING QUESTION: secdef=false means the trigger runs as
  -- the reviewer and cannot update another user's row.
  SELECT 'function', 800 + row_number() OVER (ORDER BY p.proname),
         (p.proname || '()')::text,
         ('SECURITY DEFINER = ' || p.prosecdef
          || '   owner = ' || pg_get_userbyid(p.proowner)
          || '   called by trigger ' || t.tgname
          || '   language = ' || l.lanname)::text
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_language l ON l.oid = p.prolang
  WHERE t.tgrelid = 'public.reviews'::regclass AND NOT t.tgisinternal

  UNION ALL

  -- ── function: the full body, one line per row ──────────────────────────
  SELECT 'function', 810000 + ln.i,
         (p.proname || ':' || lpad(ln.i::text, 3, '0'))::text,
         ln.line::text
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  CROSS JOIN LATERAL regexp_split_to_table(pg_get_functiondef(p.oid), E'\n') WITH ORDINALITY AS ln(line, i)
  WHERE t.tgrelid = 'public.reviews'::regclass AND NOT t.tgisinternal

  UNION ALL

  -- ── function: the name sweep ───────────────────────────────────────────
  -- Any rating-maintaining function ANYWHERE in the schema, so a third name
  -- cannot hide the way the second one did. Includes ones not wired to a
  -- trigger at all, which would be their own finding.
  SELECT 'function', 900000 + row_number() OVER (ORDER BY n.nspname, p.proname),
         (n.nspname || '.' || p.proname || '()')::text,
         ('name sweep: SECURITY DEFINER = ' || p.prosecdef
          || '   owner = ' || pg_get_userbyid(p.proowner)
          || '   args = (' || pg_get_function_identity_arguments(p.oid) || ')')::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND (p.proname ILIKE 'host%rating'
      OR p.proname ILIKE '%average_rating%'
      OR p.proname ILIKE '%host_rating%'
      OR p.proname ILIKE '%update_host%')

  UNION ALL

  -- ── function: absence, stated ──────────────────────────────────────────
  -- An empty section looks identical to a query nobody ran. This row always
  -- appears, so the reader can tell those two apart.
  SELECT 'function', 990000, 'SUMMARY',
         ('user triggers on reviews = '
          || (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.reviews'::regclass AND NOT tgisinternal)
          || '   of those SECURITY DEFINER = '
          || (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
               WHERE t.tgrelid='public.reviews'::regclass AND NOT t.tgisinternal AND p.prosecdef)
          || '   trigger functions = '
          || (SELECT coalesce(string_agg(p.proname || '(secdef=' || p.prosecdef || ')', ', '), '(NONE FOUND)')
                FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
               WHERE t.tgrelid='public.reviews'::regclass AND NOT t.tgisinternal)
          || '   rating-named functions = '
          || (SELECT coalesce(string_agg(p.proname, ', '), '(NONE FOUND)')
                FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname NOT IN ('pg_catalog','information_schema')
                 AND (p.proname ILIKE 'host%rating' OR p.proname ILIKE '%average_rating%'
                   OR p.proname ILIKE '%host_rating%' OR p.proname ILIKE '%update_host%'))
          || '   add_reviews.sql name exists = '
          || (SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('public.update_host_average_rating()')))::text

) AS capture
ORDER BY ord;

-- capture_reviews_live.sql
--
-- READ ONLY. Run in the Supabase SQL editor and hand back all six result sets.
-- Nothing here writes, locks or changes anything.
--
-- WHY. supabase/migrations/add_reviews.sql sits OUTSIDE the numbered series and
-- its contents demonstrably do not match production: the file's INSERT policy
-- carries `AND host_id != auth.uid()`, and the live catalog reports zero
-- policies on public.reviews mentioning host_id. So the file is not a record of
-- what exists -- it is a record of what someone once intended.
--
-- Same DB-02 problem as session_attendance, and the same answer as migration
-- 166: PRODUCTION IS AUTHORITATIVE. Capture what is live, verbatim, including
-- the parts that look like mistakes. Do not renumber a file the database
-- disagrees with -- that would enshrine the disagreement.
--
-- This output becomes migration 173 (capture). It is deliberately separate from
-- 172, which CHANGES the policy: capture what is there before changing it, or a
-- rollback has nothing to roll back to.
--
-- THE QUESTION THAT MATTERS MOST is query 4: the security context of the
-- function behind trigger_update_host_rating. add_reviews.sql declares its
-- version WITHOUT SECURITY DEFINER. If that is what is live, the trigger runs
-- as the reviewer and its `UPDATE users` targets another person's row, which
-- the users UPDATE policy (auth.uid() = id) refuses -- a zero-row update that
-- raises nothing. One host in four measured inconsistent, which is exactly what
-- that would look like. That fix is its own migration with its own rehearsal,
-- not part of 172.
--
-- A FIRST ATTEMPT AT THAT QUESTION RETURNED NULL AND NULL WAS READ AS AN
-- ANSWER. pg_proc.prosecdef is declared NOT NULL and cannot be null; the NULL
-- meant no row matched, because the live function is update_host_rating while
-- add_reviews.sql calls it update_host_average_rating. That is a THIRD way that
-- file disagrees with production -- policy, and now the function name. Query 4
-- is therefore name-independent (reached through the trigger's tgfoid), swept
-- by name pattern as well, and ends with a row that prints "(NONE FOUND)"
-- rather than returning nothing, so absence can never again look like a value.

-- 1. Columns, exactly as the catalog has them, in ordinal order.
SELECT a.attnum,
       a.attname,
       format_type(a.atttypid, a.atttypmod) AS type,
       a.attnotnull                         AS not_null,
       pg_get_expr(d.adbin, d.adrelid)      AS default_expr
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.reviews'::regclass
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- 2. Constraints, including the ON DELETE actions on each FK. 166 found an
--    asymmetric FK this way; assume nothing.
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.reviews'::regclass
ORDER BY contype, conname;

-- 3. Every policy, with its real name. The live INSERT policy's name matches no
--    file in this repo, which is why 172 reads it from the catalog rather than
--    guessing at a DROP.
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'reviews'
ORDER BY cmd, policyname;

-- 4. THE RATING TRIGGER. Three queries, because the first attempt at this
--    returned NULL and NULL was read as an answer.
--
--    prosecdef is declared NOT NULL in pg_proc. It CANNOT be null. A NULL came
--    back because no row matched -- the function is named update_host_rating,
--    while add_reviews.sql calls it update_host_average_rating. So the file
--    disagrees with production on the function NAME as well as the policy: a
--    third instance of that file not describing this database.
--
--    NULL meant "the check could not report", not "the security setting is
--    false". The queries below are written so that absence is a printed row
--    saying absent, never a blank cell.

-- 4a. Name-independent and authoritative: whatever function the trigger
--     actually calls, reached through tgfoid rather than by guessing a name.
--     This is the one to trust.
SELECT t.tgname,
       p.proname,
       p.prosecdef                                  AS security_definer,
       pg_get_userbyid(p.proowner)                  AS owner,
       pg_get_triggerdef(t.oid)                     AS trigger_def,
       pg_get_functiondef(p.oid)                    AS function_def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.reviews'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 4b. Every function whose name looks like a rating maintainer, ANYWHERE in
--     the schema, so a third name cannot hide the way the second one did.
--     Matches host%rating, %average_rating% and %host_rating% at once.
SELECT n.nspname                                    AS schema,
       p.proname,
       p.prosecdef                                  AS security_definer,
       pg_get_userbyid(p.proowner)                  AS owner,
       pg_get_function_identity_arguments(p.oid)    AS args,
       pg_get_functiondef(p.oid)                    AS function_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (p.proname ILIKE 'host%rating'
       OR p.proname ILIKE '%average_rating%'
       OR p.proname ILIKE '%host_rating%'
       OR p.proname ILIKE '%update_host%')
ORDER BY n.nspname, p.proname;

-- 4c. Absence, stated. If 4a or 4b come back empty the grid shows nothing at
--     all, and "no rows" looks identical to "I forgot to run it". This always
--     returns exactly one row.
SELECT
  (SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.reviews'::regclass AND NOT tgisinternal)      AS user_triggers_on_reviews,
  (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.reviews'::regclass AND NOT t.tgisinternal
      AND p.prosecdef)                                                    AS of_those_security_definer,
  (SELECT coalesce(string_agg(p.proname || ' (secdef=' || p.prosecdef || ')', ', '), '(NONE FOUND)')
     FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.reviews'::regclass AND NOT t.tgisinternal)  AS trigger_functions,
  (SELECT coalesce(string_agg(p.proname, ', '), '(NONE FOUND)')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND (p.proname ILIKE 'host%rating' OR p.proname ILIKE '%average_rating%'
           OR p.proname ILIKE '%host_rating%' OR p.proname ILIKE '%update_host%'))
                                                                          AS rating_named_functions,
  (SELECT count(*) FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.update_host_average_rating()'))  AS add_reviews_sql_name_exists;

-- 5. Indexes and RLS state.
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'reviews'
ORDER BY indexname;

SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class WHERE oid = 'public.reviews'::regclass;

-- 6. Grants. Read from information_schema for the table-level picture, and
--    has_table_privilege for the capability question -- the two answer
--    different questions and 168 was bitten by conflating them.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'reviews'
ORDER BY grantee, privilege_type;

SELECT r.rolname,
       has_table_privilege(r.rolname, 'public.reviews', 'SELECT') AS can_select,
       has_table_privilege(r.rolname, 'public.reviews', 'INSERT') AS can_insert,
       has_table_privilege(r.rolname, 'public.reviews', 'UPDATE') AS can_update,
       has_table_privilege(r.rolname, 'public.reviews', 'DELETE') AS can_delete
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

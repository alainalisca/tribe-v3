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
-- THE QUESTION THAT MATTERS MOST is query 4, prosecdef on
-- update_host_average_rating. add_reviews.sql declares it WITHOUT SECURITY
-- DEFINER. If that is what is live, the trigger runs as the reviewer and its
-- `UPDATE users` targets another person's row, which the users UPDATE policy
-- (auth.uid() = id) refuses -- a zero-row update that raises nothing. One host
-- in four measured inconsistent, which is what that would look like. That fix
-- is its own migration with its own rehearsal, not part of 172.

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

-- 4. Triggers on reviews, and the security context of their functions.
--    prosecdef = true means SECURITY DEFINER. This is the query the rating
--    follow-up turns on.
SELECT t.tgname,
       pg_get_triggerdef(t.oid)      AS trigger_def,
       p.proname,
       p.prosecdef                   AS security_definer,
       pg_get_functiondef(p.oid)     AS function_def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.reviews'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

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

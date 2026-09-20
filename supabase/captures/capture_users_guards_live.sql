-- capture_users_guards_live.sql
--
-- READ ONLY. Run in the Supabase SQL editor and hand back the single result.
-- Nothing here writes, locks or changes anything.
--
-- ONE RESULT SET, ON PURPOSE. The editor shows only the LAST statement's
-- result, so a multi-statement capture silently discards all but the last one.
-- Same constraint every rehearsal in this repo folds around, same answer as
-- 166 and capture_reviews_live: one SELECT, UNION ALL, a `kind` column, an
-- `ord` column, sorted at the end.
--
-- WHY THIS CAPTURE EXISTS, AND IT IS WORSE THAN DB-02's USUAL SHAPE.
--
-- A behavioural probe on 2026-09-19 found that an authenticated non-admin
-- CANNOT self-set users.is_verified_instructor. Neither of us predicted that:
-- the column carries an UPDATE grant, there is no trigger for it in this
-- repository, and `is_verified_instructor` appears in exactly ONE .sql file
-- here -- as a column of the users_discoverable view (migration 114).
--
-- The guard is `protect_verified_instructor_trigger` -> `protect_verified_
-- instructor()`, SECURITY DEFINER, live in production, IN NO FILE IN THIS REPO.
--
-- DB-02 is usually a missing CREATE TABLE: a rebuild is incomplete. This is a
-- missing SECURITY CONTROL. `supabase db reset` from these migrations produces
-- a database where a signed-in user can verify themselves as an instructor,
-- and `is_verified_instructor` is the only gate on the lead reach-out path.
-- Nothing in the repo would tell you it was missing, because nothing in the
-- repo knows it exists.
--
-- CAPTURE VERBATIM. PRODUCTION IS AUTHORITATIVE. The capture migration is
-- written from this output, not reconstructed from what the function probably
-- says. A guard reconstructed from a guess is a guard nobody has read.
--
-- SCOPE. The trigger is the point, but the same pass records everything else
-- guarding this table, because the policy list already turned up four
-- overlapping UPDATE policies and two hardcoded-email policies. Capturing them
-- together means one run answers what actually protects `users`, rather than
-- three runs each answering a third of it.
--
-- Sections: trigger, function, policy, grant, constraint, SUMMARY.

SELECT kind, ord, name, detail
FROM (

  -- ── trigger: every user trigger on public.users, definition verbatim ────
  SELECT 'trigger'::text AS kind,
         100 + row_number() OVER (ORDER BY t.tgname) AS ord,
         t.tgname::text AS name,
         pg_get_triggerdef(t.oid)::text AS detail
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.users'::regclass AND NOT t.tgisinternal

  UNION ALL

  -- ── trigger: which function each one calls, and whether it is definer ───
  SELECT 'trigger', 200 + row_number() OVER (ORDER BY t.tgname),
         (t.tgname || ' -> ' || p.proname || '()')::text,
         ('SECURITY DEFINER = ' || p.prosecdef
          || '   owner = ' || pg_get_userbyid(p.proowner)
          || '   language = ' || l.lanname
          || '   enabled = ' || t.tgenabled::text
          || '   search_path = ' || coalesce(array_to_string(p.proconfig, ' '), '(NOT PINNED)'))::text
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_language l ON l.oid = p.prolang
  WHERE t.tgrelid = 'public.users'::regclass AND NOT t.tgisinternal

  UNION ALL

  -- ── function: full body of every trigger function, one line per row ─────
  -- Reached through tgfoid, so no name is assumed and a differently-named
  -- guard cannot hide. This is the part the capture migration is written from.
  SELECT 'function', 310000 + ln.i,
         (p.proname || ':' || lpad(ln.i::text, 3, '0'))::text,
         ln.line::text
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  CROSS JOIN LATERAL regexp_split_to_table(pg_get_functiondef(p.oid), E'\n') WITH ORDINALITY AS ln(line, i)
  WHERE t.tgrelid = 'public.users'::regclass AND NOT t.tgisinternal

  UNION ALL

  -- ── function: anything NAMED like a guard but not wired to a trigger ────
  -- A guard that was detached rather than dropped still exists and still
  -- reads as present to anyone grepping pg_proc. Name-independent so a fifth
  -- convention cannot hide the way protect_verified_instructor did.
  SELECT 'function', 400 + row_number() OVER (ORDER BY p.proname),
         (p.proname || '()')::text,
         ('secdef = ' || p.prosecdef
          || '   wired to a users trigger = '
          || (SELECT count(*) FROM pg_trigger t
               WHERE t.tgfoid = p.oid AND t.tgrelid = 'public.users'::regclass AND NOT t.tgisinternal))::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.proname ILIKE 'protect%' OR p.proname ILIKE 'prevent%'
      OR p.proname ILIKE '%guard%' OR p.proname ILIKE '%escalat%'
      OR p.proname ILIKE '%verified%')

  UNION ALL

  -- ── policy: every policy on users, BOTH clauses, roles included ─────────
  -- with_check printed separately because an absent one is reused from using,
  -- and "absent" and "same as using" look identical unless you print both.
  SELECT 'policy', 500 + row_number() OVER (ORDER BY pol.cmd, pol.policyname),
         (pol.cmd || ' :: ' || pol.policyname)::text,
         ('roles = ' || array_to_string(pol.roles, ',')
          || '   permissive = ' || pol.permissive
          || E'\n      USING      = ' || coalesce(pol.qual, '(none)')
          || E'\n      WITH CHECK = ' || coalesce(pol.with_check, '(NONE -- using is reused)'))::text
  FROM pg_policies pol
  WHERE pol.schemaname = 'public' AND pol.tablename = 'users'

  UNION ALL

  -- ── policy: which ones name a literal email address ─────────────────────
  -- Four known instances of this pattern across session_attendance and users.
  -- A predicate naming one person's address is an access control that breaks
  -- the day that address changes, and looks deliberate to any audit.
  SELECT 'policy', 600 + row_number() OVER (ORDER BY pol.policyname),
         ('HARDCODED EMAIL :: ' || pol.cmd || ' :: ' || pol.policyname)::text,
         (coalesce(pol.qual, '') || ' | ' || coalesce(pol.with_check, ''))::text
  FROM pg_policies pol
  WHERE pol.schemaname = 'public' AND pol.tablename = 'users'
    AND (coalesce(pol.qual, '') ILIKE '%@%' OR coalesce(pol.with_check, '') ILIKE '%@%')

  UNION ALL

  -- ── grant: is UPDATE table-level, column-level, or both ─────────────────
  -- Measurement C said BOTH, which is why a targeted column REVOKE would have
  -- been inert. Recorded here so the capture migration states it rather than
  -- the next person re-deriving it.
  SELECT 'grant', 700,
         'users UPDATE :: table-level'::text,
         ('authenticated = ' || has_table_privilege('authenticated', 'public.users', 'UPDATE')
          || '   anon = ' || has_table_privilege('anon', 'public.users', 'UPDATE'))::text

  UNION ALL

  SELECT 'grant', 710 + row_number() OVER (ORDER BY cp.column_name),
         ('users UPDATE :: column :: ' || cp.column_name)::text,
         ('grantee = ' || cp.grantee::text)::text
  FROM information_schema.column_privileges cp
  WHERE cp.table_schema = 'public' AND cp.table_name = 'users'
    AND cp.privilege_type = 'UPDATE' AND cp.grantee IN ('authenticated', 'anon')
    AND cp.column_name IN ('is_admin','banned','deleted_at','is_test_account',
                           'is_verified_instructor','lead_credits_remaining',
                           'lead_credits_reset_at','lead_tier','is_instructor',
                           'tribe_os_tier','subscription_tier','storefront_tier',
                           'total_earnings_cents','stripe_account_id','wompi_merchant_id')

  UNION ALL

  -- ── constraint: anything else that could be doing the denying ───────────
  SELECT 'constraint', 800 + row_number() OVER (ORDER BY c.conname),
         c.conname::text,
         pg_get_constraintdef(c.oid)::text
  FROM pg_constraint c
  WHERE c.conrelid = 'public.users'::regclass AND c.contype = 'c'

  UNION ALL

  -- ── rule: rare, but it denies independently of grants and RLS ───────────
  SELECT 'constraint', 850 + row_number() OVER (ORDER BY r.rulename),
         ('RULE :: ' || r.rulename)::text,
         r.definition::text
  FROM pg_rules r
  WHERE r.schemaname = 'public' AND r.tablename = 'users'

  UNION ALL

  -- ── SUMMARY: absence, stated ────────────────────────────────────────────
  -- An empty section looks identical to a query nobody ran. This row always
  -- appears so those two can be told apart.
  SELECT 'zzz_summary', 990000, 'SUMMARY',
         ('rls_enabled = '
          || (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass)
          || '   user triggers = '
          || (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.users'::regclass AND NOT tgisinternal)
          || '   trigger functions = '
          || (SELECT coalesce(string_agg(p.proname || '(secdef=' || p.prosecdef || ')', ', '), '(NONE FOUND)')
                FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
               WHERE t.tgrelid='public.users'::regclass AND NOT t.tgisinternal)
          || '   policies = '
          || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='users')
          || '   UPDATE policies = '
          || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='users' AND cmd='UPDATE')
          || '   policies naming an email = '
          || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='users'
                AND (coalesce(qual,'') ILIKE '%@%' OR coalesce(with_check,'') ILIKE '%@%'))
          || '   protect_verified_instructor exists = '
          || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='protect_verified_instructor'))::text

) AS capture
ORDER BY ord;

-- 130_rls_h3_gate3_column_level_grants.sql
-- Fix for migration 129 step 3. The column-level
--   REVOKE SELECT (guest_phone, guest_email, guest_token) FROM anon, authenticated
-- was a NO-OP: both roles hold a TABLE-level SELECT grant on session_participants
-- (Supabase default), which implicitly covers every column. A column-level REVOKE
-- does not remove a table-level privilege, so has_column_privilege stayed true and
-- the Gate 3 verification correctly failed on check 4.
--
-- Correct pattern (same as T-SEC5 migrations 065/066 on users): drop the table-wide
-- SELECT, then GRANT SELECT back column-by-column on everything EXCEPT the three
-- guest-PII columns. Built dynamically from the live catalog so no column is missed.
--
-- anon: no SELECT grant at all (it already gets zero rows via the absent policy;
-- this removes the privilege too, so guest-PII selects are 42501, not empty-200).
-- Owner-executed views (session_participants_public / _roster) and the definer RPCs
-- are unaffected — they read the table as owner, not as anon/authenticated.

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'session_participants'
    AND column_name NOT IN ('guest_phone', 'guest_email', 'guest_token');

  -- Remove the table-wide SELECT that made the column REVOKE a no-op.
  EXECUTE 'REVOKE SELECT ON public.session_participants FROM anon, authenticated';

  -- authenticated regains SELECT on every NON-guest-PII column (rows still scoped
  -- by sp_select_own to user_id = auth.uid()). anon regains nothing.
  EXECUTE format('GRANT SELECT (%s) ON public.session_participants TO authenticated', cols);

  RAISE NOTICE 'gate3b: authenticated granted column-level SELECT on: %', cols;
  RAISE NOTICE 'gate3b: guest_phone/guest_email/guest_token NOT granted to anyone; anon has no SELECT';
END$$;

-- 160_drop_duplicate_partner_read_policy.sql
--
-- Records a policy Al dropped by hand against production on 2026-09-10, so a
-- database rebuilt from these migrations matches what is actually running.
--
-- WHAT SURVIVED 159
-- public.featured_partners carried a FIFTH policy that 159 never touched:
--
--   "Read active partners or admin reads all"  FOR SELECT
--     ((status = 'active') OR EXISTS (
--        SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
--
-- A duplicate of "Anyone can read active or admin reads all" under a different
-- name, still inlining the users.is_admin read that 113 revoked. Permissive
-- policies are OR'd for the ROW test, but the column-privilege check applies to
-- every policy expression that gets planned -- so one surviving policy refuses
-- the entire read, and 159 changed nothing observable even though all four of
-- its replacements were correct.
--
-- WHERE IT CAME FROM: nowhere in this repository.
-- The name appears in no migration, no SQL file, and nothing in `git log -S`.
-- It was applied by hand to production and never written down. That is the
-- whole lesson of this migration: the migration files were not the schema.
--
-- MEASURED (anon, live API):
--   before Al's drop   featured_partners 401 42501 permission denied for table users
--   after  Al's drop   featured_partners 200
--                      partner_instructors 200 -- cleared by cascade, as predicted,
--                                              with no statement of its own
--
-- DROP POLICY IF EXISTS is silent when the name does not match. That silence is
-- what let 159 look successful, so this migration does not rely on it: the
-- assertion below fails loudly if ANY policy on this table still reads users
-- directly, whatever it is called.

DROP POLICY IF EXISTS "Read active partners or admin reads all" ON public.featured_partners;

-- Assert the table is actually clean, rather than assuming the DROP above
-- matched something. Enumerates live policies from pg_catalog instead of
-- trusting names in migration files -- the mistake 159 made.
DO $$
DECLARE leftover TEXT;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO leftover
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'featured_partners'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%from users%';

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'featured_partners still has policies reading users directly: %. '
      'They will refuse every client read while users.is_admin is revoked (113). '
      'Replace them with public.is_app_admin() as migration 159 did.', leftover;
  END IF;
END $$;

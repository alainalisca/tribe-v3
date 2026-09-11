-- 162_revoke_partner_id_write.sql
--
-- Makes "always call set_session_partner" an enforcement rather than a
-- convention.
--
-- 158 revoked table-level UPDATE and INSERT on public.sessions and re-granted
-- column by column, excluding only partner_status and partner_reviewed_at. So
-- partner_id stayed writable by `authenticated`, and a client could set a venue
-- directly and leave partner_status NULL -- a state set_session_partner cannot
-- produce. Nothing renders below 'approved', so it was never a display leak; it
-- was a hole in the guarantee that the gym owns its own name.
--
-- BOTH privileges, for the same reason 158 revoked both: revoking UPDATE alone
-- leaves the identical state reachable through INSERT, by creating the session
-- with partner_id already set.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  READ THIS BEFORE WRITING ANOTHER GRANT ON public.sessions               ║
-- ║                                                                          ║
-- ║  ANY FUTURE COLUMN-BY-COLUMN RE-GRANT ON public.sessions MUST EXCLUDE    ║
-- ║  THREE COLUMNS, NOT TWO:                                                 ║
-- ║                                                                          ║
-- ║      partner_status, partner_reviewed_at, partner_id                     ║
-- ║                                                                          ║
-- ║  The first two are the gym's verdict. THE THIRD IS THE ONLY WAY THAT     ║
-- ║  VERDICT GETS COMPUTED.                                                  ║
-- ║                                                                          ║
-- ║  158's DO block re-grants every live column except a hard-coded list of  ║
-- ║  two, and that is now the established pattern in this repo. Copying it   ║
-- ║  verbatim silently re-grants partner_id and undoes this migration with   ║
-- ║  no error and no failing test -- the same failure family as 156 adding   ║
-- ║  columns under a column-level regime with no grant, which took three     ║
-- ║  attempts to find.                                                       ║
-- ║                                                                          ║
-- ║  CI catches it now: verify-migration-state.test.ts lists all three in    ║
-- ║  VERDICT_COLUMNS, and verify-migration-state.sql asserts all three stay  ║
-- ║  locked. Do not defeat either.                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- AUDITED BEFORE APPLYING: no client path writes partner_id.
--   * insertSession (lib/dal/sessions.ts:869) takes an explicit payload built
--     from the create form, which has no partner_id field.
--   * createChildSession (:1240) names 24 fields explicitly and spreads nothing.
--   * seedGymData uses the service role, which bypasses column grants.
--   * There is no duplicate / repeat / "create similar" flow.
-- PostgREST names only the keys present in a payload, so none of these can
-- produce "permission denied for column partner_id".
--
-- set_session_partner and review_venue_request are SECURITY DEFINER and run as
-- the function owner, so neither is affected. That is the claim to verify after
-- applying: attach a venue from the create form. If it errors with
-- "permission denied for column partner_id", the function is not running as
-- owner and the revert is:
--   GRANT INSERT (partner_id), UPDATE (partner_id) ON public.sessions TO authenticated;

REVOKE INSERT (partner_id), UPDATE (partner_id) ON public.sessions FROM authenticated;

-- Assert the revoke actually bit, rather than trusting it. has_column_privilege
-- resolves table-level and column-level grants together; information_schema
-- cannot see the former and would pass either way.
DO $$
DECLARE leftover TEXT;
BEGIN
  SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
  INTO leftover
  FROM (
    SELECT 'INSERT' AS privilege_type
    WHERE has_column_privilege('authenticated', 'public.sessions', 'partner_id', 'INSERT')
    UNION ALL
    SELECT 'UPDATE'
    WHERE has_column_privilege('authenticated', 'public.sessions', 'partner_id', 'UPDATE')
  ) remaining;

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'authenticated still holds % on sessions.partner_id. The venue must only '
      'be set through set_session_partner, which computes partner_status.', leftover;
  END IF;
END $$;

COMMENT ON COLUMN public.sessions.partner_id IS
  'Venue: the featured_partners row this session is hosted at (T-GYM1). '
  'Writable only by set_session_partner; revoked from authenticated in 162.';

-- capture_join_session_live.sql
--
-- READ ONLY. Run in the Supabase SQL editor and paste the output back.
-- Nothing here writes, locks or changes anything.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY 185 CANNOT BE WRITTEN WITHOUT THIS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 185 adds a recipient check to join_session, which means CREATE OR REPLACE
-- with the FULL body. The repo's newest definition is migration 119 (120 only
-- touches join_session_as_guest). Copying 119's body and adding four lines
-- would be the obvious move.
--
-- IT IS ALSO HOW A LIVE-ONLY CHANGE GETS SILENTLY REVERTED. This repository
-- has been bitten by repo-vs-live drift more than once:
--
--   * protect_verified_instructor() is live, SECURITY DEFINER, and appears in
--     NO migration. Migration 177 exists only to capture it, and it was found
--     by a behavioural probe, not by reading files.
--   * invite_tokens itself was live with no repo record until migration 131
--     backfilled its definition verbatim.
--   * public.users has at least six policies live and two in the repo.
--
-- join_session gates EVERY join in the app. Rewriting it from a file that may
-- be behind production is not a risk worth taking to save one round trip.
--
-- So: capture the live body, diff it against 119, and write 185 against what
-- is actually there.

SELECT
  p.oid::regprocedure::text                        AS signature,
  p.prosecdef                                      AS security_definer,
  pg_get_function_identity_arguments(p.oid)        AS arguments,
  -- The whole point. Paste this back verbatim.
  pg_get_functiondef(p.oid)                        AS definition,
  length(pg_get_functiondef(p.oid))                AS definition_length,
  -- If this is false, the repo is BEHIND production and 119's body must not be
  -- used as the base. If true, 119 is a faithful base and 185 can be written
  -- from it -- but say so explicitly rather than assuming.
  (pg_get_functiondef(p.oid) ~ 'T-SEC1.*invite-only sessions require a valid')
                                                   AS matches_119_marker_comment,
  -- Does the live body ALREADY know about a recipient? If it does, someone has
  -- been here before and 185 is a different migration than the one planned.
  (pg_get_functiondef(p.oid) ~* 'recipient')       AS already_mentions_recipient
FROM pg_proc p
WHERE p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure;

-- Second result set is not possible in the editor (it shows the last statement
-- only), so run this one separately if the first shows anything unexpected:
--
--   SELECT pg_get_functiondef(p.oid) FROM pg_proc p
--    WHERE p.oid = 'public.join_session_as_guest(uuid, text, text, text, text)'::regprocedure;
--
-- join_session_as_guest ALSO accepts an invite token (migration 120), and a
-- guest has no user id at all -- so an addressed token has nothing to match
-- against on that path. See 185's header for why that matters.

-- capture_join_session_live.sql
--
-- READ ONLY. Run in the Supabase SQL editor and paste the output back.
-- Nothing here writes, locks or changes anything. ONE result set, TWO rows.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY 185 CANNOT BE WRITTEN WITHOUT THIS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 185 adds a recipient check to BOTH join functions, which means CREATE OR
-- REPLACE with each FULL body. The repo's newest definitions are migration 119
-- (join_session) and migration 120 (join_session_as_guest). Copying those and
-- adding four lines each would be the obvious move.
--
-- IT IS ALSO HOW A LIVE-ONLY CHANGE GETS SILENTLY REVERTED. This repository has
-- been bitten by repo-vs-live drift three times:
--
--   * protect_verified_instructor() is live, SECURITY DEFINER, and appears in
--     NO migration. Migration 177 exists only to capture it, and it was found
--     by a behavioural probe, not by reading files.
--   * invite_tokens was live with no repo record until migration 131
--     backfilled its definition verbatim.
--   * public.users has at least six policies live against two in the repo.
--
-- Between them these two functions gate EVERY join in the app, for accounts and
-- for guests. Rewriting them from files that may be behind production is not a
-- risk worth taking to save one round trip.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BOTH FUNCTIONS, BECAUSE A GATE ON ONE PATH IS NOT A GATE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- join_session_as_guest also accepts an invite token (migration 120), and a
-- guest has no user id -- so an addressed token has nothing to match against
-- there. A recipient check in join_session alone would be bypassable by taking
-- the guest route, which is the same shape as T-SEC1 (join_session never
-- checked join_policy, so a direct RPC call joined private sessions) and the
-- same shape as checking only validate_invite_token and not the write path.
--
-- DECIDED: the guest path REFUSES an addressed token. An invite addressed to a
-- specific account cannot be accepted by someone not signed into it. Tokens
-- with recipient_id IS NULL keep today's behaviour on BOTH paths, so public
-- share links still work for guests.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- READ THE COLUMNS, NOT JUST THE VERDICTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `definition` is the thing to paste back. The boolean columns beside it are
-- there so an unexpected answer is visible rather than inferred:
--
--   matches_repo_marker      false => the repo is BEHIND production and its
--                                     body must NOT be used as the base
--   already_mentions_recipient true => someone has been here before and 185 is
--                                     a different migration than planned
--   found                    false => the signature is wrong; a capture that
--                                     matched nothing must not read as "clean"

WITH targets(label, sig) AS (
  VALUES
    ('join_session',          'public.join_session(uuid, uuid, text, text)'),
    ('join_session_as_guest', 'public.join_session_as_guest(uuid, text, text, text, text)')
)
SELECT
  t.label,
  (p.oid IS NOT NULL)                                   AS found,
  p.prosecdef                                           AS security_definer,
  pg_get_function_identity_arguments(p.oid)             AS arguments,
  length(pg_get_functiondef(p.oid))                     AS definition_length,
  CASE t.label
    WHEN 'join_session'
      THEN pg_get_functiondef(p.oid) ~ 'T-SEC1.*invite-only sessions require a valid'
    ELSE pg_get_functiondef(p.oid) ~ 'guest_token'
  END                                                   AS matches_repo_marker,
  (pg_get_functiondef(p.oid) ~* 'recipient')            AS already_mentions_recipient,
  -- PASTE THIS BACK, both rows, verbatim.
  pg_get_functiondef(p.oid)                             AS definition
FROM targets t
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(t.sig)
ORDER BY t.label;

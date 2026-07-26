-- 139_fix_sessions_public_comment.sql
--
-- COSMETIC ONLY — no behavior change, no grants, nothing destructive.
--
-- Migration 138 shipped with a stale COMMENT ON VIEW: it said invite_only rows
-- are "location-stubbed". That described an earlier design. The migration that
-- actually shipped implements decision X — invite_only sessions are EXCLUDED
-- from sessions_public entirely (WHERE join_policy IS DISTINCT FROM
-- 'invite_only'), not location-stubbed. This re-runs COMMENT ON VIEW with text
-- that matches what the view actually does.
--
-- Why a new migration instead of editing 138's file: 138 is already applied to
-- production. Rewriting an applied migration's SQL breaks the append-only audit
-- trail (it will never re-run) and would leave the file disagreeing with what
-- ran. A COMMENT is idempotent metadata, so correcting it forward in 139 keeps
-- the repo append-only AND makes the live catalog comment accurate.

COMMENT ON VIEW public.sessions_public IS
  'RLS-H4 anon-facing projection of public.sessions. Coordinates rounded to 3dp; '
  'invite_only sessions EXCLUDED entirely (not location-stubbed); '
  'payment_instructions, verification, and operational columns excluded by '
  'omission. New sessions columns are PRIVATE until deliberately added here. '
  'Owner-executed (security_invoker=false) so it survives the Gate 3 anon revoke.';

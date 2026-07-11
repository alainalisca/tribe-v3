-- Migration 118 — T-SEC5 final step (the email revoke)
--
-- Removes the anon + authenticated SELECT grant on public.users.email. A live
-- anon-key REST probe confirmed email returns HTTP 200 to a logged-out caller,
-- exposing all 68 users' real addresses — this closes that live PII exposure.
--
-- Targeted column REVOKE (not the 066/067 regenerate pattern): REVOKE SELECT ON
-- <table> does not clear column-level grants, and email is held as a column
-- grant (no table-level grant since 067). Same instrument as migrations 113/115.
--
-- PREREQUISITES — all live before this runs (rolling-safe, all DONE):
--   * Self reads use the auth session (auth.users), not public.users (Batch 1).
--   * Admin lists read via the is_app_admin()-gated service-role API (Batch 2).
--   * Tribe.OS attendance/audit/revenue read via definer/service-role (Batch 3).
--   * reminders + post-session-followups crons are service-role (Batch 4).
--   * send-attendance-notification reads email via service-role, behind an
--     ownership gate (Batch 5).
-- The pre-revoke sweep confirmed ZERO remaining anon/authenticated readers of
-- public.users.email.
--
-- After this: service_role (server routes, webhooks, crons) and SECURITY DEFINER
-- functions still read email — the revoke only touches anon + authenticated.
--
-- Reversible: GRANT SELECT (email) ON public.users TO authenticated, anon;

REVOKE SELECT (email) ON public.users FROM authenticated;

REVOKE SELECT (email) ON public.users FROM anon;

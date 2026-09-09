-- 157_grant_onboarding_columns.sql
--
-- 156 added onboarding_completed_at and dismissed_banners to public.users and
-- granted neither. public.users is under column-level SELECT grants (066,
-- extended by 067): the table-level grant is revoked and SELECT re-granted
-- column by column, so a column added afterwards is invisible to non-service
-- callers until it is granted explicitly. 066's header states this rule; it
-- lived in a comment and was missed.
--
-- Symptom: fetchOnboardingState fails with 42501 permission denied for table
-- users, and every caller treats the failure as "unknown" and renders nothing
-- -- the first-run introduction, all five dismissible banners, and the What's
-- New badge. Confirmed against production with has_column_privilege:
--   has_column_privilege('authenticated','public.users','onboarding_completed_at','SELECT') = false
--   has_column_privilege('authenticated','public.users','dismissed_banners','SELECT')       = false
--
-- 156 now carries the same two GRANT lines, for a database rebuilt from the
-- migrations. This migration exists because 156 has already been applied to
-- production, where re-running it would not re-grant anything.
--
-- Idempotent: granting an already-granted column is a no-op.

GRANT SELECT (onboarding_completed_at, dismissed_banners)
  ON public.users TO authenticated;

GRANT SELECT (onboarding_completed_at, dismissed_banners)
  ON public.users TO anon;

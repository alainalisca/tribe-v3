-- ════════════════════════════════════════════════════════════════════════════
-- 142 UNFLAGGED ACCOUNT -- PRODUCTION, READ ONLY
--
-- Paste this WHOLE file into the Supabase SQL editor, in ONE paste.
--
-- On 2026-09-28, 12 of the 13 accounts migration 142 flagged as test accounts
-- were still flagged; one exists and is no longer flagged. This returns that
-- account's EMAIL and nothing else, so Al can decide whether it was unflagged on
-- purpose (for example, now a real account) or should be flagged again.
-- 142_flag_founder_test_accounts in verify-migration-state.sql stays MISSING
-- until the 13 are all flagged or 142's list is formally amended.
--
--   * Returns one column, email, one row per such account. Expected: one row.
--   * `BEGIN READ ONLY`: any write is a runtime error (25006). `ROLLBACK` at
--     the end.
--   * The 13 ids are copied from supabase/migrations/142_flag_founder_test_accounts.sql.
--
-- This file DOES return personal data (an email), unlike the other recon files
-- here, because the decision needs it. Do not paste its output anywhere shared.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN READ ONLY;

SELECT u.email
  FROM public.users u
 WHERE u.id = ANY (ARRAY[
  'eaff348f-5df3-4df5-bd80-69ec233aad0e',
  'd7cc0e7e-44db-4e57-80d3-a82f6e90bff4',
  'd92d4816-af5d-42ae-9d33-02f330e221bd',
  '7ad0c072-6519-481d-ba8c-bab2526b3449',
  '3af48aac-3f33-4055-ab6a-354791d5b1bb',
  '00bbef64-123f-432f-bf13-0c7572137c9d',
  'd479736b-bfe1-4f92-9a0f-8d5871859400',
  'a59598c6-42a0-4b22-aa3d-e61ea778a841',
  'c5d7e023-bc9d-4c5d-904b-3f7844943672',
  'ddf4ea3c-3aab-411b-8960-9e57d9bcd526',
  'fd7dbf6a-6198-42fe-bb1c-347af3d111bd',
  '8062bb54-d7bd-4946-bbe7-82b9330da69e',
  '673834b4-d9be-4782-86c9-ff27376233a7'
 ]::uuid[])
   AND u.is_test_account IS NOT TRUE
 ORDER BY u.email;

ROLLBACK;

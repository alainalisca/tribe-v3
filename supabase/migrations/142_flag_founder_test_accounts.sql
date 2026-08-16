-- 142: flag founder-owned and test accounts (additive only)
-- Sets is_test_account = true for 13 accounts confirmed by the founder on
-- 2026-08-08 (candidate scan: founder email identities, plus-addressed and
-- disposable test emails, security-test probes, and one confirmed founder
-- dev-domain account). No rows are deleted and no other column is touched.
-- Expected affected row count: exactly 13.

BEGIN;

UPDATE users
SET is_test_account = true
WHERE id IN (
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
);

COMMIT;

-- Migration 052 — Filter seeded test accounts out of public surfaces.
--
-- Adds public.users.is_test_account so the home-page Featured Instructors
-- carousel, the /instructors browse page, partner instructor rosters, and
-- any other public instructor listing can exclude obvious dummy accounts.
-- Default false so live users are unaffected; the cleanup pass on
-- 2026-04-28 flags the known seeds.
--
-- Rollout note: apply this BEFORE deploying the matching code (queries that
-- filter on is_test_account will fail until the column exists).

alter table public.users
  add column if not exists is_test_account boolean not null default false;

-- Flag the known seeded test accounts identified during the relaunch audit.
-- The Darian/darianraphael67 account is intentionally NOT in this list — that
-- looks like a real instructor whose display name happens to contain "test";
-- handle by asking him to update his profile, not by flagging.
update public.users
   set is_test_account = true
 where id in (
   '089ff73b-0c99-4c1b-9744-dae7b3ca39d2',  -- Testing 321 (alainalisca+test2)
   'cfa856b2-ae27-4f1f-a6b5-366aea1f5dd8',  -- test account (test@tribe.com)
   'c859a858-d213-4812-87b6-9b2fadc5513b',  -- Al Test Account 1 (alainalisca.pt)
   'e7e216fc-903a-4b40-bed9-aef455c5529b',  -- Veralin (alainalisca+test3)
   'b84b2efb-bfcf-4fca-9325-6ed244f6f882',  -- Reggie (alainalisca+test1)
   '19fe73ea-0813-4aa1-8069-e305d42c7b70',  -- testy (alainalisca+test4)
   '1f8edc4f-9579-4ca3-98ba-08bc87c9220c'   -- test (alainalisca+test5)
 );

-- Partial index supporting the common-path filter "where is_test_account = false".
create index if not exists users_is_test_account_false_idx
  on public.users (id)
  where is_test_account = false;

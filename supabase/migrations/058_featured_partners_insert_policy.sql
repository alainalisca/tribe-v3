-- 058_featured_partners_insert_policy.sql
--
-- Migration 018 created `featured_partners` with SELECT, UPDATE, and ALL
-- (admin) policies but NO INSERT policy for non-admin users. Result: any
-- authenticated user submitting the affiliate application form (/partners/
-- apply) hits "new row violates row-level security policy for table
-- featured_partners" — the same shape of bug as rate_limits and
-- storefront-banners that we've been fixing this week.
--
-- Fix: allow authenticated users to insert their own pending application.
-- Constraints in WITH CHECK:
--   - user_id must equal auth.uid() (you can only apply for yourself)
--   - status must be 'pending' (clients can't pre-approve themselves)
-- The existing UNIQUE constraint on user_id (from migration 018) prevents
-- duplicate applications from the same user.
--
-- Approval (status -> 'active') and other tier/billing fields stay admin-
-- only via the existing "Admins manage all" policy.

drop policy if exists "Authenticated users can apply for partnership" on featured_partners;
create policy "Authenticated users can apply for partnership"
  on featured_partners for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
  );

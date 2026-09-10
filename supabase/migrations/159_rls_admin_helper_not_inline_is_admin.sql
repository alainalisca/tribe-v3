-- 159_rls_admin_helper_not_inline_is_admin.sql
--
-- Five tables refuse every client read with
--   42501 permission denied for table users
-- because their RLS policies inline
--   EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
-- and migration 113 revoked users.is_admin from authenticated AND anon.
-- Confirmed 2026-09-10: has_column_privilege(...,'is_admin','SELECT') is false
-- for both roles.
--
-- Postgres checks column privileges for the whole policy expression, so the OR
-- does NOT short-circuit on the permissive branch being true. A gym that is
-- status='active' is still refused, because evaluating the other half of the OR
-- requires a column the caller cannot read.
--
-- The fix is public.is_app_admin() (add_admin_rls.sql): SECURITY DEFINER STABLE,
-- so it reads is_admin as its owner, and already granted to authenticated by
-- migration 112. This is exactly the situation it exists for; these policies
-- predate it.
--
-- MEASURED BEFORE (anon, live API, 2026-09-10):
--   featured_partners      401   partner_instructors  401
--   community_news         401   local_fitness_events 401
--   community_bulletin     401   popular_routes       200
--
-- WHY popular_routes IS NOT HERE, AND WHY THAT MATTERS
-- It has the identical policy shape -- a permissive read policy plus an
-- "Admins can manage" FOR ALL that inlines the same EXISTS -- and it is NOT
-- broken. Its read policy is USING (true), a constant the planner folds away
-- before the admin branch ever needs a privilege check; the other four test a
-- column (is_active = true, status = 'approved'), so the full OR gets built and
-- the check fires.
--
-- That difference is invisible from reading the SQL. It was decided by probing
-- the live API, and popular_routes is excluded because the probe said 200, not
-- because the SQL looked safe. Reading the policies would have "fixed" a table
-- that was never broken. Probe before you touch the next one.
--
-- partner_instructors is NOT here either. It is broken, but by cascade: its own
-- policies never name users, and what refuses the read is "Partners manage own
-- instructors" reading featured_partners. Fixing featured_partners below is
-- expected to clear it, and the after-probe in the PR records whether it did.
-- Writing it a speculative statement would be fixing a table by a mechanism not
-- shown to apply to it.
--
-- Behaviour is unchanged for every role: same predicate, same answer, read
-- through a function that is allowed to read it.

-- ── featured_partners ───────────────────────────────────────────────────────
-- Two offending policies: the SELECT policy from 019, and the FOR ALL admin
-- policy from 018 (FOR ALL covers SELECT, so both fire on a read).
DROP POLICY IF EXISTS "Anyone can read active or admin reads all" ON public.featured_partners;
CREATE POLICY "Anyone can read active or admin reads all" ON public.featured_partners
  FOR SELECT USING (status = 'active' OR public.is_app_admin());

DROP POLICY IF EXISTS "Admins manage all" ON public.featured_partners;
CREATE POLICY "Admins manage all" ON public.featured_partners
  FOR ALL USING (public.is_app_admin());

-- ── community_news ──────────────────────────────────────────────────────────
-- Read policy (is_active = true) is fine; the FOR ALL admin policy is what
-- refuses the read, because FOR ALL covers SELECT.
DROP POLICY IF EXISTS "Admins can manage news" ON public.community_news;
CREATE POLICY "Admins can manage news" ON public.community_news
  FOR ALL USING (public.is_app_admin());

-- ── local_fitness_events ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage events" ON public.local_fitness_events;
CREATE POLICY "Admins can manage events" ON public.local_fitness_events
  FOR ALL USING (public.is_app_admin());

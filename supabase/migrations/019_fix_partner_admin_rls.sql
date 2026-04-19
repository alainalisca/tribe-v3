-- Fix: Allow admins to read ALL partner records (not just active ones)
-- The existing "Anyone can read active partners" policy only exposes status='active' rows.
-- The "Admins manage all" FOR ALL policy covers INSERT/UPDATE/DELETE but NOT SELECT in Postgres.

-- Replace the restrictive SELECT policy with one that also lets admins through
DROP POLICY IF EXISTS "Anyone can read active partners" ON featured_partners;

CREATE POLICY "Anyone can read active or admin reads all" ON featured_partners
  FOR SELECT USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

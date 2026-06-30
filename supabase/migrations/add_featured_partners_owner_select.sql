-- BUG-210 followup: instructors must be able to read their OWN featured_partners
-- row regardless of status. The existing SELECT policy only exposes rows where
-- status = 'active' OR the caller is admin, so a 'pending' applicant cannot read
-- their own row — which hides the self-activation UI. This additive policy
-- (RLS policies are OR'd) grants owner read on their own row at any status.
-- Idempotent. MUST be run on the live DB.
DROP POLICY IF EXISTS "Owner can read own partner record" ON public.featured_partners;
CREATE POLICY "Owner can read own partner record"
  ON public.featured_partners FOR SELECT
  USING (auth.uid() = user_id);

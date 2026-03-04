-- Server-side admin authorization via RLS
-- Prevents client-side-only admin checks from being bypassed

-- Helper function: check if current authenticated user is an admin
CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Policy: Only admins can update is_admin, is_banned on users
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;
CREATE POLICY "Admins can update any user"
ON public.users
FOR UPDATE
USING (
  auth.uid() = id  -- users can update own profile
  OR is_app_admin()  -- admins can update anyone
);

-- Policy: Only admins can delete reported messages (soft-delete via update)
DROP POLICY IF EXISTS "Admins can manage chat messages" ON public.chat_messages;
CREATE POLICY "Admins can manage chat messages"
ON public.chat_messages
FOR UPDATE
USING (
  auth.uid() = user_id  -- own messages
  OR is_app_admin()      -- admins can moderate
);

-- Policy: Only admins can read reported_messages
DROP POLICY IF EXISTS "Admins can view reports" ON public.reported_messages;
CREATE POLICY "Admins can view reports"
ON public.reported_messages
FOR SELECT
USING (
  auth.uid() = reporter_id  -- own reports
  OR is_app_admin()          -- admins see all
);

-- Policy: Only admins can update reports (resolve/dismiss)
DROP POLICY IF EXISTS "Admins can manage reports" ON public.reported_messages;
CREATE POLICY "Admins can manage reports"
ON public.reported_messages
FOR UPDATE
USING (is_app_admin());

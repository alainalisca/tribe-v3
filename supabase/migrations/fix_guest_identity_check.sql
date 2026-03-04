-- Fix guest identity verification for DELETE operations
-- Previously check_guest_identity() returned TRUE unconditionally

-- Step 1: Add guest_token column for secure guest identification
ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS guest_token UUID DEFAULT gen_random_uuid();

-- Step 2: Replace the insecure function with one that verifies the token
CREATE OR REPLACE FUNCTION check_guest_identity()
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify the x-guest-token header matches the row's guest_token
  RETURN (
    current_setting('request.headers', true)::json->>'x-guest-token'
  ) IS NOT NULL AND (
    current_setting('request.headers', true)::json->>'x-guest-token'
  )::UUID = guest_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Update DELETE policy to require token verification
DROP POLICY IF EXISTS "Allow guests to delete their own participation" ON session_participants;

CREATE POLICY "Allow guests to delete their own participation"
ON session_participants
FOR DELETE
USING (
  is_guest = true
  AND user_id IS NULL
  AND check_guest_identity()
);

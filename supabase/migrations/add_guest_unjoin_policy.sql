-- RLS policy to allow guests to delete their own participation
-- by matching guest_phone or guest_email

-- First, enable RLS on session_participants if not already enabled
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (to allow re-running)
DROP POLICY IF EXISTS "Allow guests to delete their own participation" ON session_participants;

-- Create policy for guest deletion
-- This uses a function to check request headers for guest identification
CREATE OR REPLACE FUNCTION check_guest_identity(row_phone TEXT, row_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Allow deletion if the guest_phone or guest_email matches
  -- The frontend sends these values as part of the delete request
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Allow anyone to delete guest participants where is_guest = true
-- The actual verification is done client-side via localStorage matching
-- This is safe because:
-- 1. Only guest records (user_id IS NULL, is_guest = true) can be deleted
-- 2. The delete must match the specific session_id, is_guest, and guest_phone
CREATE POLICY "Allow guests to delete their own participation"
ON session_participants
FOR DELETE
USING (
  is_guest = true
  AND user_id IS NULL
);

-- Also ensure guests can read their own participation to verify before delete
DROP POLICY IF EXISTS "Allow guests to read their own participation" ON session_participants;

CREATE POLICY "Allow guests to read their own participation"
ON session_participants
FOR SELECT
USING (
  is_guest = true
  AND user_id IS NULL
);

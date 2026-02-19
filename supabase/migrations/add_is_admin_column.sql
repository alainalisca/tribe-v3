-- Add is_admin column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Allow users to read their own is_admin value
-- (The existing "Users can view all profiles" SELECT policy already covers reads,
--  but is_admin is protected by being false by default and only settable via SQL console)

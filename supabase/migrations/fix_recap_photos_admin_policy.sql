-- Fix: Replace hardcoded email with is_app_admin() function
-- The original policy checked users.email = 'alainalisca@aplusfitnessllc.com'
-- This uses the same is_app_admin() pattern as all other admin policies

DROP POLICY IF EXISTS "Admins can moderate recap photos" ON session_recap_photos;

CREATE POLICY "Admins can moderate recap photos"
ON session_recap_photos FOR ALL
TO authenticated
USING (is_app_admin());

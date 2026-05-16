-- 073_list_gym_coaches.sql
-- Closes Week 3 audit finding M: lib/dal/gymCoaches.ts listCoachesForGym
-- returns only the caller's own row under the recursion-safe policy
-- `gym_coaches_member_select USING (user_id = auth.uid())`.
--
-- The "list every coach in my gym" need cannot be expressed by a
-- single RLS policy on gym_coaches without recursion, because the
-- natural policy ("you can see rows for gyms you're in") references
-- gym_coaches inside its own USING clause. We hit that exact bug in
-- migration 068 and hotfixed it in commit dd0aac5.
--
-- The pattern that breaks the recursion: a SECURITY DEFINER function
-- that checks gym_coaches membership ONCE at the top, then returns
-- the full roster directly. The function bypasses RLS internally
-- (SECURITY DEFINER), so it can read every row of gym_coaches without
-- triggering the policy. Callers who are not coaches in the named gym
-- get RAISE 42501 'unauthorized'.
--
-- The function joins users for display fields the UI needs (name,
-- email, avatar_url). Those columns must be granted to authenticated
-- via the post-066/067 GRANT list — which they are (name and email
-- are not on the restricted list; avatar_url is universally public).

CREATE OR REPLACE FUNCTION public.list_gym_coaches(p_gym_id uuid)
RETURNS TABLE (
  gym_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  user_name text,
  user_email text,
  user_avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- Membership gate: caller must be in the gym. Service-role
  -- (auth.uid() IS NULL) bypasses for backend admin work.
  IF auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.gym_coaches gc
      WHERE gc.gym_id = p_gym_id AND gc.user_id = auth.uid()
    )
  THEN
    RAISE EXCEPTION 'unauthorized: caller is not a coach in gym %', p_gym_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    gc.gym_id,
    gc.user_id,
    gc.role,
    gc.created_at,
    u.name AS user_name,
    u.email AS user_email,
    u.avatar_url AS user_avatar_url
  FROM public.gym_coaches gc
  LEFT JOIN public.users u ON u.id = gc.user_id
  WHERE gc.gym_id = p_gym_id
  ORDER BY
    -- Owner first, then others by created_at asc.
    CASE WHEN gc.role = 'owner' THEN 0 ELSE 1 END,
    gc.created_at ASC;
END
$func$;

GRANT EXECUTE ON FUNCTION public.list_gym_coaches(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_gym_coaches IS
  'Returns every coach in p_gym_id with their display profile (name, email, avatar). SECURITY DEFINER + membership gate at the top breaks the recursion that would happen if the same thing were expressed as an RLS policy. Owner row sorted first. Caller MUST be a coach in the gym; mismatch raises 42501.';

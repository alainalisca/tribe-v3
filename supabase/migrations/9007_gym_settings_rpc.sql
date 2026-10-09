-- CLASS: A
-- 9007_gym_settings_rpc.sql
-- Class A additive migration: SECURITY DEFINER function for gym settings.
--
-- Problem
-- -------
-- public.gyms has only a SELECT policy (gyms_owner_select, migration 068).
-- There is no UPDATE policy, so updateGym's .update().eq('id').select().single()
-- matches 0 rows under RLS and throws "Cannot coerce the result to a single
-- JSON object". Adding a broad UPDATE policy is dangerous because owners must
-- never be able to edit tribe_os_tier, tribe_os_status, stripe IDs, or
-- granted_* columns (those are set by service-role webhooks/admin only).
--
-- Solution
-- --------
-- A SECURITY DEFINER function that:
--   1. Verifies the caller owns the gym (owner_user_id = auth.uid())
--   2. Validates the inputs
--   3. Updates ONLY the four safe settings columns
--   4. Returns the updated row
--
-- The tier/stripe/grant columns stay on the existing service-role path.

CREATE FUNCTION public.update_gym_settings(
  p_gym_id uuid,
  p_name text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_default_currency text DEFAULT NULL,
  p_intelligence_email_enabled boolean DEFAULT NULL
)
RETURNS SETOF public.gyms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Ownership check
  SELECT owner_user_id INTO v_owner_id
    FROM public.gyms
    WHERE id = p_gym_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gym_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'owner_only' USING ERRCODE = 'P0003';
  END IF;

  -- Validate name
  IF p_name IS NOT NULL THEN
    p_name := btrim(p_name);
    IF p_name = '' OR char_length(p_name) > 120 THEN
      RAISE EXCEPTION 'invalid_name' USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- Validate currency
  IF p_default_currency IS NOT NULL AND p_default_currency NOT IN ('USD', 'COP') THEN
    RAISE EXCEPTION 'invalid_currency: must be USD or COP' USING ERRCODE = 'P0004';
  END IF;

  -- Validate timezone
  IF p_timezone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'invalid_timezone: %', p_timezone USING ERRCODE = 'P0005';
  END IF;

  -- Update only the four safe columns; NULL = leave unchanged
  UPDATE public.gyms SET
    name = COALESCE(p_name, name),
    timezone = COALESCE(p_timezone, timezone),
    default_currency = CASE
      WHEN p_default_currency IS NOT NULL THEN p_default_currency
      ELSE default_currency
    END,
    intelligence_email_enabled = COALESCE(p_intelligence_email_enabled, intelligence_email_enabled),
    updated_at = now()
  WHERE id = p_gym_id;

  RETURN QUERY SELECT * FROM public.gyms WHERE id = p_gym_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_gym_settings(uuid, text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_gym_settings(uuid, text, text, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.update_gym_settings IS
  'Owner-only gym settings update. Updates name, timezone, default_currency, '
  'and intelligence_email_enabled. Tier/status/stripe columns are NOT exposed '
  'here — those go through service-role admin paths only.';

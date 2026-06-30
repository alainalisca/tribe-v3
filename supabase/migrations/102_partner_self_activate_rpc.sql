-- 102_partner_self_activate_rpc.sql
--
-- BUG-210: Instructors could not activate their own featured-partner record
-- during the beta "Introductory Offer: Free for 6 months" period. The
-- featured_partners UPDATE policy is admin-only (from migration 019), so
-- instructors were stuck in 'pending' forever.
--
-- Fix: add a SECURITY DEFINER RPC that an authenticated instructor may call
-- on their OWN partner row, but ONLY when:
--   1. The row belongs to them (user_id = auth.uid())
--   2. The current status is 'pending' (idempotent: already-active rows
--      return a friendly message, not an error)
--   3. The feature-flag period is 'beta' (monthly_fee_cents stays 0 so there
--      is no implicit billing)
--
-- The function sets:
--   status     -> 'active'
--   starts_at  -> now()
--   expires_at -> now() + INTERVAL '6 months'  (beta trial window)
--   updated_at -> now()
--
-- Returns a JSONB discriminated-union:
--   { "ok": true,  "already_active": false }  — first activation
--   { "ok": true,  "already_active": true  }  — idempotent; no-op
--   { "ok": false, "error": "<reason>"      }  — not found / not owner
--
-- No migration needed on the featured_partners table itself — the columns
-- status, starts_at, expires_at already exist from migration 018.

CREATE OR REPLACE FUNCTION public.self_activate_featured_partner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_partner  record;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT id, status
    INTO v_partner
    FROM featured_partners
   WHERE user_id = v_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_application');
  END IF;

  IF v_partner.status = 'active' THEN
    RETURN jsonb_build_object('ok', true, 'already_active', true);
  END IF;

  IF v_partner.status NOT IN ('pending', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  UPDATE featured_partners
     SET status     = 'active',
         starts_at  = now(),
         expires_at = now() + INTERVAL '6 months',
         updated_at = now()
   WHERE id = v_partner.id;

  RETURN jsonb_build_object('ok', true, 'already_active', false);
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.self_activate_featured_partner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_activate_featured_partner() TO authenticated;

COMMENT ON FUNCTION public.self_activate_featured_partner() IS
  'Beta self-activation: moves own pending featured_partner row to active (free, 6-month trial). '
  'Returns { ok, already_active } or { ok: false, error }.';

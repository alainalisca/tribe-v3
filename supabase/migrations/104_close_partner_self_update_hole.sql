-- 104_close_partner_self_update_hole.sql
--
-- SECURITY FIX (audit 2026-06-30): featured-partner self-activation hole.
--
-- Migration 018 created:
--   CREATE POLICY "Partners manage own record" ON featured_partners
--     FOR UPDATE USING (auth.uid() = user_id);
-- with NO `WITH CHECK`, and migration 019 only changed the SELECT policy.
-- So the owner-UPDATE policy is still live: any instructor with a
-- featured_partners row can directly UPDATE their own row from the client and
-- set status -> 'active', extend expires_at, or zero monthly_fee_cents,
-- bypassing admin approval (and, once billing is live, payment). Migration
-- 102's header claim that "the UPDATE policy is admin-only" is false.
--
-- RLS WITH CHECK cannot compare against the OLD row, so we cannot express
-- "owners may edit profile fields but not status/billing columns" as a policy.
-- No client path needs direct owner UPDATE: activation goes through the
-- self_activate_featured_partner SECURITY DEFINER RPC (which runs as the
-- function owner and bypasses RLS), and admin edits go through the existing
-- "Admins manage all" FOR ALL policy. So we drop the owner-UPDATE policy.

DROP POLICY IF EXISTS "Partners manage own record" ON featured_partners;

-- Harden the activation RPC:
--   * Restrict to status = 'pending' only (a 'paused' partner reactivating is
--     now an admin action, not a free self-serve reset).
--   * Explicitly set monthly_fee_cents = 0 so a previously-priced row cannot
--     carry a stale fee into the free beta window.
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

  IF v_partner.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  UPDATE featured_partners
     SET status            = 'active',
         starts_at         = now(),
         expires_at        = now() + INTERVAL '6 months',
         monthly_fee_cents = 0,
         updated_at        = now()
   WHERE id = v_partner.id;

  RETURN jsonb_build_object('ok', true, 'already_active', false);
END;
$$;

REVOKE ALL ON FUNCTION public.self_activate_featured_partner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_activate_featured_partner() TO authenticated;

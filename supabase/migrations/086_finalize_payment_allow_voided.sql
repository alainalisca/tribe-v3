-- 086_finalize_payment_allow_voided.sql
-- Tier-1 audit fix (Crit-11): Wompi can report a transaction as VOIDED,
-- and lib/payments/wompi.ts mapWompiStatus() correctly maps that to the
-- 'voided' PaymentStatus (a real, displayed status — see app/earnings,
-- app/payment/confirm, lib/dal/admin). But finalize_payment (migration
-- 047) only accepted ('approved','declined','error','processing'), so a
-- voided transaction returned 'invalid_status', the webhook 400'd, and
-- the payment row stayed stuck in 'processing'. On retry the create
-- route deletes the stale 'processing' row and the buyer can pay again
-- while the original void is never reconciled — a real double-pay path.
--
-- Fix: add 'voided' to the accepted set. 'voided' is non-approved, so
-- the participant-confirmation (step 4) and product fulfillment (step 5)
-- branches — both gated on p_new_status = 'approved' — are correctly
-- skipped; the row simply transitions to the terminal 'voided' status.
-- Body is otherwise identical to 047.

DROP FUNCTION IF EXISTS finalize_payment(text, bigint, text, text);

CREATE OR REPLACE FUNCTION finalize_payment(
  p_gateway_payment_id text,
  p_expected_amount_cents bigint,
  p_gateway text,
  p_new_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_session_id uuid;
  v_user_id uuid;
  v_amount_cents bigint;
  v_current_status text;
  v_participant_added boolean := false;
  v_order_id uuid;
  v_order_product_id uuid;
  v_fulfillment_applied boolean := false;
  v_fulfillment_method text;
  v_session_credits int;
  v_package_valid_days int;
BEGIN
  IF p_new_status NOT IN ('approved', 'declined', 'error', 'processing', 'voided') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  -- 1. Locate the payment row and lock it so concurrent webhooks serialize.
  --    Prefer matching on gateway_payment_id (the canonical idempotency handle).
  --    Stripe also stores the payment intent id separately; if the first lookup
  --    misses we try stripe_payment_intent_id as a fallback.
  SELECT id, session_id, participant_user_id, amount_cents, status
    INTO v_payment_id, v_session_id, v_user_id, v_amount_cents, v_current_status
  FROM payments
  WHERE gateway_payment_id = p_gateway_payment_id
  FOR UPDATE;

  IF v_payment_id IS NULL AND p_gateway = 'stripe' THEN
    SELECT id, session_id, participant_user_id, amount_cents, status
      INTO v_payment_id, v_session_id, v_user_id, v_amount_cents, v_current_status
    FROM payments
    WHERE stripe_payment_intent_id = p_gateway_payment_id
    FOR UPDATE;
  END IF;

  IF v_payment_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'payment_not_found');
  END IF;

  -- 2. Amount-tamper check (SEC-04). If the webhook amount differs from what
  --    we stored at intent creation, reject and roll back. Skip only if the
  --    caller explicitly passes NULL (declined webhook with no amount field).
  IF p_expected_amount_cents IS NOT NULL
     AND v_amount_cents IS NOT NULL
     AND p_expected_amount_cents <> v_amount_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'amount_mismatch',
      'expected', v_amount_cents,
      'received', p_expected_amount_cents
    );
  END IF;

  -- 3. Idempotent status update. If status hasn't changed, we still report
  --    success because the gateway will retry on 5xx.
  IF v_current_status IS DISTINCT FROM p_new_status THEN
    UPDATE payments
    SET status = p_new_status,
        gateway_payment_id = COALESCE(gateway_payment_id, p_gateway_payment_id),
        updated_at = NOW()
    WHERE id = v_payment_id;
  END IF;

  -- 4. Participant confirmation on approved payments only.
  IF p_new_status = 'approved' AND v_session_id IS NOT NULL AND v_user_id IS NOT NULL THEN
    INSERT INTO session_participants (session_id, user_id, status, joined_at)
      VALUES (v_session_id, v_user_id, 'confirmed', NOW())
      ON CONFLICT (session_id, user_id) DO UPDATE
        SET status = 'confirmed';

    -- Best-effort refresh of the cached count.
    UPDATE sessions
    SET current_participants = (
      SELECT count(*) FROM session_participants
      WHERE session_id = v_session_id AND status = 'confirmed'
    )
    WHERE id = v_session_id;

    v_participant_added := true;
  END IF;

  -- 5. Product order fulfillment on approved payments only (skip if the
  --    storefront schema isn't deployed — keeps the RPC safe on installs
  --    without products/product_orders tables).
  IF p_new_status = 'approved' AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_orders'
  ) THEN
    SELECT id, product_id INTO v_order_id, v_order_product_id
    FROM product_orders
    WHERE payment_id = v_payment_id;

    IF v_order_id IS NOT NULL THEN
      UPDATE product_orders
        SET payment_status = 'approved',
            updated_at = NOW()
        WHERE id = v_order_id;

      -- Inspect the product to decide fulfillment path.
      SELECT fulfillment_method, session_credits, package_valid_days
        INTO v_fulfillment_method, v_session_credits, v_package_valid_days
      FROM products WHERE id = v_order_product_id;

      IF v_fulfillment_method = 'digital' THEN
        UPDATE product_orders
          SET fulfillment_status = 'completed',
              fulfilled_at = NOW()
          WHERE id = v_order_id;
        v_fulfillment_applied := true;
      ELSIF v_fulfillment_method = 'session_credit' AND v_session_credits IS NOT NULL THEN
        UPDATE product_orders
          SET fulfillment_status = 'completed',
              fulfilled_at = NOW(),
              credits_remaining = v_session_credits,
              credits_expire_at = NOW() + make_interval(days => COALESCE(v_package_valid_days, 90))
          WHERE id = v_order_id;
        v_fulfillment_applied := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'status', p_new_status,
    'participant_added', v_participant_added,
    'product_order_id', v_order_id,
    'fulfillment_applied', v_fulfillment_applied,
    'was_duplicate', v_current_status = p_new_status
  );
END;
$$;

-- Only service-role callers invoke this — webhooks run with service client.
-- Keep authenticated role locked out so a rogue client can't force fulfillment.
REVOKE ALL ON FUNCTION finalize_payment(text, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_payment(text, bigint, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_payment(text, bigint, text, text) TO service_role;

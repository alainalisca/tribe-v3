/**
 * POST /api/payment/webhook/wompi
 * Webhook endpoint for Wompi payment notifications
 *
 * Wompi sends transaction status updates to this endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { verifyWompiWebhookSignature, mapWompiStatus, extractWompiTransactionData } from '@/lib/payments/wompi';

interface WebhookPayload {
  transaction?: {
    id: string;
    reference: string;
    amount_in_cents: number;
    currency: string;
    status: string;
  };
  timestamp?: string;
}

/**
 * @description Webhook endpoint called by Wompi when a transaction status changes
 * @method POST
 * @auth Validated via HMAC SHA256 signature. No user auth required.
 * @param {string} request.headers['x-signature'] - HMAC signature for validation
 * @param {string} request.headers['x-timestamp'] - Timestamp for signature validation
 * @param {WebhookPayload} request.body - Wompi webhook payload with transaction data
 * @returns {{ success: boolean }} Success response or error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Extract headers
    const signature = request.headers.get('x-signature');
    const timestamp = request.headers.get('x-timestamp');

    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 });
    }

    // Read body as text for signature verification
    const bodyText = await request.text();

    // Verify webhook signature
    if (!verifyWompiWebhookSignature(bodyText, signature, timestamp)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse JSON after verification
    const payload = JSON.parse(bodyText) as WebhookPayload;

    if (!payload.transaction) {
      // Webhook with no transaction data - acknowledge and ignore
      return NextResponse.json({ success: true });
    }

    const { id: transactionId, reference: paymentId, status: wompiStatus } = payload.transaction;

    // Extract transaction data
    const transactionData = extractWompiTransactionData(bodyText);

    if (!transactionData) {
      logError(new Error('Failed to extract transaction data'), {
        action: 'wompi_webhook',
        transactionId,
      });
      return NextResponse.json({ success: false, error: 'Invalid transaction data' }, { status: 400 });
    }

    // Map Wompi status to our PaymentStatus
    const paymentStatus = mapWompiStatus(wompiStatus);

    // Initialize Supabase service client for database updates
    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // LOGIC-08: event-id based idempotency. Wompi transaction id is unique
    // per event, so reject a duplicate before we change any state.
    {
      const { error: dedupErr } = await supabase
        .from('processed_webhook_events')
        .insert({ gateway: 'wompi', event_id: transactionId });
      if (dedupErr && dedupErr.code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      if (dedupErr) {
        logError(dedupErr, { action: 'wompi_webhook_dedup', transactionId });
      }
    }

    // Idempotency check — skip if already processed with same status
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('status, gateway_payment_id, amount_cents')
      .eq('id', paymentId)
      .single();

    // SEC-04: amount-tamper check. Compare Wompi-reported amount_in_cents to
    // the amount we stored at intent creation. Mismatch → reject.
    if (
      existingPayment &&
      existingPayment.amount_cents != null &&
      payload.transaction.amount_in_cents !== existingPayment.amount_cents
    ) {
      logError(new Error('wompi_amount_tamper'), {
        payment_id: paymentId,
        expected: existingPayment.amount_cents,
        received: payload.transaction.amount_in_cents,
      });
      return NextResponse.json({ error: 'amount_mismatch' }, { status: 400 });
    }

    if (existingPayment?.status === paymentStatus) {
      return NextResponse.json({ received: true, message: 'Already processed' });
    }

    // Update payment status in database
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: paymentStatus,
        gateway_payment_id: transactionId,
        gateway_reference: wompiStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    if (updateError) {
      logError(updateError, {
        action: 'wompi_webhook_update',
        paymentId,
        transactionId,
      });
    }

    // On approved payment: add athlete as confirmed participant + notify
    if (paymentStatus === 'approved') {
      const { data: paymentRecord } = await supabase
        .from('payments')
        .select('session_id, participant_user_id')
        .eq('id', paymentId)
        .single();

      if (paymentRecord) {
        const { error: participantError } = await supabase.from('session_participants').upsert(
          {
            session_id: paymentRecord.session_id,
            user_id: paymentRecord.participant_user_id,
            status: 'confirmed',
            joined_at: new Date().toISOString(),
          },
          { onConflict: 'session_id,user_id' }
        );

        if (participantError) {
          logError(participantError, {
            action: 'wompi_webhook_add_participant',
            paymentId,
            sessionId: paymentRecord.session_id,
          });
        }

        // Send booking confirmation notification
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({
              user_id: paymentRecord.participant_user_id,
              title: 'Booking Confirmed!',
              body: 'Your session has been booked. See you there!',
              type: 'payment_confirmed',
              data: { session_id: paymentRecord.session_id },
            }),
          });
        } catch (notifErr) {
          logError(notifErr, { action: 'wompi_webhook_notification', paymentId });
        }
      }

      // ──── PRODUCT ORDER FULFILLMENT ────
      const { data: productOrder } = await supabase
        .from('product_orders')
        .select('id, buyer_id, instructor_id, product_id, fulfillment_status')
        .eq('payment_id', paymentId)
        .maybeSingle();

      if (productOrder) {
        await supabase
          .from('product_orders')
          .update({ payment_status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', productOrder.id);

        const { data: product } = await supabase
          .from('products')
          .select('product_type, fulfillment_method, session_credits, package_valid_days')
          .eq('id', productOrder.product_id)
          .single();

        // Auto-fulfill digital products
        if (product?.fulfillment_method === 'digital') {
          await supabase
            .from('product_orders')
            .update({ fulfillment_status: 'completed', fulfilled_at: new Date().toISOString() })
            .eq('id', productOrder.id);
        }

        // Auto-fulfill session credit packages
        if (product?.fulfillment_method === 'session_credit' && product?.session_credits) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (product.package_valid_days || 90));
          await supabase
            .from('product_orders')
            .update({
              fulfillment_status: 'completed',
              fulfilled_at: new Date().toISOString(),
              credits_remaining: product.session_credits,
              credits_expire_at: expiresAt.toISOString(),
            })
            .eq('id', productOrder.id);
        }

        // Notify buyer of product purchase confirmation
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({
              user_id: productOrder.buyer_id,
              title: 'Purchase Confirmed!',
              body: 'Your product order has been confirmed.',
              type: 'product_order_confirmed',
              data: { product_order_id: productOrder.id, product_id: productOrder.product_id },
            }),
          });
        } catch (notifErr) {
          logError(notifErr, { action: 'wompi_webhook_product_notification_buyer', paymentId });
        }

        // Notify instructor of new sale
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({
              user_id: productOrder.instructor_id,
              title: 'New Sale!',
              body: 'You have a new product order.',
              type: 'product_order_received',
              data: { product_order_id: productOrder.id, product_id: productOrder.product_id },
            }),
          });
        } catch (notifErr) {
          logError(notifErr, { action: 'wompi_webhook_product_notification_instructor', paymentId });
        }
      }
    }

    // Always return 200 to acknowledge receipt
    // Wompi will retry if we return errors
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logError(error, {
      route: '/api/payment/webhook/wompi',
      action: 'webhook_wompi_payment',
    });
    // Return 200 to prevent Wompi from retrying invalid requests
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

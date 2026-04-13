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

    // Idempotency check — skip if already processed with same status
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('status, wompi_transaction_id')
      .eq('id', paymentId)
      .single();

    if (existingPayment?.status === paymentStatus) {
      return NextResponse.json({ received: true, message: 'Already processed' });
    }

    // Update payment status in database
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: paymentStatus,
        wompi_transaction_id: transactionId,
        wompi_status: wompiStatus,
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
        .select('session_id, user_id')
        .eq('id', paymentId)
        .single();

      if (paymentRecord) {
        const { error: participantError } = await supabase.from('session_participants').upsert(
          {
            session_id: paymentRecord.session_id,
            user_id: paymentRecord.user_id,
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
              user_id: paymentRecord.user_id,
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

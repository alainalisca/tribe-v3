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
import { notifyAfterFinalize } from '@/lib/payments/notifyAfterFinalize';

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

    // LOGIC-04: hand off atomic work (status update + participant upsert +
    // product fulfillment) to finalize_payment RPC. On any RPC error we
    // return 500 so Wompi retries.
    const { data: rpcData, error: rpcError } = await supabase.rpc('finalize_payment', {
      p_gateway_payment_id: transactionId,
      p_expected_amount_cents: payload.transaction.amount_in_cents,
      p_gateway: 'wompi',
      p_new_status: paymentStatus,
    });
    if (rpcError) {
      logError(rpcError, { action: 'wompi_webhook_finalize', paymentId, transactionId });
      return NextResponse.json({ error: 'finalize_failed' }, { status: 500 });
    }
    const result = (rpcData ?? {}) as {
      success?: boolean;
      error?: string;
      payment_id?: string;
      was_duplicate?: boolean;
    };
    if (!result.success) {
      logError(new Error(`wompi_webhook_${result.error}`), { paymentId, transactionId });
      return NextResponse.json({ error: result.error || 'finalize_failed' }, { status: 400 });
    }

    // Post-finalize notifications. Only fire on newly-approved payments so
    // a Wompi replay doesn't re-notify. Fire-and-forget — failures must not
    // force the gateway to retry.
    if (paymentStatus === 'approved' && !result.was_duplicate && result.payment_id) {
      notifyAfterFinalize(supabase, result.payment_id).catch(() => undefined);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    // LR-01 (PostHog): canonical 'wompi-webhook' route tag. logError
    // auto-forwards to PostHog via lib/captureError.ts.
    logError(error, { route: 'wompi-webhook', action: 'webhook_wompi_payment' });
    // Return 200 to prevent Wompi from retrying invalid requests
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

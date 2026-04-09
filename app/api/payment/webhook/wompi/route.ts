/**
 * POST /api/payment/webhook/wompi
 * Webhook endpoint for Wompi payment notifications
 *
 * Wompi sends transaction status updates to this endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import {
  verifyWompiWebhookSignature,
  mapWompiStatus,
  extractWompiTransactionData,
} from '@/lib/payments/wompi';

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
      return NextResponse.json(
        { error: 'Missing signature or timestamp' },
        { status: 400 }
      );
    }

    // Read body as text for signature verification
    const bodyText = await request.text();

    // Verify webhook signature
    if (!verifyWompiWebhookSignature(bodyText, signature, timestamp)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
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
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update payment status in database
    // Assuming there's a payments table with payment_id as the key
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
      // Don't return error - acknowledge to Wompi so it doesn't retry
    }

    // If payment is approved, handle additional business logic here
    // (e.g., update session participant status, trigger confirmations, etc.)
    if (paymentStatus === 'approved') {
      // Fetch the payment record to get session and user info
      const { data: payment } = await supabase
        .from('payments')
        .select('session_id, user_id')
        .eq('id', paymentId)
        .single();

      if (payment) {
        // Example: Mark participant as paid
        // await supabase
        //   .from('session_participants')
        //   .update({ payment_status: 'paid' })
        //   .eq('session_id', payment.session_id)
        //   .eq('user_id', payment.user_id);
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

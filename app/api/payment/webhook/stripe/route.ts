/**
 * POST /api/payment/webhook/stripe
 * Webhook endpoint for Stripe payment notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { verifyStripeWebhookSignature, mapStripeStatus, getStripePaymentIntent } from '@/lib/payments/stripe';
import { notifyAfterFinalize } from '@/lib/payments/notifyAfterFinalize';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const bodyBuffer = await request.arrayBuffer();
    const bodyText = Buffer.from(bodyBuffer).toString('utf8');

    const event = verifyStripeWebhookSignature(bodyText, signature);
    if (!event) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // LOGIC-08: event-id based idempotency. Status-equality checks below this
    // point are still defensive, but this is the authoritative dedup: if we've
    // ever processed this Stripe event id, return 200 without touching state.
    const eventId = (event as { id?: string }).id;
    if (eventId) {
      const { error: dedupErr } = await supabase
        .from('processed_webhook_events')
        .insert({ gateway: 'stripe', event_id: eventId });
      if (dedupErr && dedupErr.code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      if (dedupErr) {
        // Non-conflict failure — log but fall through so we don't drop the event.
        logError(dedupErr, { action: 'stripe_webhook_dedup', eventId });
      }
    }

    // Notifications after finalize_payment — shared helper module.

    // LOGIC-04: route every state-changing webhook branch through the
    // `finalize_payment` RPC so the payment status update + participant
    // upsert + product-order fulfillment run atomically. On any RPC
    // failure we return a 5xx so the gateway retries.
    async function finalize(gatewayPaymentId: string, amountCents: number | null, status: string) {
      const { data, error } = await supabase.rpc('finalize_payment', {
        p_gateway_payment_id: gatewayPaymentId,
        p_expected_amount_cents: amountCents,
        p_gateway: 'stripe',
        p_new_status: status,
      });
      if (error) {
        logError(error, { action: 'stripe_webhook_finalize', gatewayPaymentId, status });
        return NextResponse.json({ error: 'finalize_failed' }, { status: 500 });
      }
      const result = (data ?? {}) as {
        success?: boolean;
        error?: string;
        expected?: number;
        received?: number;
        payment_id?: string;
        participant_added?: boolean;
        fulfillment_applied?: boolean;
        was_duplicate?: boolean;
      };
      if (!result.success) {
        // Amount tamper / not_found — refuse, log, and don't make the gateway retry.
        logError(new Error(`stripe_webhook_${result.error}`), {
          gatewayPaymentId,
          expected: result.expected,
          received: result.received,
        });
        return NextResponse.json({ error: result.error || 'finalize_failed' }, { status: 400 });
      }

      // Post-finalize notifications. Only fire for newly-approved payments
      // (skip duplicates so a Stripe replay doesn't spam the user).
      if (status === 'approved' && !result.was_duplicate && result.payment_id) {
        notifyAfterFinalize(supabase, result.payment_id).catch(() => undefined);
      }

      return NextResponse.json({ success: true, result });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as unknown as Record<string, unknown>;
        const paymentIntentId = session.payment_intent as string;
        if (!paymentIntentId) return NextResponse.json({ success: true });

        const paymentIntent = await getStripePaymentIntent(paymentIntentId);
        if (!paymentIntent) {
          logError(new Error('Failed to fetch payment intent'), { paymentIntentId });
          return NextResponse.json({ success: true });
        }

        const paymentStatus = mapStripeStatus(paymentIntent.status);
        const webhookAmount =
          (paymentIntent as unknown as { amount_received?: number; amount?: number }).amount_received ??
          (paymentIntent as unknown as { amount?: number }).amount ??
          null;

        return finalize(session.id as string, webhookAmount, paymentStatus);
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as unknown as Record<string, unknown>;
        const piId = paymentIntent.id as string;
        const paymentStatus = mapStripeStatus(paymentIntent.status as string);
        const webhookAmount =
          (paymentIntent.amount_received as number | undefined) ?? (paymentIntent.amount as number | undefined) ?? null;

        return finalize(piId, webhookAmount, paymentStatus);
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as unknown as Record<string, unknown>;
        const piId = paymentIntent.id as string;
        const paymentStatus = mapStripeStatus(paymentIntent.status as string);
        // Failed events don't carry a reliable amount in every case; skip the
        // tamper check by passing null and let the RPC just record the status.
        return finalize(piId, null, paymentStatus);
      }

      default:
        return NextResponse.json({ success: true });
    }
  } catch (error: unknown) {
    // LR-01 (PostHog): route tag is canonical 'stripe-webhook' so
    // Activity → Exceptions filters cleanly. logError auto-forwards to
    // PostHog via lib/captureError.ts; no separate captureServerError
    // call needed here.
    logError(error, { route: 'stripe-webhook' });
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

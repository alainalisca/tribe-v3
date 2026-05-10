/**
 * POST /api/payment/webhook/stripe
 * Webhook endpoint for Stripe payment notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { verifyStripeWebhookSignature, mapStripeStatus, getStripePaymentIntent } from '@/lib/payments/stripe';
import { notifyAfterFinalize } from '@/lib/payments/notifyAfterFinalize';
import { syncFromStripeSubscription, clearTribeOSSubscription } from '@/lib/dal/tribeOSSubscription';

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

      case 'account.updated': {
        // Fires whenever a Connect account's state changes — including the
        // transition we care about: the instructor finishing hosted
        // onboarding, which flips charges_enabled + payouts_enabled to true.
        //
        // We look up our user by stripe_account_id (partial index from
        // migration 051_stripe_connect.sql) and sync the
        // stripe_onboarding_complete flag. Idempotent: running twice is a
        // no-op.
        const account = event.data.object as unknown as {
          id: string;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          details_submitted?: boolean;
        };

        const accountId = account.id;
        if (!accountId) return NextResponse.json({ success: true });

        const ready = !!account.charges_enabled && !!account.payouts_enabled;

        const { error: updateError } = await supabase
          .from('users')
          .update({ stripe_onboarding_complete: ready })
          .eq('stripe_account_id', accountId);

        if (updateError) {
          logError(updateError, {
            action: 'stripe_webhook_account_updated',
            accountId,
            ready,
          });
          // Return 500 so Stripe retries — a dropped flag means the
          // instructor can't accept payments even though they should be able
          // to. We'd rather get the retry than leave them stranded.
          return NextResponse.json({ error: 'account_sync_failed' }, { status: 500 });
        }

        return NextResponse.json({ success: true, ready });
      }

      // ----------------------------------------------------------------
      // Tribe.OS subscription billing (Mission 2)
      // ----------------------------------------------------------------
      // Distinct from the Connect events above: these are events about
      // the platform charging instructors directly for the Tribe.OS
      // premium tier. Both flows arrive at this same endpoint; routing
      // is by event.type. Idempotency is already guaranteed by the
      // event-id dedup at the top of this handler.

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as unknown as {
          id: string;
          customer: string;
          status: string;
          items: { data: Array<{ price: { id: string } }> };
        };

        const result = await syncFromStripeSubscription(supabase, {
          id: subscription.id,
          customer: subscription.customer,
          status: subscription.status,
          items: { data: subscription.items.data.map((i) => ({ price: { id: i.price.id } })) },
        });

        if (!result.success) {
          // user_not_found_for_stripe_customer means the subscription is
          // for a customer we never tagged with a tribe user. Treat as
          // benign (not our subscription) — return 200 so Stripe doesn't
          // retry forever. All other errors get a 500 so Stripe retries.
          if (result.error === 'user_not_found_for_stripe_customer') {
            return NextResponse.json({ success: true, ignored: true });
          }
          logError(new Error(`tribe_os_subscription_sync_failed: ${result.error ?? 'unknown'}`), {
            action: 'stripe_webhook_subscription_sync',
            subscriptionId: subscription.id,
            eventType: event.type,
          });
          return NextResponse.json({ error: 'subscription_sync_failed' }, { status: 500 });
        }
        return NextResponse.json({ success: true, userId: result.data?.userId });
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as unknown as { id: string; customer: string };
        const result = await clearTribeOSSubscription(supabase, subscription.customer);

        if (!result.success) {
          if (result.error === 'user_not_found_for_stripe_customer') {
            return NextResponse.json({ success: true, ignored: true });
          }
          logError(new Error(`tribe_os_subscription_clear_failed: ${result.error ?? 'unknown'}`), {
            action: 'stripe_webhook_subscription_clear',
            customerId: subscription.customer,
            subscriptionId: subscription.id,
          });
          return NextResponse.json({ error: 'subscription_clear_failed' }, { status: 500 });
        }
        return NextResponse.json({ success: true, userId: result.data?.userId });
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // Stripe fires customer.subscription.updated alongside these
        // with the resulting subscription state, and that handler is
        // the canonical state-sync path. We acknowledge invoice events
        // with 200 so Stripe stops retrying. Future: hook user-facing
        // emails (receipt on paid, dunning on failed) here.
        return NextResponse.json({ success: true });
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

/**
 * POST /api/payment/webhook/stripe
 * Webhook endpoint for Stripe payment notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { verifyStripeWebhookSignature, mapStripeStatus, getStripePaymentIntent } from '@/lib/payments/stripe';

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

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

        // Update payment record — match by gateway_payment_id (the Stripe checkout session ID)
        await supabase
          .from('payments')
          .update({
            status: paymentStatus,
            stripe_payment_intent_id: paymentIntentId,
            gateway_reference: session.id as string,
          })
          .eq('gateway_payment_id', session.id as string);

        return NextResponse.json({ success: true });
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as unknown as Record<string, unknown>;
        const piId = paymentIntent.id as string;
        const paymentStatus = mapStripeStatus(paymentIntent.status as string);

        await supabase
          .from('payments')
          .update({
            status: paymentStatus,
            stripe_payment_intent_id: piId,
          })
          .eq('stripe_payment_intent_id', piId);

        return NextResponse.json({ success: true });
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as unknown as Record<string, unknown>;
        const piId = paymentIntent.id as string;
        const paymentStatus = mapStripeStatus(paymentIntent.status as string);
        const lastError = paymentIntent.last_payment_error as unknown as Record<string, unknown> | null;

        await supabase
          .from('payments')
          .update({
            status: paymentStatus,
            stripe_payment_intent_id: piId,
            gateway_reference: lastError?.message as string || 'Payment failed',
          })
          .eq('stripe_payment_intent_id', piId);

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: true });
    }
  } catch (error: unknown) {
    logError(error, { route: '/api/payment/webhook/stripe' });
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

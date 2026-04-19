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

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Helper: add participant + notify after approved payment
    async function addParticipantAfterPayment(paymentQuery: Record<string, string>) {
      // Find payment record matching the query
      let query = supabase.from('payments').select('id, session_id, participant_user_id, status');
      for (const [key, val] of Object.entries(paymentQuery)) {
        query = query.eq(key, val);
      }
      const { data: paymentRecord } = await query.single();
      if (!paymentRecord?.session_id || !paymentRecord?.participant_user_id) return;

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
          action: 'stripe_webhook_add_participant',
          sessionId: paymentRecord.session_id,
        });
      }

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
        logError(notifErr, { action: 'stripe_webhook_notification' });
      }
    }

    // Helper: handle product order fulfillment after approved payment
    async function handleProductOrderFulfillment(paymentQuery: Record<string, string>) {
      let query = supabase.from('payments').select('id');
      for (const [key, val] of Object.entries(paymentQuery)) {
        query = query.eq(key, val);
      }
      const { data: paymentRec } = await query.single();
      if (!paymentRec) return;

      const { data: productOrder } = await supabase
        .from('product_orders')
        .select('id, buyer_id, instructor_id, product_id, fulfillment_status')
        .eq('payment_id', paymentRec.id)
        .maybeSingle();

      if (!productOrder) return;

      await supabase
        .from('product_orders')
        .update({ payment_status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', productOrder.id);

      const { data: product } = await supabase
        .from('products')
        .select('product_type, fulfillment_method, session_credits, package_valid_days')
        .eq('id', productOrder.product_id)
        .single();

      if (product?.fulfillment_method === 'digital') {
        await supabase
          .from('product_orders')
          .update({ fulfillment_status: 'completed', fulfilled_at: new Date().toISOString() })
          .eq('id', productOrder.id);
      }

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

      // Notify buyer
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
        logError(notifErr, { action: 'stripe_webhook_product_notification_buyer' });
      }

      // Notify instructor
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
        logError(notifErr, { action: 'stripe_webhook_product_notification_instructor' });
      }
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

        // Idempotency check
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('status')
          .eq('gateway_payment_id', session.id as string)
          .single();

        if (existingPayment?.status === paymentStatus) {
          return NextResponse.json({ received: true, message: 'Already processed' });
        }

        await supabase
          .from('payments')
          .update({
            status: paymentStatus,
            stripe_payment_intent_id: paymentIntentId,
            gateway_reference: session.id as string,
          })
          .eq('gateway_payment_id', session.id as string);

        if (paymentStatus === 'approved') {
          await addParticipantAfterPayment({ gateway_payment_id: session.id as string });
          await handleProductOrderFulfillment({ gateway_payment_id: session.id as string });
        }

        return NextResponse.json({ success: true });
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as unknown as Record<string, unknown>;
        const piId = paymentIntent.id as string;
        const paymentStatus = mapStripeStatus(paymentIntent.status as string);

        // Idempotency check
        const { data: existingPI } = await supabase
          .from('payments')
          .select('status')
          .eq('stripe_payment_intent_id', piId)
          .single();

        if (existingPI?.status === paymentStatus) {
          return NextResponse.json({ received: true, message: 'Already processed' });
        }

        await supabase
          .from('payments')
          .update({
            status: paymentStatus,
            stripe_payment_intent_id: piId,
          })
          .eq('stripe_payment_intent_id', piId);

        if (paymentStatus === 'approved') {
          await addParticipantAfterPayment({ stripe_payment_intent_id: piId });
          await handleProductOrderFulfillment({ stripe_payment_intent_id: piId });
        }

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
            gateway_reference: (lastError?.message as string) || 'Payment failed',
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

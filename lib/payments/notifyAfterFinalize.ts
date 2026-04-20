/**
 * Post-finalize payment notifications — shared by both Stripe and Wompi
 * webhook handlers. The finalize_payment RPC does all the DB writes
 * atomically; this module only handles user-facing notifications.
 *
 * Fire-and-forget: a notification failure must NEVER cause the gateway
 * to retry a successful payment. All fetches have their own .catch(),
 * and the outer function only rejects on a programming error.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

export async function notifyAfterFinalize(supabase: SupabaseClient, paymentId: string): Promise<void> {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!siteUrl || !cronSecret) return;

    // 1. Session booking confirmation for the buyer.
    const { data: payment } = await supabase
      .from('payments')
      .select('session_id, participant_user_id')
      .eq('id', paymentId)
      .single();

    if (payment?.session_id && payment?.participant_user_id) {
      fetch(`${siteUrl}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          user_id: payment.participant_user_id,
          title: 'Booking Confirmed!',
          body: 'Your session has been booked. See you there!',
          type: 'payment_confirmed',
          data: { session_id: payment.session_id },
        }),
      }).catch((err) => logError(err, { action: 'notifyAfterFinalize.booking', paymentId }));
    }

    // 2. Product-order notifications (buyer + instructor) if the payment
    //    has an associated order. Skip silently if the storefront schema
    //    isn't deployed — `maybeSingle` handles the missing-table case.
    const { data: order } = await supabase
      .from('product_orders')
      .select('id, buyer_id, instructor_id, product_id')
      .eq('payment_id', paymentId)
      .maybeSingle();

    if (order) {
      fetch(`${siteUrl}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          user_id: order.buyer_id,
          title: 'Purchase Confirmed!',
          body: 'Your product order has been confirmed.',
          type: 'product_order_confirmed',
          data: { product_order_id: order.id, product_id: order.product_id },
        }),
      }).catch((err) => logError(err, { action: 'notifyAfterFinalize.productBuyer', paymentId }));

      fetch(`${siteUrl}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          user_id: order.instructor_id,
          title: 'New Sale!',
          body: 'You have a new product order.',
          type: 'product_order_received',
          data: { product_order_id: order.id, product_id: order.product_id },
        }),
      }).catch((err) => logError(err, { action: 'notifyAfterFinalize.productInstructor', paymentId }));
    }
  } catch (err) {
    logError(err, { action: 'notifyAfterFinalize', paymentId });
  }
}

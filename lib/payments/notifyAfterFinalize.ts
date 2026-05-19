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
          userId: payment.participant_user_id,
          title: 'Booking Confirmed!',
          body: 'Your session has been booked. See you there!',
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
          userId: order.buyer_id,
          title: 'Purchase Confirmed!',
          body: 'Your product order has been confirmed.',
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
          userId: order.instructor_id,
          title: 'New Sale!',
          body: 'You have a new product order.',
          data: { product_order_id: order.id, product_id: order.product_id },
        }),
      }).catch((err) => logError(err, { action: 'notifyAfterFinalize.productInstructor', paymentId }));
    }
  } catch (err) {
    logError(err, { action: 'notifyAfterFinalize', paymentId });
  }
}

/**
 * "You received a tip" notification for the instructor. Tips have no
 * payments row (they finalize via the tips-table fallback in
 * finalize_payment), so they get their own notifier keyed by tip id.
 *
 * Same fire-and-forget contract as notifyAfterFinalize: a failure here must
 * never make the gateway retry an already-settled tip.
 */
export async function notifyTipReceived(supabase: SupabaseClient, tipId: string): Promise<void> {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!siteUrl || !cronSecret) return;

    const { data: tip } = await supabase
      .from('tips')
      .select('instructor_id, amount_cents, currency, tipper:tipper_id(name)')
      .eq('id', tipId)
      .single();

    if (!tip?.instructor_id) return;

    const tipperRel = tip.tipper as unknown as { name?: string } | { name?: string }[] | null;
    const tipperName = (Array.isArray(tipperRel) ? tipperRel[0]?.name : tipperRel?.name) || 'Someone';
    const amount =
      tip.currency === 'USD'
        ? `$${((tip.amount_cents as number) / 100).toFixed(2)}`
        : `$${Math.round((tip.amount_cents as number) / 100).toLocaleString()} COP`;

    fetch(`${siteUrl}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({
        userId: tip.instructor_id,
        title: 'You received a tip!',
        body: `${tipperName} sent you a ${amount} tip. Thank you note in the app.`,
        data: { tip_id: tipId },
      }),
    }).catch((err) => logError(err, { action: 'notifyTipReceived.send', tipId }));
  } catch (err) {
    logError(err, { action: 'notifyTipReceived', tipId });
  }
}

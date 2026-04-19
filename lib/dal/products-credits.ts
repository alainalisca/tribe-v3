// Data Access Layer — Product session-credit operations
// Split from products.ts to stay under 300 lines

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

import type { DalResult } from './types';
import type { ProductOrder } from './product-types';

/** Get non-expired session credits a user has for a specific instructor. */
export async function getAvailableCredits(
  supabase: SupabaseClient,
  userId: string,
  instructorId: string
): Promise<DalResult<Pick<ProductOrder, 'id' | 'credits_remaining' | 'credits_expire_at'>[]>> {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('product_orders')
      .select('id, credits_remaining, credits_expire_at')
      .eq('buyer_id', userId)
      .eq('instructor_id', instructorId)
      .eq('payment_status', 'approved')
      .gt('credits_remaining', 0)
      .or(`credits_expire_at.is.null,credits_expire_at.gte.${now}`)
      .order('credits_expire_at', { ascending: true, nullsFirst: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'getAvailableCredits', userId, instructorId });
    return { success: false, error: 'Failed to fetch available credits' };
  }
}

/** Redeem one session credit from a package order. Decrements credits_remaining. */
export async function redeemSessionCredit(
  supabase: SupabaseClient,
  orderId: string,
  userId: string
): Promise<DalResult<{ credits_remaining: number }>> {
  try {
    // Fetch current order
    const { data: order, error: fetchErr } = await supabase
      .from('product_orders')
      .select('id, credits_remaining, credits_expire_at, buyer_id, payment_status')
      .eq('id', orderId)
      .eq('buyer_id', userId)
      .single();

    if (fetchErr || !order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.payment_status !== 'approved') {
      return { success: false, error: 'Order payment not approved' };
    }

    if (order.credits_remaining == null || order.credits_remaining <= 0) {
      return { success: false, error: 'No credits remaining' };
    }

    // Check expiry
    if (order.credits_expire_at && new Date(order.credits_expire_at) < new Date()) {
      return { success: false, error: 'Credits have expired' };
    }

    const newRemaining = order.credits_remaining - 1;

    const { error: updateErr } = await supabase
      .from('product_orders')
      .update({ credits_remaining: newRemaining })
      .eq('id', orderId)
      .eq('buyer_id', userId);

    if (updateErr) return { success: false, error: updateErr.message };

    return { success: true, data: { credits_remaining: newRemaining } };
  } catch (error) {
    logError(error, { action: 'redeemSessionCredit', orderId, userId });
    return { success: false, error: 'Failed to redeem session credit' };
  }
}

/** DAL: Tribe+ / subscription lifecycle. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Currency, PaymentGateway } from '@/lib/payments/config';

export type BillingCycle = 'monthly' | 'annual';

export interface SubscriptionPaymentRow {
  id: string;
  user_id: string;
  tier: string;
  amount_cents: number;
  currency: Currency;
  gateway: PaymentGateway;
  gateway_payment_id: string | null;
  status: 'pending' | 'approved' | 'declined' | 'refunded';
  period_start: string;
  period_end: string;
  created_at: string;
}

/**
 * Record a pending subscription payment and mark the user's row with tier/expiry.
 * Does NOT execute the actual gateway charge — caller integrates Wompi/Stripe
 * and calls markSubscriptionApproved once payment confirms.
 */
export async function createSubscription(
  supabase: SupabaseClient,
  userId: string,
  tier: 'plus' | 'pro',
  billingCycle: BillingCycle,
  amountCents: number,
  currency: Currency,
  gateway: PaymentGateway
): Promise<DalResult<{ paymentId: string }>> {
  try {
    const now = new Date();
    const periodStart = now.toISOString().slice(0, 10);
    const periodEndDate = new Date(now);
    if (billingCycle === 'annual') periodEndDate.setFullYear(now.getFullYear() + 1);
    else periodEndDate.setMonth(now.getMonth() + 1);
    const periodEnd = periodEndDate.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('subscription_payments')
      .insert({
        user_id: userId,
        tier,
        amount_cents: amountCents,
        currency,
        gateway,
        status: 'pending',
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: { paymentId: (data as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'createSubscription', userId });
    return { success: false, error: 'Failed to create subscription' };
  }
}

/** Mark a subscription payment approved and activate the user's tier. */
export async function markSubscriptionApproved(
  supabase: SupabaseClient,
  paymentId: string,
  gatewayPaymentId: string
): Promise<DalResult<void>> {
  try {
    const { data: payment, error: payErr } = await supabase
      .from('subscription_payments')
      .update({ status: 'approved', gateway_payment_id: gatewayPaymentId })
      .eq('id', paymentId)
      .select('user_id, tier, period_start, period_end, gateway')
      .single();
    if (payErr) return { success: false, error: payErr.message };
    const row = payment as {
      user_id: string;
      tier: string;
      period_start: string;
      period_end: string;
      gateway: string;
    };

    const { error: userErr } = await supabase
      .from('users')
      .update({
        subscription_tier: row.tier,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: new Date(row.period_end + 'T23:59:59Z').toISOString(),
        subscription_gateway: row.gateway,
        subscription_auto_renew: true,
      })
      .eq('id', row.user_id);
    if (userErr) return { success: false, error: userErr.message };

    return { success: true };
  } catch (error) {
    logError(error, { action: 'markSubscriptionApproved', paymentId });
    return { success: false, error: 'Failed to approve subscription' };
  }
}

/** Turn off auto-renew; subscription remains active until expires_at. */
export async function cancelSubscription(supabase: SupabaseClient, userId: string): Promise<DalResult<void>> {
  try {
    const { error } = await supabase.from('users').update({ subscription_auto_renew: false }).eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'cancelSubscription', userId });
    return { success: false, error: 'Failed to cancel subscription' };
  }
}

/** Reactivate auto-renew. */
export async function renewSubscription(supabase: SupabaseClient, userId: string): Promise<DalResult<void>> {
  try {
    const { error } = await supabase.from('users').update({ subscription_auto_renew: true }).eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'renewSubscription', userId });
    return { success: false, error: 'Failed to renew subscription' };
  }
}

/**
 * Find users whose subscription has expired and auto_renew is OFF, and flip
 * them back to 'free'. Used by the daily cron.
 */
export async function checkAndExpireSubscriptions(supabase: SupabaseClient): Promise<DalResult<{ expired: number }>> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('users')
      .update({ subscription_tier: 'free' })
      .lt('subscription_expires_at', nowIso)
      .neq('subscription_tier', 'free')
      .eq('subscription_auto_renew', false)
      .select('id');
    if (error) return { success: false, error: error.message };
    return { success: true, data: { expired: (data || []).length } };
  } catch (error) {
    logError(error, { action: 'checkAndExpireSubscriptions' });
    return { success: false, error: 'Failed to expire subscriptions' };
  }
}

/** A user's subscription payment history, most recent first. */
export async function fetchSubscriptionPayments(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<SubscriptionPaymentRow[]>> {
  try {
    const { data, error } = await supabase
      .from('subscription_payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as SubscriptionPaymentRow[] };
  } catch (error) {
    logError(error, { action: 'fetchSubscriptionPayments', userId });
    return { success: false, error: 'Failed to fetch subscription payments' };
  }
}

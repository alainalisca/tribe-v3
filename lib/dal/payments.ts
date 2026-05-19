/**
 * Data Access Layer for payments
 * Handles all payment-related database operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface Payment {
  id: string;
  session_id: string;
  participant_user_id: string;
  amount_cents: number;
  currency: 'COP' | 'USD';
  gateway: 'wompi' | 'stripe';
  status: 'pending' | 'processing' | 'approved' | 'declined' | 'voided' | 'error';
  platform_fee_cents: number;
  instructor_payout_cents: number;
  gateway_payment_id?: string;
  gateway_reference?: string;
  wompi_payment_method?: string;
  stripe_payment_intent_id?: string;
  stripe_customer_id?: string;
  payout_status: string;
  created_at: string;
  updated_at: string;
}

export type PaymentInsert = Omit<Payment, 'id' | 'created_at' | 'updated_at'>;

/**
 * Create a new payment record
 */
export async function createPayment(supabase: SupabaseClient, payment: PaymentInsert): Promise<DalResult<Payment>> {
  try {
    const { data, error } = await supabase.from('payments').insert([payment]).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'createPayment' });
    return { success: false, error: 'Failed to create payment' };
  }
}

/**
 * Fetch payment by ID
 */
export async function fetchPayment(supabase: SupabaseClient, paymentId: string): Promise<DalResult<Payment>> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, session_id, participant_user_id, amount_cents, currency, gateway, status, platform_fee_cents, instructor_payout_cents, gateway_payment_id, gateway_reference, wompi_payment_method, stripe_payment_intent_id, stripe_customer_id, payout_status, created_at, updated_at'
      )
      .eq('id', paymentId)
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchPayment', paymentId });
    return { success: false, error: 'Failed to fetch payment' };
  }
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  supabase: SupabaseClient,
  paymentId: string,
  status: Payment['status'],
  additionalData?: Partial<Payment>
): Promise<DalResult<Payment>> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...additionalData,
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'updatePaymentStatus', paymentId });
    return { success: false, error: 'Failed to update payment' };
  }
}

/**
 * Fetch payments for a session
 */
export async function fetchSessionPayments(supabase: SupabaseClient, sessionId: string): Promise<DalResult<Payment[]>> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, session_id, participant_user_id, amount_cents, currency, gateway, status, platform_fee_cents, instructor_payout_cents, gateway_payment_id, gateway_reference, wompi_payment_method, stripe_payment_intent_id, stripe_customer_id, payout_status, created_at, updated_at'
      )
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchSessionPayments', sessionId });
    return { success: false, error: 'Failed to fetch session payments' };
  }
}

/**
 * Fetch payments for a user
 */
export async function fetchUserPayments(supabase: SupabaseClient, userId: string): Promise<DalResult<Payment[]>> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, session_id, participant_user_id, amount_cents, currency, gateway, status, platform_fee_cents, instructor_payout_cents, gateway_payment_id, gateway_reference, wompi_payment_method, stripe_payment_intent_id, stripe_customer_id, payout_status, created_at, updated_at'
      )
      .eq('participant_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUserPayments', userId });
    return { success: false, error: 'Failed to fetch user payments' };
  }
}

/**
 * Fetch approved payments for an instructor (payouts)
 */
export async function fetchInstructorPayouts(
  supabase: SupabaseClient,
  instructorUserId: string
): Promise<DalResult<Payment[]>> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(
        `
        *,
        session:sessions(creator_id)
      `
      )
      .eq('session.creator_id', instructorUserId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchInstructorPayouts', instructorUserId });
    return { success: false, error: 'Failed to fetch instructor payouts' };
  }
}

/**
 * Record a refund on a payment. Called by the Stripe charge.refunded
 * webhook branch (app/api/payment/webhook/stripe/route.ts).
 *
 * `cumulativeRefundCents` mirrors Stripe's charge.amount_refunded:
 * it is the TOTAL refunded so far on the charge, not a per-event delta.
 * That means re-running this with the same value is idempotent — webhook
 * replays will not double-count.
 *
 * Lookup is by stripe_payment_intent_id, matching the column populated
 * at payment creation by /api/payment/create.
 *
 * Fails closed: if the lookup or update fails, we return an error and
 * the webhook returns 500 so Stripe retries. Better to get a duplicate
 * delivery than to drop a refund.
 */
export async function recordPaymentRefund(
  supabase: SupabaseClient,
  stripePaymentIntentId: string,
  cumulativeRefundCents: number,
  refundedAt: string
): Promise<DalResult<{ paymentId: string }>> {
  try {
    if (!stripePaymentIntentId) {
      return { success: false, error: 'missing_payment_intent_id' };
    }
    if (!Number.isFinite(cumulativeRefundCents) || cumulativeRefundCents <= 0) {
      // A zero or negative refund is meaningless — Stripe shouldn't send
      // it. Reject loudly so we notice if it ever appears.
      return { success: false, error: 'invalid_refund_amount' };
    }

    const { data, error } = await supabase
      .from('payments')
      .update({
        refunded_at: refundedAt,
        refunded_amount_cents: cumulativeRefundCents,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_payment_intent_id', stripePaymentIntentId)
      .select('id, amount_cents, session_id, participant_user_id')
      .single();

    if (error) {
      logError(error, { action: 'recordPaymentRefund', stripePaymentIntentId });
      return { success: false, error: error.message };
    }
    if (!data) {
      // No matching payment row. Could be a charge from outside our
      // platform, or a payment we never recorded. Treat as benign so
      // Stripe doesn't retry forever, but log so we notice patterns.
      logError(new Error('payment_not_found_for_refund'), {
        action: 'recordPaymentRefund',
        stripePaymentIntentId,
      });
      return { success: false, error: 'payment_not_found' };
    }

    const payment = data as {
      id: string;
      amount_cents: number | null;
      session_id: string | null;
      participant_user_id: string | null;
    };

    // Seat release on a FULL refund only. A full refund means the buyer
    // got all their money back, so they must not keep a confirmed seat
    // (free access) or hold capacity. A partial refund keeps the seat.
    // Only session-participation payments carry a session_id +
    // participant_user_id; boost/pro refunds naturally no-op here.
    //
    // We just delete the participant row — the 087 AFTER trigger
    // (trg_sync_session_participant_count) recomputes
    // sessions.current_participants from the real confirmed rows, so the
    // capacity count stays a single source of truth (Tier-3). Deleting an
    // already-removed row matches zero rows and is a safe no-op, so this
    // stays idempotent under Stripe's cumulative charge.refunded replays.
    const isFullRefund =
      typeof payment.amount_cents === 'number' &&
      payment.amount_cents > 0 &&
      cumulativeRefundCents >= payment.amount_cents;

    if (isFullRefund && payment.session_id && payment.participant_user_id) {
      const { error: seatError } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', payment.session_id)
        .eq('user_id', payment.participant_user_id);

      if (seatError) {
        // The refund itself IS recorded. A failed seat release is a
        // capacity-accuracy issue, not a money-integrity one, so log it
        // loudly but don't fail the whole refund (which would make Stripe
        // retry — harmless but noisy, and the retry would re-attempt this
        // delete anyway).
        logError(seatError, {
          action: 'recordPaymentRefund.releaseSeat',
          paymentId: payment.id,
          sessionId: payment.session_id,
        });
      }
    }

    return { success: true, data: { paymentId: payment.id } };
  } catch (error) {
    logError(error, { action: 'recordPaymentRefund', stripePaymentIntentId });
    return { success: false, error: 'Failed to record refund' };
  }
}

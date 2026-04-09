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
  user_id: string;
  amount_cents: number;
  currency: 'COP' | 'USD';
  gateway: 'wompi' | 'stripe';
  status: 'pending' | 'processing' | 'approved' | 'declined' | 'voided' | 'error';
  platform_fee_cents: number;
  instructor_payout_cents: number;
  wompi_transaction_id?: string;
  wompi_status?: string;
  stripe_payment_intent_id?: string;
  stripe_session_id?: string;
  stripe_last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentInsert extends Omit<Payment, 'id' | 'created_at' | 'updated_at'> {}

/**
 * Create a new payment record
 */
export async function createPayment(
  supabase: SupabaseClient,
  payment: PaymentInsert
): Promise<DalResult<Payment>> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert([payment])
      .select()
      .single();

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
      .select('*')
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
export async function fetchSessionPayments(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<Payment[]>> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

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
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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
      .select(`
        *,
        session:sessions(creator_id)
      `)
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

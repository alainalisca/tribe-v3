/** DAL: tips table — athlete gratitude payments to instructors. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Currency, PaymentGateway } from '@/lib/payments/config';

export interface TipRecord {
  id: string;
  tipper_id: string;
  instructor_id: string;
  session_id: string | null;
  amount_cents: number;
  currency: Currency;
  gateway: PaymentGateway;
  gateway_payment_id: string | null;
  status: 'pending' | 'approved' | 'declined' | 'error';
  message: string | null;
  platform_fee_cents: number;
  created_at: string;
}

export interface TipWithTipper {
  id: string;
  tipper: { id: string; name: string; avatar_url: string | null } | null;
  amount_cents: number;
  currency: Currency;
  session_id: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

/** Create a tip row in pending state. Payment execution is wired in by the caller. */
export async function createTip(
  supabase: SupabaseClient,
  tipperId: string,
  instructorId: string,
  amountCents: number,
  currency: Currency,
  gateway: PaymentGateway,
  sessionId?: string,
  message?: string
): Promise<DalResult<{ id: string }>> {
  try {
    if (tipperId === instructorId) {
      return { success: false, error: 'Cannot tip yourself' };
    }
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return { success: false, error: 'Invalid tip amount' };
    }

    const { data, error } = await supabase
      .from('tips')
      .insert({
        tipper_id: tipperId,
        instructor_id: instructorId,
        session_id: sessionId ?? null,
        amount_cents: Math.floor(amountCents),
        currency,
        gateway,
        message: message ?? null,
        platform_fee_cents: 0,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'createTip', tipperId, instructorId });
    return { success: false, error: 'Failed to create tip' };
  }
}

/** Mark a previously-pending tip as approved/declined. */
export async function updateTipStatus(
  supabase: SupabaseClient,
  tipId: string,
  status: 'approved' | 'declined' | 'error',
  gatewayPaymentId?: string
): Promise<DalResult<void>> {
  try {
    const patch: Record<string, unknown> = { status };
    if (gatewayPaymentId) patch.gateway_payment_id = gatewayPaymentId;

    const { error } = await supabase.from('tips').update(patch).eq('id', tipId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateTipStatus', tipId });
    return { success: false, error: 'Failed to update tip status' };
  }
}

/** Tips received by a given instructor, most recent first. */
export async function fetchTipsForInstructor(
  supabase: SupabaseClient,
  instructorId: string,
  limit: number = 50,
  offset: number = 0
): Promise<DalResult<{ tips: TipWithTipper[]; total: number; totalAmountCents: number }>> {
  try {
    const { count, error: countError } = await supabase
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .eq('instructor_id', instructorId)
      .eq('status', 'approved');
    if (countError) return { success: false, error: countError.message };

    const { data, error } = await supabase
      .from('tips')
      .select(
        `
        id,
        amount_cents,
        currency,
        session_id,
        message,
        status,
        created_at,
        tipper:tipper_id(id, name, avatar_url)
      `
      )
      .eq('instructor_id', instructorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { success: false, error: error.message };

    let totalAmountCents = 0;
    const tips: TipWithTipper[] = (data || []).map((row: Record<string, unknown>) => {
      const tipperRel = row.tipper as { id: string; name: string; avatar_url: string | null } | null;
      const status = row.status as string;
      const amount = row.amount_cents as number;
      if (status === 'approved') totalAmountCents += amount;
      return {
        id: row.id as string,
        tipper: tipperRel ? { id: tipperRel.id, name: tipperRel.name, avatar_url: tipperRel.avatar_url } : null,
        amount_cents: amount,
        currency: row.currency as Currency,
        session_id: (row.session_id as string | null) ?? null,
        message: (row.message as string | null) ?? null,
        status,
        created_at: row.created_at as string,
      };
    });

    return { success: true, data: { tips, total: count ?? 0, totalAmountCents } };
  } catch (error) {
    logError(error, { action: 'fetchTipsForInstructor', instructorId });
    return { success: false, error: 'Failed to fetch tips' };
  }
}

/** All tips a given user has sent. */
export async function fetchTipsByUser(supabase: SupabaseClient, userId: string): Promise<DalResult<TipRecord[]>> {
  try {
    const { data, error } = await supabase
      .from('tips')
      .select('*')
      .eq('tipper_id', userId)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as TipRecord[] };
  } catch (error) {
    logError(error, { action: 'fetchTipsByUser', userId });
    return { success: false, error: 'Failed to fetch tips' };
  }
}

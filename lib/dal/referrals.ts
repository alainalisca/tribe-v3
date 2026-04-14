// Data Access Layer for referrals
// See migration: supabase/migrations/014_referrals.sql

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

// --- Types ---

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  referral_code: string;
  status: 'pending' | 'signed_up' | 'completed_session' | 'rewarded';
  created_at: string;
  converted_at: string | null;
}

export interface ReferralStats {
  total: number;
  signed_up: number;
  completed_session: number;
  rewarded: number;
}

// --- Helpers ---

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TRIBE-${code}`;
}

// --- Read operations ---

/**
 * Gets the user's reusable referral code, creating one if none exists.
 * A "reusable" code is one where referred_id is null (template row).
 */
export async function getOrCreateReferralCode(supabase: SupabaseClient, userId: string): Promise<DalResult<string>> {
  try {
    // Check for existing reusable code
    const { data: existing, error: fetchError } = await supabase
      .from('referrals')
      .select('referral_code')
      .eq('referrer_id', userId)
      .is('referred_id', null)
      .limit(1)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (existing) return { success: true, data: existing.referral_code };

    // Generate a new code
    const code = generateCode();
    const { error: insertError } = await supabase.from('referrals').insert({
      referrer_id: userId,
      referral_code: code,
      status: 'pending',
    });

    if (insertError) return { success: false, error: insertError.message };
    return { success: true, data: code };
  } catch (error) {
    logError(error, { action: 'getOrCreateReferralCode', userId });
    return { success: false, error: 'Failed to get or create referral code' };
  }
}

/**
 * Returns aggregate referral stats for a user.
 */
export async function getReferralStats(supabase: SupabaseClient, userId: string): Promise<DalResult<ReferralStats>> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('status')
      .eq('referrer_id', userId)
      .not('referred_id', 'is', null);

    if (error) return { success: false, error: error.message };

    const rows = data ?? [];
    const stats: ReferralStats = {
      total: rows.length,
      signed_up: rows.filter((r) => r.status === 'signed_up').length,
      completed_session: rows.filter((r) => r.status === 'completed_session').length,
      rewarded: rows.filter((r) => r.status === 'rewarded').length,
    };

    return { success: true, data: stats };
  } catch (error) {
    logError(error, { action: 'getReferralStats', userId });
    return { success: false, error: 'Failed to fetch referral stats' };
  }
}

/**
 * Validates that a referral code exists and returns referrer info.
 */
export async function lookupReferralCode(
  supabase: SupabaseClient,
  code: string
): Promise<DalResult<{ referrerId: string; referrerName: string }>> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('referrer_id, users!referrals_referrer_id_fkey(name)')
      .eq('referral_code', code)
      .is('referred_id', null)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Invalid referral code' };

    const user = data.users as unknown as { name: string } | null;
    return {
      success: true,
      data: {
        referrerId: data.referrer_id,
        referrerName: user?.name ?? 'Unknown',
      },
    };
  } catch (error) {
    logError(error, { action: 'lookupReferralCode', code });
    return { success: false, error: 'Failed to look up referral code' };
  }
}

// --- Write operations ---

/**
 * Applies a referral code for a new user: creates a new referral row
 * linking the referrer to the new user with status 'signed_up'.
 */
export async function applyReferralCode(
  supabase: SupabaseClient,
  referralCode: string,
  newUserId: string
): Promise<DalResult<Referral>> {
  try {
    // Look up the template row to get the referrer
    const lookup = await lookupReferralCode(supabase, referralCode);
    if (!lookup.success || !lookup.data) {
      return { success: false, error: lookup.error ?? 'Invalid referral code' };
    }

    const { data, error } = await supabase
      .from('referrals')
      .insert({
        referrer_id: lookup.data.referrerId,
        referred_id: newUserId,
        referral_code: referralCode,
        status: 'signed_up',
        converted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'applyReferralCode', referralCode, newUserId });
    return { success: false, error: 'Failed to apply referral code' };
  }
}

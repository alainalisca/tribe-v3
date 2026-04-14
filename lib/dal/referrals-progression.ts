// Data Access Layer for referral status progression
// Advances referral status when a referred user completes milestones

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * Progresses a referral from 'signed_up' to 'completed_session'
 * when the referred user completes their first session.
 */
export async function progressReferralOnSessionComplete(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error: fetchError } = await supabase
      .from('referrals')
      .select('id')
      .eq('referred_id', userId)
      .eq('status', 'signed_up')
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!data) return { success: true, data: false }; // No matching referral

    const { error: updateError } = await supabase
      .from('referrals')
      .update({ status: 'completed_session' })
      .eq('id', data.id);

    if (updateError) return { success: false, error: updateError.message };
    return { success: true, data: true };
  } catch (error) {
    logError(error, { action: 'progressReferralOnSessionComplete', userId });
    return { success: false, error: 'Failed to progress referral status' };
  }
}

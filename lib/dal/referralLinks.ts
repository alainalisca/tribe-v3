/**
 * DAL: credit a referrer when a referred person signs up (T-GROW2). SERVICE-ROLE ONLY.
 *
 * WHY THIS EXISTS: the old path (applyReferralCode, run by the new user's browser
 * client) has never once succeeded on production: 7 code rows, 0 conversions.
 * The INSERT policy only admits rows where referrer_id is the caller, and the
 * SELECT policies hid the referrer's code row from the new user anyway. So the
 * write moves here, called by /api/attr/signup with the service role, and
 * migration 215 makes client inserts code-rows-only so nobody can forge one.
 *
 * Covered by policy v1.1 section 4.
 *
 * Outcomes, none of them an error:
 *   linked        a row (referrer, referred, code, signed_up) was written
 *   already       this person was already credited (referrals_one_credit_per_referred)
 *   self          the code is the new user's own; never credited
 *   no_referrer   no user owns this code (a pass lead's code, or a typo).
 *                 users.signup_ref still records it, and Referidos reads it from there.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type ReferralLinkOutcome = 'linked' | 'already' | 'self' | 'no_referrer';

export async function linkSignupReferral(
  supabase: SupabaseClient,
  code: string,
  newUserId: string
): Promise<DalResult<ReferralLinkOutcome>> {
  try {
    const { data: owner, error: lookupError } = await supabase
      .from('referrals')
      .select('referrer_id')
      .eq('referral_code', code)
      .is('referred_id', null)
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      logError(lookupError, { action: 'linkSignupReferral.lookup', code });
      return { success: false, error: lookupError.message };
    }
    if (!owner) return { success: true, data: 'no_referrer' };
    if (owner.referrer_id === newUserId) return { success: true, data: 'self' };

    const { error } = await supabase.from('referrals').insert({
      referrer_id: owner.referrer_id,
      referred_id: newUserId,
      referral_code: code,
      status: 'signed_up',
      converted_at: new Date().toISOString(),
    });
    if (error) {
      // The one-credit index: a second link for the same person is the index
      // working, not a failure.
      if (error.code === '23505') return { success: true, data: 'already' };
      logError(error, { action: 'linkSignupReferral.insert', code, newUserId });
      return { success: false, error: error.message };
    }
    return { success: true, data: 'linked' };
  } catch (error) {
    logError(error, { action: 'linkSignupReferral', code, newUserId });
    return { success: false, error: 'Failed to link referral' };
  }
}

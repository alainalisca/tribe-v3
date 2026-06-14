// Data Access Layer for user_private — sensitive PII that must never be
// readable by other users (payout bank details, emergency contact, DOB).
// Backed by the user_private table (migration 096), governed by owner-only
// RLS. See docs / audit T1-1 for why this lives apart from public.users.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface UserPrivateProfile {
  payout_bank_name: string | null;
  payout_account_type: string | null;
  payout_account_number: string | null;
  payout_document_type: string | null;
  payout_document_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  date_of_birth: string | null;
}

const EMPTY: UserPrivateProfile = {
  payout_bank_name: null,
  payout_account_type: null,
  payout_account_number: null,
  payout_document_type: null,
  payout_document_number: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  date_of_birth: null,
};

/**
 * Fetch the caller's own private profile. RLS guarantees a user can only read
 * their own row, so this is safe to call with the standard client. Returns an
 * all-null shape (not an error) when the user has no private row yet.
 */
export async function fetchMyPrivateProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<UserPrivateProfile>> {
  try {
    const { data, error } = await supabase
      .from('user_private')
      .select(
        'payout_bank_name, payout_account_type, payout_account_number, payout_document_type, payout_document_number, emergency_contact_name, emergency_contact_phone, date_of_birth'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logError(error, { action: 'fetchMyPrivateProfile', userId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as UserPrivateProfile) ?? { ...EMPTY } };
  } catch (error) {
    logError(error, { action: 'fetchMyPrivateProfile', userId });
    return { success: false, error: 'Failed to fetch private profile' };
  }
}

/**
 * Upsert the caller's own private profile. Only the provided keys are written;
 * the (user_id) primary key drives the upsert. RLS enforces ownership.
 */
export async function upsertMyPrivateProfile(
  supabase: SupabaseClient,
  userId: string,
  fields: Partial<UserPrivateProfile>
): Promise<DalResult<true>> {
  try {
    const { error } = await supabase
      .from('user_private')
      .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' });

    if (error) {
      logError(error, { action: 'upsertMyPrivateProfile', userId });
      return { success: false, error: error.message };
    }
    return { success: true, data: true };
  } catch (error) {
    logError(error, { action: 'upsertMyPrivateProfile', userId });
    return { success: false, error: 'Failed to save private profile' };
  }
}

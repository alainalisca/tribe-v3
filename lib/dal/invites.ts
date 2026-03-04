/** DAL: invite_tokens table */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

// REASON: returns raw Supabase join shape — callers handle type narrowing
export async function fetchInviteWithSession(supabase: SupabaseClient, token: string): Promise<DalResult<unknown>> {
  try {
    const { data, error } = await supabase
      .from('invite_tokens')
      .select('*, session:sessions(*)')
      .eq('token', token)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchInviteWithSession' });
    return { success: false, error: 'Failed to fetch invite' };
  }
}

export async function insertInviteToken(
  supabase: SupabaseClient,
  data: Record<string, unknown>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('invite_tokens').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertInviteToken' });
    return { success: false, error: 'Failed to create invite' };
  }
}

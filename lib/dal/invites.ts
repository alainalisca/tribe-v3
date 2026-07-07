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

/** Minimal token lookup for join-time validation (T-INV1). */
export interface InviteTokenRow {
  session_id: string;
  expires_at: string | null;
}

export async function fetchInviteTokenForJoin(
  supabase: SupabaseClient,
  token: string
): Promise<DalResult<InviteTokenRow | null>> {
  try {
    const { data, error } = await supabase
      .from('invite_tokens')
      .select('session_id, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as InviteTokenRow | null };
  } catch (error) {
    logError(error, { action: 'fetchInviteTokenForJoin' });
    return { success: false, error: 'Failed to fetch invite token' };
  }
}

/**
 * Latest unexpired invite token an inviter created for a session (T-INV1).
 * Used to resolve a session_invite notification tap to the /invite/{token}
 * acceptance page; invite_tokens is publicly readable so the recipient's
 * client can run this.
 */
export async function fetchLatestInviteTokenForSession(
  supabase: SupabaseClient,
  sessionId: string,
  createdBy: string
): Promise<DalResult<{ token: string } | null>> {
  try {
    const { data, error } = await supabase
      .from('invite_tokens')
      .select('token')
      .eq('session_id', sessionId)
      .eq('created_by', createdBy)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as { token: string } | null };
  } catch (error) {
    logError(error, { action: 'fetchLatestInviteTokenForSession' });
    return { success: false, error: 'Failed to fetch invite token' };
  }
}

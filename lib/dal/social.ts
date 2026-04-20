/** DAL: blocked_users, reported_users, reviews tables */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Database } from '@/lib/database.types';

type BlockedUserInsert = Database['public']['Tables']['blocked_users']['Insert'];
type ReportedUserInsert = Database['public']['Tables']['reported_users']['Insert'];
type ReviewInsert = Database['public']['Tables']['reviews']['Insert'];

export async function blockUser(supabase: SupabaseClient, data: BlockedUserInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('blocked_users').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'blockUser' });
    return { success: false, error: 'Failed to block user' };
  }
}

export async function unblockUser(
  supabase: SupabaseClient,
  userId: string,
  blockedUserId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('user_id', userId)
      .eq('blocked_user_id', blockedUserId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'unblockUser' });
    return { success: false, error: 'Failed to unblock user' };
  }
}

export async function reportUser(supabase: SupabaseClient, data: ReportedUserInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('reported_users').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'reportUser' });
    return { success: false, error: 'Failed to report user' };
  }
}

export async function updateReportStatus(
  supabase: SupabaseClient,
  reportId: string,
  status: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('reported_users').update({ status }).eq('id', reportId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateReportStatus' });
    return { success: false, error: 'Failed to update report' };
  }
}

export async function insertReview(supabase: SupabaseClient, data: ReviewInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('reviews').insert(data);
    if (error) {
      // LOGIC-02: the reviews table has UNIQUE(session_id, reviewer_id). Surface
      // that specific failure as a typed error so the UI can say "you already
      // reviewed this" instead of a generic toast.
      if (error.code === '23505') {
        return { success: false, error: 'already_reviewed' };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertReview' });
    return { success: false, error: 'Failed to insert review' };
  }
}

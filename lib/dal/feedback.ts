/** DAL: user_feedback + bug_reports tables */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Database } from '@/lib/database.types';

type FeedbackInsert = Database['public']['Tables']['user_feedback']['Insert'];
type BugReportInsert = Database['public']['Tables']['bug_reports']['Insert'];

export async function insertFeedback(supabase: SupabaseClient, data: FeedbackInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('user_feedback').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertFeedback' });
    return { success: false, error: 'Failed to submit feedback' };
  }
}

export async function updateFeedbackStatus(
  supabase: SupabaseClient,
  id: string,
  status: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('user_feedback').update({ status }).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateFeedbackStatus' });
    return { success: false, error: 'Failed to update feedback' };
  }
}

export async function insertBugReport(supabase: SupabaseClient, data: BugReportInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('bug_reports').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertBugReport' });
    return { success: false, error: 'Failed to submit bug report' };
  }
}

export async function updateBugStatus(supabase: SupabaseClient, id: string, status: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('bug_reports').update({ status }).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateBugStatus' });
    return { success: false, error: 'Failed to update bug status' };
  }
}

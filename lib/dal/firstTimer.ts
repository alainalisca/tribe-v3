/**
 * DAL: the first-timer block (T-AV32, P1-5). Both calls go through definer
 * functions (migration 8004); who sees the block is decided there.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export const FIRST_TIMER_MAX = 600;

export interface FirstTimerBlock {
  coachFirstName: string;
  text: string;
}

/** The block for this session, or null when the viewer should not see one. */
export async function fetchFirstTimerBlock(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<FirstTimerBlock | null>> {
  try {
    const { data, error } = await supabase.rpc('av_first_timer_block', { p_session_id: sessionId });
    if (error) {
      logError(error, { action: 'fetchFirstTimerBlock', sessionId });
      return { success: false, error: error.message };
    }
    const body = (data ?? {}) as { show?: unknown; text?: unknown; coach_first_name?: unknown };
    if (body.show !== true || typeof body.text !== 'string' || body.text === '') return { success: true, data: null };
    return {
      success: true,
      data: { text: body.text, coachFirstName: typeof body.coach_first_name === 'string' ? body.coach_first_name : '' },
    };
  } catch (error) {
    logError(error, { action: 'fetchFirstTimerBlock', sessionId });
    return { success: false, error: 'Failed' };
  }
}

export async function saveFirstTimerText(supabase: SupabaseClient, text: string | null): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase.rpc('av_set_first_timer_text', { p_text: text });
    if (error) {
      logError(error, { action: 'saveFirstTimerText' });
      return { success: false, error: error.message };
    }
    const body = (data ?? {}) as { success?: unknown; error?: unknown };
    return body.success === true ? { success: true } : { success: false, error: String(body.error ?? 'unknown') };
  } catch (error) {
    logError(error, { action: 'saveFirstTimerText' });
    return { success: false, error: 'Failed' };
  }
}

/** The signed-in coach's own text (RLS returns only their own row). */
export async function fetchMyFirstTimerText(supabase: SupabaseClient, coachId: string): Promise<DalResult<string>> {
  try {
    const { data, error } = await supabase
      .from('coach_contact_settings')
      .select('first_timer_text')
      .eq('coach_id', coachId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data?.first_timer_text as string | null) ?? '' };
  } catch (error) {
    logError(error, { action: 'fetchMyFirstTimerText' });
    return { success: false, error: 'Failed' };
  }
}

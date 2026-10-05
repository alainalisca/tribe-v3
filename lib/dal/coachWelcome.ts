/**
 * DAL: the coach's welcome note (T-AV33, P1-6).
 *
 * Whether anyone is welcomed is decided by the database (migration 8005): a
 * confirmed first join or a first Pass claim, never the coach, once per coach
 * and person, and the push only within the shared T-AV cap. These return what
 * was decided; lib/coachContact/welcomeDelivery renders and delivers it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export const WELCOME_NOTE_MAX = 500;

export interface ClaimedWelcome {
  recipientId: string;
  language: string | null;
  push: boolean;
  coachId: string;
  coachFirstName: string;
  note: string;
}

function parse(raw: unknown): ClaimedWelcome[] {
  const list = (raw as { notifications?: unknown } | null)?.notifications;
  if (!Array.isArray(list)) return [];
  return list.flatMap((n: Record<string, unknown>) =>
    typeof n.recipient_id === 'string' && typeof n.coach_id === 'string' && typeof n.note === 'string'
      ? [
          {
            recipientId: n.recipient_id,
            language: typeof n.language === 'string' ? n.language : null,
            push: n.push === true,
            coachId: n.coach_id,
            coachFirstName: typeof n.coach_first_name === 'string' ? n.coach_first_name : '',
            note: n.note,
          },
        ]
      : []
  );
}

async function claim(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  action: string
): Promise<DalResult<ClaimedWelcome[]>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      logError(error, { action });
      return { success: false, error: error.message };
    }
    const body = (data ?? {}) as { success?: unknown; error?: unknown };
    if (body.success !== true) return { success: false, error: String(body.error ?? 'unknown') };
    return { success: true, data: parse(data) };
  } catch (error) {
    logError(error, { action });
    return { success: false, error: 'Failed' };
  }
}

/** As the person who just joined (their own session client). */
export function claimWelcomeForJoin(supabase: SupabaseClient, sessionId: string): Promise<DalResult<ClaimedWelcome[]>> {
  return claim(supabase, 'av_claim_welcome_for_join', { p_session_id: sessionId }, 'claimWelcomeForJoin');
}

/** As the service role, from /api/pase, for the signed-in claimant. */
export function claimWelcomeForPass(
  service: SupabaseClient,
  leadId: string,
  userId: string
): Promise<DalResult<ClaimedWelcome[]>> {
  return claim(service, 'av_claim_welcome_for_pass', { p_lead_id: leadId, p_user_id: userId }, 'claimWelcomeForPass');
}

export async function saveWelcomeNote(supabase: SupabaseClient, text: string | null): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase.rpc('av_set_welcome_note', { p_text: text });
    if (error) {
      logError(error, { action: 'saveWelcomeNote' });
      return { success: false, error: error.message };
    }
    const body = (data ?? {}) as { success?: unknown; error?: unknown };
    return body.success === true ? { success: true } : { success: false, error: String(body.error ?? 'unknown') };
  } catch (error) {
    logError(error, { action: 'saveWelcomeNote' });
    return { success: false, error: 'Failed' };
  }
}

/** The signed-in coach's own note (RLS returns only their own row). */
export async function fetchMyWelcomeNote(supabase: SupabaseClient, coachId: string): Promise<DalResult<string>> {
  try {
    const { data, error } = await supabase
      .from('coach_contact_settings')
      .select('welcome_note')
      .eq('coach_id', coachId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data?.welcome_note as string | null) ?? '' };
  } catch (error) {
    logError(error, { action: 'fetchMyWelcomeNote' });
    return { success: false, error: 'Failed' };
  }
}

/**
 * DAL: coach contact settings and the contact tap log (T-AV29, P1-2).
 *
 * Every call goes through a SECURITY DEFINER function (migration 8001). The
 * tables have no client write grants, and a viewer never reads
 * coach_contact_settings directly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type ContactChannel = 'whatsapp' | 'call_link';
export type ContactSource = 'storefront' | 'session';

export interface CoachContactOptions {
  /** E.164, present only when the coach opted in and saved a number. */
  whatsapp: string | null;
  /** https URL of the coach's "Book a free call" page, or null. */
  callLink: string | null;
}

/** RPC bodies are { success, error? }; anything else counts as a failure. */
function rpcOutcome(action: string, data: unknown, error: { message: string } | null): DalResult<null> {
  if (error) {
    logError(error, { action });
    return { success: false, error: error.message };
  }
  const body = (data ?? {}) as { success?: unknown; error?: unknown };
  if (body.success === true) return { success: true };
  return { success: false, error: String(body.error ?? 'unknown') };
}

export async function fetchCoachContactOptions(
  supabase: SupabaseClient,
  coachId: string
): Promise<DalResult<CoachContactOptions>> {
  try {
    const { data, error } = await supabase.rpc('av_coach_contact_options', { p_coach_id: coachId });
    if (error) {
      logError(error, { action: 'fetchCoachContactOptions', coachId });
      return { success: false, error: error.message };
    }
    const body = (data ?? {}) as { whatsapp?: unknown; call_link?: unknown };
    // A link is rendered as an href, so only an https string is trusted here,
    // whatever the database returned.
    const callLink =
      typeof body.call_link === 'string' && body.call_link.startsWith('https://') ? body.call_link : null;
    return {
      success: true,
      data: { whatsapp: typeof body.whatsapp === 'string' ? body.whatsapp : null, callLink },
    };
  } catch (error) {
    logError(error, { action: 'fetchCoachContactOptions', coachId });
    return { success: false, error: 'Failed' };
  }
}

/** Records one tap. The caller never waits on it to open the link. */
export async function logCoachContactTap(
  supabase: SupabaseClient,
  args: { coachId: string; channel: ContactChannel; source: ContactSource; sessionId?: string | null }
): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase.rpc('av_coach_contact_tap', {
      p_coach_id: args.coachId,
      p_channel: args.channel,
      p_source: args.source,
      p_session_id: args.sessionId ?? null,
    });
    return rpcOutcome('logCoachContactTap', data, error);
  } catch (error) {
    logError(error, { action: 'logCoachContactTap', coachId: args.coachId });
    return { success: false, error: 'Failed' };
  }
}

export async function saveWhatsAppContact(
  supabase: SupabaseClient,
  optIn: boolean,
  whatsappE164: string | null
): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase.rpc('av_set_whatsapp_contact', {
      p_opt_in: optIn,
      p_whatsapp: whatsappE164,
    });
    return rpcOutcome('saveWhatsAppContact', data, error);
  } catch (error) {
    logError(error, { action: 'saveWhatsAppContact' });
    return { success: false, error: 'Failed' };
  }
}

export async function saveCallLink(supabase: SupabaseClient, url: string | null): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase.rpc('av_set_call_link', { p_url: url });
    return rpcOutcome('saveCallLink', data, error);
  } catch (error) {
    logError(error, { action: 'saveCallLink' });
    return { success: false, error: 'Failed' };
  }
}

/** The signed-in coach's own settings row (RLS returns only their own). */
export async function fetchMyContactSettings(
  supabase: SupabaseClient,
  coachId: string
): Promise<DalResult<{ whatsapp_e164: string | null; whatsapp_opt_in: boolean; call_link_url: string | null } | null>> {
  try {
    const { data, error } = await supabase
      .from('coach_contact_settings')
      .select('whatsapp_e164, whatsapp_opt_in, call_link_url')
      .eq('coach_id', coachId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? null };
  } catch (error) {
    logError(error, { action: 'fetchMyContactSettings' });
    return { success: false, error: 'Failed' };
  }
}

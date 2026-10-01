/**
 * T-AV27b. The two 8209 functions that decide who is told about a guest.
 *
 *   claimDoorNotifications   av_athletes_claim_notification, with the caller's
 *                            session (the coach or owner who just confirmed or
 *                            marked joined). arrived / joined, and the "ready"
 *                            an arrival can cause.
 *   claimLeadNotification    av_athletes_claim_lead_notification, SERVICE ROLE
 *                            only: /api/pase has no user session. claimed.
 *
 * Both return what the database decided, never more: who, in which language,
 * and whether the push is within the cap. The caller renders and delivers.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import { parseRpcBody } from './athleteGym';

export type AthleteNotifyEvent = 'claimed' | 'arrived' | 'joined' | 'ready';
const EVENTS: readonly AthleteNotifyEvent[] = ['claimed', 'arrived', 'joined', 'ready'];

export interface ClaimedNotification {
  event: AthleteNotifyEvent;
  recipientId: string;
  language: string | null;
  push: boolean;
  guestFirstName: string | null;
  athleteFirstName: string | null;
  partnerName: string;
  partnerId: string;
  leadId: string | null;
}

function toNotifications(raw: unknown): ClaimedNotification[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((n: Record<string, unknown>) => {
    const event = n.event as AthleteNotifyEvent;
    if (!EVENTS.includes(event) || typeof n.recipient_id !== 'string') return [];
    return [
      {
        event,
        recipientId: n.recipient_id,
        language: typeof n.language === 'string' ? n.language : null,
        push: n.push === true,
        guestFirstName: typeof n.guest_first_name === 'string' ? n.guest_first_name : null,
        athleteFirstName: typeof n.athlete_first_name === 'string' ? n.athlete_first_name : null,
        partnerName: String(n.partner_name ?? ''),
        partnerId: String(n.partner_id ?? ''),
        leadId: typeof n.lead_id === 'string' ? n.lead_id : null,
      },
    ];
  });
}

async function claim(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  action: string
): Promise<DalResult<ClaimedNotification[]>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      logError(error, { action });
      return { success: false, error: error.message };
    }
    const body = parseRpcBody(data);
    if (body.success !== true) {
      return { success: false, error: typeof body.error === 'string' ? body.error : 'claim_failed' };
    }
    return { success: true, data: toNotifications(body.notifications) };
  } catch (error) {
    logError(error, { action });
    return { success: false, error: 'claim_failed' };
  }
}

export function claimDoorNotifications(
  supabase: SupabaseClient,
  passCode: string,
  event: 'arrived' | 'joined'
): Promise<DalResult<ClaimedNotification[]>> {
  return claim(
    supabase,
    'av_athletes_claim_notification',
    { p_pass_code: passCode, p_event: event },
    'claimDoorNotifications'
  );
}

/** Service-role client only: the function is not granted to authenticated. */
export function claimLeadNotification(
  service: SupabaseClient,
  leadId: string
): Promise<DalResult<ClaimedNotification[]>> {
  return claim(service, 'av_athletes_claim_lead_notification', { p_lead_id: leadId }, 'claimLeadNotification');
}

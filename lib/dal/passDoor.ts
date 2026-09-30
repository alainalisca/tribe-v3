/**
 * DAL: the pass door (T-AV21). Read and confirm a guest's pass at the gym.
 *
 * Both calls go through SECURITY DEFINER RPCs from migration 8200, because a
 * coach cannot SELECT pass_leads (recon F6) and no client role may UPDATE it.
 * Call them with the SIGNED-IN user's client: the RPC decides from auth.uid()
 * whether this person may work this partner's door.
 *
 * `not_found` covers two cases on purpose, and callers must not tell them
 * apart: the code does not exist, or it belongs to a gym this person does not
 * work for. The RPC returns the same body for both so a response cannot be used
 * to learn which pass codes exist.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type ConfirmMethod = 'toggle' | 'scan' | 'code';

/** What the door may see. First name only: never the full name, email or WhatsApp. */
export interface DoorPass {
  partnerName: string;
  guestFirstName: string;
  claimedAt: string;
  attendedAt: string | null;
}

export interface ConfirmResult {
  attendedAt: string;
  alreadyConfirmed: boolean;
}

/** The RPCs return jsonb; PostgREST may hand it back parsed or as a string. */
function parseBody(raw: unknown): Record<string, unknown> {
  const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

/**
 * The door's view of one pass. `data` is null when the pass is not found for
 * this person (see the header: unknown and not-yours are one answer).
 */
export async function fetchDoorPass(supabase: SupabaseClient, passCode: string): Promise<DalResult<DoorPass | null>> {
  try {
    const { data, error } = await supabase.rpc('av_door_pass', { p_pass_code: passCode });
    if (error) {
      logError(error, { action: 'fetchDoorPass' });
      return { success: false, error: error.message };
    }
    const body = parseBody(data);
    if (body.success !== true) return { success: true, data: null };
    return {
      success: true,
      data: {
        partnerName: String(body.partner_name ?? ''),
        guestFirstName: String(body.guest_first_name ?? ''),
        claimedAt: String(body.claimed_at ?? ''),
        attendedAt: typeof body.attended_at === 'string' ? body.attended_at : null,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchDoorPass' });
    return { success: false, error: 'Failed to read the pass' };
  }
}

/**
 * Confirm the guest showed up. Idempotent in the database: a second call
 * returns the first confirmation's time with alreadyConfirmed true.
 */
export async function confirmPassAttendance(
  supabase: SupabaseClient,
  passCode: string,
  method: ConfirmMethod
): Promise<DalResult<ConfirmResult>> {
  try {
    const { data, error } = await supabase.rpc('av_confirm_pass_attendance', {
      p_pass_code: passCode,
      p_method: method,
    });
    if (error) {
      logError(error, { action: 'confirmPassAttendance' });
      return { success: false, error: error.message };
    }
    const body = parseBody(data);
    if (body.success !== true || typeof body.attended_at !== 'string') {
      return { success: false, error: typeof body.error === 'string' ? body.error : 'confirm_failed' };
    }
    return {
      success: true,
      data: { attendedAt: body.attended_at, alreadyConfirmed: body.already_confirmed === true },
    };
  } catch (error) {
    logError(error, { action: 'confirmPassAttendance' });
    return { success: false, error: 'Failed to confirm attendance' };
  }
}

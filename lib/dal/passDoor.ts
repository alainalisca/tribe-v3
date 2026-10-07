/**
 * DAL: the pass door (T-AV21, T-AV25). Read and confirm a guest's pass at the
 * gym, record what happened after class, and list the passes expected.
 *
 * Every call goes through a SECURITY DEFINER RPC (201, 206, 207), because a
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
export type DoorOutcome = 'joined' | 'follow_up' | 'not_now' | 'already_member';
export const DOOR_OUTCOMES: readonly DoorOutcome[] = ['joined', 'follow_up', 'not_now', 'already_member'];

/** What the door may see. First name only: never the full name, email or WhatsApp. */
export interface DoorPass {
  partnerName: string;
  guestFirstName: string;
  claimedAt: string;
  attendedAt: string | null;
  /** T-AV25: the referring athlete's first name, when the pass is attributed. */
  athleteFirstName: string | null;
  outcome: DoorOutcome | null;
  /** The gym's own welcome offer (athlete_programs), shown after the confirm. */
  welcomeOfferEn: string | null;
  welcomeOfferEs: string | null;
}

/** One row of the door list (av_door_list, 207): first names only. */
export interface DoorListEntry {
  guestFirstName: string;
  passCode: string;
  claimedAt: string;
  attendedAt: string | null;
  outcome: DoorOutcome | null;
  athleteFirstName: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const outcomeOf = (v: unknown): DoorOutcome | null =>
  typeof v === 'string' && (DOOR_OUTCOMES as readonly string[]).includes(v) ? (v as DoorOutcome) : null;

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
        athleteFirstName: str(body.athlete_first_name),
        outcome: outcomeOf(body.outcome),
        welcomeOfferEn: str(body.welcome_offer_en),
        welcomeOfferEs: str(body.welcome_offer_es),
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

/**
 * Record what happened after the class (av_athletes_set_outcome, 206). The
 * database refuses `joined` without a confirmed show-up (`not_attended`) and
 * a change to a retained or settled join (`locked`); those come back as the
 * error string for the caller to word.
 */
export async function setPassOutcome(
  supabase: SupabaseClient,
  passCode: string,
  outcome: DoorOutcome
): Promise<DalResult<{ outcome: DoorOutcome }>> {
  try {
    const { data, error } = await supabase.rpc('av_athletes_set_outcome', {
      p_pass_code: passCode,
      p_outcome: outcome,
    });
    if (error) {
      logError(error, { action: 'setPassOutcome' });
      return { success: false, error: error.message };
    }
    const body = parseBody(data);
    if (body.success !== true) {
      return { success: false, error: typeof body.error === 'string' ? body.error : 'outcome_failed' };
    }
    return { success: true, data: { outcome } };
  } catch (error) {
    logError(error, { action: 'setPassOutcome' });
    return { success: false, error: 'Failed to save the outcome' };
  }
}

/**
 * The passes claimed at this partner in the last 14 days (av_door_list,
 * 207), for the owner, an active coach or an admin. `data` is null for
 * everyone else and for a partner that does not exist: one answer, as with
 * the pass itself.
 */
export async function fetchDoorList(
  supabase: SupabaseClient,
  partnerId: string
): Promise<DalResult<DoorListEntry[] | null>> {
  try {
    const { data, error } = await supabase.rpc('av_door_list', { p_partner_id: partnerId });
    if (error) {
      logError(error, { action: 'fetchDoorList' });
      return { success: false, error: error.message };
    }
    const body = parseBody(data);
    if (body.success !== true || !Array.isArray(body.leads)) return { success: true, data: null };
    return {
      success: true,
      data: (body.leads as Array<Record<string, unknown>>).map((l) => ({
        guestFirstName: String(l.guest_first_name ?? ''),
        passCode: String(l.pass_code ?? ''),
        claimedAt: String(l.claimed_at ?? ''),
        attendedAt: str(l.attended_at),
        outcome: outcomeOf(l.outcome),
        athleteFirstName: str(l.athlete_first_name),
      })),
    };
  } catch (error) {
    logError(error, { action: 'fetchDoorList' });
    return { success: false, error: 'Failed to read the door list' };
  }
}

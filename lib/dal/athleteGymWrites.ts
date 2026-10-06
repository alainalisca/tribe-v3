/**
 * T-AV26. Every write the gym dashboard makes, through the SIGNED-IN USER'S
 * client. Each one is a definer function from 8205 that checks the caller's
 * partner role itself (owner or admin; outcomes also accept an active coach),
 * so these wrappers only translate the function's answer.
 *
 * "Oferta enviada" is NOT here: it reuses setPassLeadContacted
 * (lib/dal/leadContact.ts, set_pass_lead_contacted), so there is one writer
 * of contacted_at (spec D13).
 *
 * updateProgramSettings is called by the settings route on the server, with
 * the owner's session. RLS ("Owner or admin edits the program") and the column
 * grants decide; no service role is involved anywhere in this file.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { AthleteLevel } from './athleteHome';
import type { AthleteStatus } from './athleteGym';
import { parseRpcBody } from './athleteGym';
import type { ProgramSettings } from '@/lib/atletas/gymSettings';

/** Run a definer write that answers {success, error?}; the error is its own word. */
async function callWrite(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  action: string
): Promise<DalResult<Record<string, unknown>>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      logError(error, { action });
      return { success: false, error: error.message };
    }
    const body = parseRpcBody(data);
    if (body.success !== true) {
      return { success: false, error: typeof body.error === 'string' ? body.error : 'write_failed' };
    }
    return { success: true, data: body };
  } catch (error) {
    logError(error, { action });
    return { success: false, error: 'write_failed' };
  }
}

/**
 * av_athletes_add. `whatsappE164` must already be E.164 or null: the caller
 * normalizes with lib/pase/phone.ts first (the function takes E.164 only).
 * Errors the form words: program_full, already_added, invalid_whatsapp.
 */
export function addProgramAthlete(
  supabase: SupabaseClient,
  partnerId: string,
  userId: string,
  whatsappE164: string | null
): Promise<DalResult<Record<string, unknown>>> {
  return callWrite(
    supabase,
    'av_athletes_add',
    { p_partner_id: partnerId, p_user_id: userId, p_whatsapp: whatsappE164 },
    'addProgramAthlete'
  );
}

export function setProgramAthleteStatus(
  supabase: SupabaseClient,
  programAthleteId: string,
  status: AthleteStatus
): Promise<DalResult<Record<string, unknown>>> {
  return callWrite(
    supabase,
    'av_athletes_set_status',
    { p_program_athlete_id: programAthleteId, p_status: status },
    'setProgramAthleteStatus'
  );
}

export function setProgramAthleteLevel(
  supabase: SupabaseClient,
  programAthleteId: string,
  level: AthleteLevel
): Promise<DalResult<Record<string, unknown>>> {
  return callWrite(
    supabase,
    'av_athletes_set_level',
    { p_program_athlete_id: programAthleteId, p_level: level },
    'setProgramAthleteLevel'
  );
}

/** av_athletes_mark_retained. Refuses `too_early` before outcome_at + retention_days. */
export function markLeadRetained(
  supabase: SupabaseClient,
  leadId: string
): Promise<DalResult<Record<string, unknown>>> {
  return callWrite(supabase, 'av_athletes_mark_retained', { p_lead_id: leadId }, 'markLeadRetained');
}

/** av_athletes_mark_bonus_settled. Only an eligible, credited join. */
export function markLeadBonusSettled(
  supabase: SupabaseClient,
  leadId: string
): Promise<DalResult<Record<string, unknown>>> {
  return callWrite(supabase, 'av_athletes_mark_bonus_settled', { p_lead_id: leadId }, 'markLeadBonusSettled');
}

/**
 * Update the editable athlete_programs columns. Never partner_id, never
 * is_active (admin-only, behind its trigger): ProgramSettings has neither.
 *
 * Returns data:false when the update touched no row. That is what RLS does to
 * a caller who is not owner or admin (USING filters the row out, no error),
 * and the route answers it as a 404.
 */
export async function updateProgramSettings(
  supabase: SupabaseClient,
  partnerId: string,
  settings: ProgramSettings
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('athlete_programs')
      .update(settings)
      .eq('partner_id', partnerId)
      .select('partner_id');
    if (error) {
      logError(error, { action: 'updateProgramSettings' });
      return { success: false, error: error.message };
    }
    return { success: true, data: Array.isArray(data) && data.length > 0 };
  } catch (error) {
    logError(error, { action: 'updateProgramSettings' });
    return { success: false, error: 'Failed to save the settings' };
  }
}

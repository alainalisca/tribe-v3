/**
 * T-AV26. The reads behind the gym dashboard /atletas/gym/[partnerId]/, all
 * made with the SIGNED-IN USER'S client, so the definer functions and RLS
 * decide what comes back, never this file.
 *
 *   fetchPartnerSummary   av_athletes_partner_summary (8206): every number on
 *                         the dashboard. Owner and admin get the bonus fields
 *                         and sales notes; a coach gets neither, at any depth.
 *   fetchMyPartnerRole    av_my_partner_role (8201), for the settings page and
 *                         route's own owner check.
 *   searchAthleteCandidates
 *                         av_athletes_search_candidates (8208): id, name and
 *                         avatar only, owner or admin only, rate limited.
 *
 * The writes are in athleteGymWrites.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { AthleteLevel } from './athleteHome';
import type { DoorOutcome } from './passDoor';

export type PartnerRole = 'owner' | 'coach' | 'admin';
export type AthleteStatus = 'active' | 'paused' | 'ended';

/** The program row as partner_summary returns it. Bonus fields: owner and admin only. */
export interface SummaryProgram {
  partner_id: string;
  is_active: boolean;
  welcome_offer_en: string | null;
  welcome_offer_es: string | null;
  showup_reward_en: string | null;
  showup_reward_es: string | null;
  class_access_en: string | null;
  class_access_es: string | null;
  retention_days: number;
  promote_at_showups: number;
  max_athletes: number;
  pilot_starts_on: string | null;
  pilot_ends_on: string | null;
  conversion_bonus_cop?: number | null;
  conversion_bonus_note_en?: string | null;
  conversion_bonus_note_es?: string | null;
}

export interface SummaryAthlete {
  program_athlete_id: string;
  first_name: string;
  level: AthleteLevel;
  status: AthleteStatus;
  ref_code: string;
  started_on: string;
  invited: number;
  not_credited: number;
  showed_up: number;
  joined: number;
  retained: number;
  ready_to_promote: boolean;
  bonus_owed?: number;
  bonus_settled?: number;
  email_lower?: string | null;
  whatsapp_e164?: string | null;
}

export interface SummaryGuest {
  lead_id: string;
  first_name: string | null;
  pass_code: string;
  claimed_at: string;
  attended_at: string | null;
  outcome: DoorOutcome | null;
  retained_at: string | null;
  athlete_first_name: string;
  credited: boolean;
  no_credit_reason: string | null;
  bonus_eligible?: boolean;
  bonus_owed?: boolean;
  bonus_settled_at?: string | null;
  contacted_at?: string | null;
  retain_from?: string | null;
}

export interface SummaryTotals {
  invited: number;
  not_credited: number;
  showed_up: number;
  joined: number;
  retained: number;
  to_close: number;
  bonus_owed?: number;
  bonus_settled?: number;
}

/** av_athletes_partner_summary's success body, exactly. */
export interface PartnerSummary {
  role: PartnerRole;
  program: SummaryProgram;
  athletes: SummaryAthlete[];
  guests: SummaryGuest[];
  totals: SummaryTotals;
}

export interface AthleteCandidate {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** The RPCs return jsonb; PostgREST may hand it back parsed or as a string. */
export function parseRpcBody(raw: unknown): Record<string, unknown> {
  const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

const ROLES: readonly PartnerRole[] = ['owner', 'coach', 'admin'];
const isRole = (v: unknown): v is PartnerRole => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/**
 * The partner's summary, or null when the caller is not owner, coach or admin
 * of a partner with a program (the function answers not_found for both, so
 * neither is distinguishable from a partner that does not exist).
 */
export async function fetchPartnerSummary(
  supabase: SupabaseClient,
  partnerId: string
): Promise<DalResult<PartnerSummary | null>> {
  try {
    const { data, error } = await supabase.rpc('av_athletes_partner_summary', { p_partner_id: partnerId });
    if (error) {
      logError(error, { action: 'fetchPartnerSummary' });
      return { success: false, error: error.message };
    }
    const body = parseRpcBody(data);
    if (body.success === false && body.error === 'not_found') return { success: true, data: null };
    if (
      body.success === true &&
      isRole(body.role) &&
      body.program &&
      Array.isArray(body.athletes) &&
      Array.isArray(body.guests) &&
      body.totals
    ) {
      return { success: true, data: body as unknown as PartnerSummary };
    }
    logError(new Error('av_athletes_partner_summary returned an unexpected shape'), { action: 'fetchPartnerSummary' });
    return { success: false, error: 'unexpected_shape' };
  } catch (error) {
    logError(error, { action: 'fetchPartnerSummary' });
    return { success: false, error: 'Failed to read the summary' };
  }
}

/** The caller's role at this partner, or null. A transport error is a failure, not a null. */
export async function fetchMyPartnerRole(
  supabase: SupabaseClient,
  partnerId: string
): Promise<DalResult<PartnerRole | null>> {
  try {
    const { data, error } = await supabase.rpc('av_my_partner_role', { p_partner_id: partnerId });
    if (error) {
      logError(error, { action: 'fetchMyPartnerRole' });
      return { success: false, error: error.message };
    }
    return { success: true, data: isRole(data) ? data : null };
  } catch (error) {
    logError(error, { action: 'fetchMyPartnerRole' });
    return { success: false, error: 'Failed to read the role' };
  }
}

/** Shortest query the function accepts; the field does not ask before this. */
export const SEARCH_MIN_CHARS = 3;

/**
 * Candidates for "Add athlete". `error` is the function's own word
 * (too_short, rate_limited, not_found) so the form can stay quiet on the
 * first and say something on the others.
 */
export async function searchAthleteCandidates(
  supabase: SupabaseClient,
  partnerId: string,
  query: string
): Promise<DalResult<AthleteCandidate[]>> {
  try {
    const { data, error } = await supabase.rpc('av_athletes_search_candidates', {
      p_partner_id: partnerId,
      p_query: query,
    });
    if (error) {
      logError(error, { action: 'searchAthleteCandidates' });
      return { success: false, error: error.message };
    }
    const body = parseRpcBody(data);
    if (body.success !== true || !Array.isArray(body.results)) {
      return { success: false, error: typeof body.error === 'string' ? body.error : 'search_failed' };
    }
    return {
      success: true,
      data: (body.results as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        avatarUrl: typeof r.avatar_url === 'string' && r.avatar_url !== '' ? r.avatar_url : null,
      })),
    };
  } catch (error) {
    logError(error, { action: 'searchAthleteCandidates' });
    return { success: false, error: 'Failed to search' };
  }
}

/**
 * Does this partner have an athletes program the caller can see. For the
 * entry card on /dashboard/partner: without a program the dashboard is a 404,
 * so the card must not lead there. "Program staff read the program" (8201)
 * lets the owner, an active coach or an admin read the row; anyone else, or an
 * error, is false.
 */
export async function hasAthleteProgram(supabase: SupabaseClient, partnerId: string): Promise<boolean> {
  if (!partnerId) return false;
  try {
    const { data, error } = await supabase
      .from('athlete_programs')
      .select('partner_id')
      .eq('partner_id', partnerId)
      .maybeSingle();
    if (error) {
      logError(error, { action: 'hasAthleteProgram' });
      return false;
    }
    return data !== null;
  } catch (error) {
    logError(error, { action: 'hasAthleteProgram' });
    return false;
  }
}

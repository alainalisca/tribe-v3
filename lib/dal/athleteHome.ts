/**
 * T-AV24. The reads behind /atletas/, all made with the SIGNED-IN USER'S
 * client, so row-level security and the definer function decide what comes
 * back, never this file.
 *
 *   fetchMyAthleteSummary   av_athletes_my_summary() (207): scoped to
 *                           auth.uid() in the database. Guests carry first
 *                           name, claim date, collapsed status and the
 *                           no-credit reason; never contact details (D4).
 *   fetchPartnerSlug        featured_partners.slug, readable for active
 *                           partners; a pass only works for one anyway.
 *   fetchOwnProfileBasics   the caller's own name and photo.
 *   hasActiveAthleteRow     for the Home card: a boolean and nothing else.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type GuestStatus = 'claimed' | 'showed_up' | 'joined' | 'retained';
export type AthleteLevel = 'captain' | 'athlete' | 'sponsored';

export interface MySummaryGuest {
  first_name: string | null;
  claimed_at: string;
  status: GuestStatus;
  no_credit_reason: string | null;
}

/** One program entry exactly as av_athletes_my_summary returns it. */
export interface MySummaryProgram {
  partner_id: string;
  partner_name: string;
  program_active: boolean | null;
  program_athlete_id: string;
  level: AthleteLevel;
  status: 'active' | 'paused' | 'ended';
  ref_code: string;
  started_on: string;
  welcome_offer_en: string | null;
  welcome_offer_es: string | null;
  showup_reward_en: string | null;
  showup_reward_es: string | null;
  class_access_en: string | null;
  class_access_es: string | null;
  conversion_bonus_cop: number | null;
  conversion_bonus_note_en: string | null;
  conversion_bonus_note_es: string | null;
  counts: {
    invited: number;
    not_credited: number;
    showed_up: number;
    joined: number;
    retained: number;
    bonus_owed: number;
    bonus_settled: number;
  };
  ready_to_promote: boolean;
  progress: { showups: number; promote_at: number };
  guests: MySummaryGuest[];
}

/**
 * The caller's programs, newest first. An empty list means "not in a
 * program" (the function answers not_found for a non-athlete); only a
 * transport error is a failure.
 */
export async function fetchMyAthleteSummary(supabase: SupabaseClient): Promise<DalResult<MySummaryProgram[]>> {
  const { data, error } = await supabase.rpc('av_athletes_my_summary');
  if (error) {
    logError(error, { action: 'fetchMyAthleteSummary' });
    return { success: false, error: error.message };
  }
  const body = data as { success?: boolean; error?: string; programs?: MySummaryProgram[] } | null;
  if (body?.success === true && Array.isArray(body.programs)) return { success: true, data: body.programs };
  if (body?.success === false && body.error === 'not_found') return { success: true, data: [] };
  logError(new Error('av_athletes_my_summary returned an unexpected shape'), { action: 'fetchMyAthleteSummary' });
  return { success: false, error: 'unexpected_shape' };
}

export async function fetchPartnerSlug(supabase: SupabaseClient, partnerId: string): Promise<string | null> {
  const { data, error } = await supabase.from('featured_partners').select('slug').eq('id', partnerId).maybeSingle();
  if (error) {
    logError(error, { action: 'fetchPartnerSlug', partnerId });
    return null;
  }
  return typeof data?.slug === 'string' && data.slug !== '' ? data.slug : null;
}

export async function fetchOwnProfileBasics(
  supabase: SupabaseClient,
  userId: string
): Promise<{ name: string | null; avatarUrl: string | null }> {
  const { data, error } = await supabase.from('users').select('name, avatar_url').eq('id', userId).maybeSingle();
  if (error) {
    logError(error, { action: 'fetchOwnProfileBasics' });
    return { name: null, avatarUrl: null };
  }
  return { name: data?.name ?? null, avatarUrl: data?.avatar_url ?? null };
}

/**
 * Does the caller have an ACTIVE program_athletes row. RLS lets a user read
 * only their own row (203), and only `id` is selected, so nothing about the
 * row leaves this function except the boolean.
 */
export async function hasActiveAthleteRow(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('program_athletes')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);
  if (error) {
    logError(error, { action: 'hasActiveAthleteRow' });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

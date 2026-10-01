/**
 * T-AV27b. The Tribe-staff screen /admin/atletas/, through the ADMIN'S OWN
 * session (Al, 2026-10-01: not the service role, same pattern as the T-AV26
 * settings route). Every write here is one the database already reserves for
 * an app admin, so a second, independent layer refuses a non-admin even if a
 * caller skips the route's own check:
 *
 *   createAthleteProgram  INSERT on athlete_programs: "Admins create programs" (8201)
 *   setProgramActive      UPDATE of is_active: the av_athlete_programs_guard
 *                         trigger raises 42501 for anyone but an admin (8201)
 *
 * Reads: an admin sees every program ("Program staff read the program", via
 * av_my_partner_role = 'admin') and every partner ("admin reads all").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface AdminProgram {
  partnerId: string;
  partnerName: string;
  isActive: boolean;
}

export interface AdminPartnerOption {
  id: string;
  name: string;
}

export async function fetchAdminPrograms(supabase: SupabaseClient): Promise<DalResult<AdminProgram[]>> {
  try {
    const [programs, partners] = await Promise.all([
      supabase.from('athlete_programs').select('partner_id, is_active'),
      supabase.from('featured_partners').select('id, business_name'),
    ]);
    if (programs.error || partners.error) {
      logError(programs.error ?? partners.error, { action: 'fetchAdminPrograms' });
      return { success: false, error: 'read_failed' };
    }
    const names = new Map((partners.data ?? []).map((p) => [p.id as string, String(p.business_name ?? '')]));
    const rows = (programs.data ?? []).map((p) => ({
      partnerId: p.partner_id as string,
      partnerName: names.get(p.partner_id as string) ?? '',
      isActive: p.is_active === true,
    }));
    rows.sort((a, b) => a.partnerName.localeCompare(b.partnerName));
    return { success: true, data: rows };
  } catch (error) {
    logError(error, { action: 'fetchAdminPrograms' });
    return { success: false, error: 'read_failed' };
  }
}

/** Partners that do not have a program yet, for "Crear programa". */
export async function fetchPartnersWithoutProgram(
  supabase: SupabaseClient,
  programs: readonly AdminProgram[]
): Promise<DalResult<AdminPartnerOption[]>> {
  try {
    const { data, error } = await supabase.from('featured_partners').select('id, business_name').order('business_name');
    if (error) {
      logError(error, { action: 'fetchPartnersWithoutProgram' });
      return { success: false, error: error.message };
    }
    const taken = new Set(programs.map((p) => p.partnerId));
    return {
      success: true,
      data: (data ?? [])
        .filter((p) => !taken.has(p.id as string))
        .map((p) => ({ id: p.id as string, name: String(p.business_name ?? '') })),
    };
  } catch (error) {
    logError(error, { action: 'fetchPartnersWithoutProgram' });
    return { success: false, error: 'read_failed' };
  }
}

/** A new program for a partner, with the table's defaults: off until switched on. */
export async function createAthleteProgram(supabase: SupabaseClient, partnerId: string): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('athlete_programs')
      .insert({ partner_id: partnerId })
      .select('partner_id');
    if (error) {
      logError(error, { action: 'createAthleteProgram' });
      return { success: false, error: error.code === '23505' ? 'exists' : error.message };
    }
    return { success: true, data: Array.isArray(data) && data.length > 0 };
  } catch (error) {
    logError(error, { action: 'createAthleteProgram' });
    return { success: false, error: 'write_failed' };
  }
}

/** Switch a program on or off. data:false when no row was updated. */
export async function setProgramActive(
  supabase: SupabaseClient,
  partnerId: string,
  active: boolean
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('athlete_programs')
      .update({ is_active: active })
      .eq('partner_id', partnerId)
      .select('partner_id');
    if (error) {
      logError(error, { action: 'setProgramActive' });
      return { success: false, error: error.code === '42501' ? 'forbidden' : error.message };
    }
    return { success: true, data: Array.isArray(data) && data.length > 0 };
  } catch (error) {
    logError(error, { action: 'setProgramActive' });
    return { success: false, error: 'write_failed' };
  }
}

/** is_app_admin() for the caller, strictly true. A transport error is a failure. */
export async function fetchIsAppAdmin(supabase: SupabaseClient): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase.rpc('is_app_admin');
    if (error) {
      logError(error, { action: 'fetchIsAppAdmin' });
      return { success: false, error: error.message };
    }
    return { success: true, data: data === true };
  } catch (error) {
    logError(error, { action: 'fetchIsAppAdmin' });
    return { success: false, error: 'read_failed' };
  }
}

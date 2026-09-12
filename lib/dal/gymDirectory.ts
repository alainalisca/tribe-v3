/**
 * DAL: finding gyms, as opposed to attaching one to a session (T-GYM2).
 *
 * Split out of gymVenue.ts, which reached the 300-line limit. The division is
 * by question rather than by size: gymVenue answers "what is this session's
 * venue and who decides", this file answers "which gyms exist and how big are
 * they" -- the discover section, the venue picker's list, and the storefront's
 * stats.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import { GYM_IDENTITY_COLUMNS, ORGANIZATION_TYPES, type GymIdentity } from './gymVenue';

/**
 * User ids of active gyms and studios, for excluding them from instructor
 * discovery.
 *
 * Filters on business_type, NOT on partner membership alone. Both partners live
 * today are business_type 'independent' -- solo trainers with a featured
 * listing -- and they are instructors: excluding every active partner would
 * delete two real people from /instructors to solve a gym problem.
 */
export async function fetchOrganizationUserIds(supabase: SupabaseClient): Promise<DalResult<string[]>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .select('user_id')
      .eq('status', 'active')
      .in('business_type', [...ORGANIZATION_TYPES]);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => r.user_id as string).filter(Boolean) };
  } catch (error) {
    logError(error, { action: 'fetchOrganizationUserIds' });
    return { success: false, error: 'Failed to fetch organization accounts' };
  }
}

/** A gym or studio tile in the "Gimnasios y estudios" discover section. */
export interface GymDirectoryEntry extends GymIdentity {
  address: string | null;
  specialties: string[] | null;
  coachCount: number;
  /**
   * The gym account's avatar, used when logo_url is null -- the same fallback
   * the storefront header uses, so a gym cannot show its logo on one surface
   * and a monogram on the other. Verified readable by `anon` before adding the
   * embed: public.users is under a column-level SELECT regime, and an
   * ungranted column does not degrade the embed, it fails the whole read.
   */
  accountAvatarUrl: string | null;
  /** Approved sessions at this venue in the next seven days. */
  sessionsPerWeek: number;
}

/** Active gyms and studios with their roster sizes, for the discover section. */
export async function fetchGymsAndStudios(supabase: SupabaseClient): Promise<DalResult<GymDirectoryEntry[]>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .select(`${GYM_IDENTITY_COLUMNS}, address, specialties, display_order, user:users(avatar_url)`)
      .eq('status', 'active')
      .in('business_type', [...ORGANIZATION_TYPES])
      // Editorial placement first (161), then alphabetical. Same precedence as
      // the Featured Affiliate carousel, so a gym Al places at the front of one
      // surface is at the front of both.
      .order('display_order', { ascending: false })
      .order('business_name', { ascending: true });

    if (error) return { success: false, error: error.message };

    const partners = (data ?? []) as unknown as Omit<GymDirectoryEntry, 'coachCount'>[];
    if (partners.length === 0) return { success: true, data: [] };

    // One roster query for every gym on the page, counted in memory. A count
    // per gym would be a request per tile.
    const { data: roster, error: rosterError } = await supabase
      .from('partner_instructors')
      .select('partner_id')
      .in(
        'partner_id',
        partners.map((p) => p.id)
      )
      .eq('is_active', true);

    if (rosterError) return { success: false, error: rosterError.message };

    const counts = new Map<string, number>();
    for (const row of roster ?? []) {
      const key = row.partner_id as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Approved sessions in the next seven days, for every gym at once.
    //
    // Read through sessions_public, not sessions: this page renders logged out
    // and 140 revoked anon from the base table. Counted in memory rather than
    // with a grouped select because THIS POSTGREST HAS AGGREGATES DISABLED --
    // `select=partner_id,count()` returns PGRST123 "Use of aggregate functions
    // is not allowed". One query either way; the rows are bounded by a
    // seven-day window at partner venues, and this needs no server config.
    const today = new Date();
    const week = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: upcoming, error: upcomingError } = await supabase
      .from('sessions_public')
      .select('partner_id')
      .in(
        'partner_id',
        partners.map((p) => p.id)
      )
      .eq('partner_status', 'approved')
      .eq('status', 'active')
      .gte('date', iso(today))
      .lte('date', iso(week));

    if (upcomingError) return { success: false, error: upcomingError.message };

    const weekly = new Map<string, number>();
    for (const row of upcoming ?? []) {
      const key = row.partner_id as string;
      weekly.set(key, (weekly.get(key) ?? 0) + 1);
    }

    return {
      success: true,
      data: partners.map((p) => ({
        ...p,
        coachCount: counts.get(p.id) ?? 0,
        sessionsPerWeek: weekly.get(p.id) ?? 0,
        accountAvatarUrl: (p as unknown as { user?: { avatar_url?: string | null } | null }).user?.avatar_url ?? null,
      })),
    };
  } catch (error) {
    logError(error, { action: 'fetchGymsAndStudios' });
    return { success: false, error: 'Failed to fetch gyms and studios' };
  }
}

/**
 * How many approved sessions this gym hosts in the next seven days.
 *
 * The gym's own sessions and its roster's, counted the same way: by
 * partner_id, which is what "at this venue" means now. Not by creator, because
 * a roster coach's session elsewhere is not the gym's, and a non-roster
 * instructor's approved session here is.
 *
 * One count query, head-only -- the storefront needs the number, not the rows.
 */
export async function fetchGymSessionsPerWeek(supabase: SupabaseClient, partnerId: string): Promise<DalResult<number>> {
  if (!partnerId) return { success: true, data: 0 };
  try {
    const today = new Date();
    const week = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { count, error } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', partnerId)
      .eq('partner_status', 'approved')
      .eq('status', 'active')
      .gte('date', iso(today))
      .lte('date', iso(week));

    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchGymSessionsPerWeek', partnerId });
    return { success: false, error: 'Failed to count sessions' };
  }
}

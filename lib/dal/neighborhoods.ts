// Data Access Layer: neighborhood stats for the home-page Explore section.
//
// Sessions store `location` as free text ("parque lleras", "Carrera 70 #45-12,
// Laureles") rather than a normalized neighborhood id, and `location_lat /
// location_lng` are nearly always NULL on real seeded rows. So the home-page
// "Explore Medellín" cards bucket sessions and instructors by substring-
// matching the free-text `location` field against each neighborhood's
// configured locationKeywords. One round-trip per surface, then bucket
// client-side — much cheaper than the per-neighborhood loop the component
// used to do.

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { Neighborhood } from '@/lib/city-config';
import { locationMatchesNeighborhood } from '@/lib/city-config';
import type { DalResult } from './types';

export interface NeighborhoodStats {
  sessionCount: number;
  instructorCount: number;
}

/**
 * Fetch session + instructor counts per neighborhood for the supplied list.
 *
 * Returns a record keyed by `Neighborhood.id`. Counts are derived by
 * substring-matching free-text `location` strings against each
 * neighborhood's `locationKeywords` (see lib/city-config.ts). Sessions
 * filter on `status = 'active'`; instructors filter on `is_instructor =
 * true AND is_test_account = false` (test accounts hidden by migration 052).
 */
export async function fetchNeighborhoodStats(
  supabase: SupabaseClient,
  hoods: Neighborhood[]
): Promise<DalResult<Record<string, NeighborhoodStats>>> {
  try {
    const result: Record<string, NeighborhoodStats> = {};
    for (const hood of hoods) {
      result[hood.id] = { sessionCount: 0, instructorCount: 0 };
    }

    // 1. Active sessions — pull location + creator_id only.
    const { data: sessions, error: sessErr } = await supabase
      .from('sessions')
      .select('location, creator_id')
      .eq('status', 'active');

    if (sessErr) return { success: false, error: sessErr.message };

    // 2. Live (non-test) instructors — pull id + location only.
    const { data: instructors, error: instErr } = await supabase
      .from('users')
      .select('id, location')
      .eq('is_instructor', true)
      .eq('is_test_account', false);

    if (instErr) return { success: false, error: instErr.message };

    for (const hood of hoods) {
      const matchingSessions = (sessions ?? []).filter((s) => locationMatchesNeighborhood(s.location, hood));
      const matchingInstructors = (instructors ?? []).filter((u) => locationMatchesNeighborhood(u.location, hood));

      // Combine instructors who teach in the area (their session.location
      // matches) with instructors whose own profile.location matches. A
      // user counts once even if both apply.
      const instructorIds = new Set<string>();
      for (const s of matchingSessions) {
        if (s.creator_id) instructorIds.add(s.creator_id);
      }
      for (const u of matchingInstructors) {
        if (u.id) instructorIds.add(u.id);
      }

      result[hood.id] = {
        sessionCount: matchingSessions.length,
        instructorCount: instructorIds.size,
      };
    }

    return { success: true, data: result };
  } catch (error) {
    logError(error, { action: 'fetchNeighborhoodStats' });
    return { success: false, error: 'Failed to fetch neighborhood stats' };
  }
}

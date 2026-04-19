/** DAL: instructor_spotlight — weekly instructor-of-the-week rotation. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface SpotlightWithInstructor {
  id: string;
  start_date: string;
  end_date: string;
  featured_quote: string | null;
  featured_quote_es: string | null;
  selection_reason: string | null;
  instructor: {
    id: string;
    name: string;
    avatar_url: string | null;
    storefront_banner_url: string | null;
    storefront_tagline: string | null;
    specialties: string[];
    average_rating: number | null;
    total_reviews: number | null;
    total_sessions_hosted: number | null;
    is_verified_instructor: boolean | null;
  } | null;
}

const INSTRUCTOR_FIELDS =
  'id, name, avatar_url, storefront_banner_url, storefront_tagline, specialties, average_rating, total_reviews, total_sessions_hosted, is_verified_instructor';

/** The currently-active spotlight (today between start and end, and is_active). */
export async function getCurrentSpotlight(
  supabase: SupabaseClient
): Promise<DalResult<SpotlightWithInstructor | null>> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('instructor_spotlight')
      .select(
        `
        id, start_date, end_date, featured_quote, featured_quote_es, selection_reason,
        instructor:instructor_id(${INSTRUCTOR_FIELDS})
      `
      )
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, data: null };

    const row = data as Record<string, unknown>;
    const instRel = row.instructor as Record<string, unknown> | null;
    return {
      success: true,
      data: {
        id: row.id as string,
        start_date: row.start_date as string,
        end_date: row.end_date as string,
        featured_quote: (row.featured_quote as string | null) ?? null,
        featured_quote_es: (row.featured_quote_es as string | null) ?? null,
        selection_reason: (row.selection_reason as string | null) ?? null,
        instructor: instRel
          ? {
              id: instRel.id as string,
              name: instRel.name as string,
              avatar_url: (instRel.avatar_url as string | null) ?? null,
              storefront_banner_url: (instRel.storefront_banner_url as string | null) ?? null,
              storefront_tagline: (instRel.storefront_tagline as string | null) ?? null,
              specialties: (instRel.specialties as string[] | null) || [],
              average_rating: (instRel.average_rating as number | null) ?? null,
              total_reviews: (instRel.total_reviews as number | null) ?? null,
              total_sessions_hosted: (instRel.total_sessions_hosted as number | null) ?? null,
              is_verified_instructor: (instRel.is_verified_instructor as boolean | null) ?? null,
            }
          : null,
      },
    };
  } catch (error) {
    logError(error, { action: 'getCurrentSpotlight' });
    return { success: false, error: 'Failed to fetch spotlight' };
  }
}

/** Past spotlights, most recent first. */
export async function getSpotlightHistory(
  supabase: SupabaseClient,
  limit: number = 10
): Promise<DalResult<SpotlightWithInstructor[]>> {
  try {
    const { data, error } = await supabase
      .from('instructor_spotlight')
      .select(
        `
        id, start_date, end_date, featured_quote, featured_quote_es, selection_reason,
        instructor:instructor_id(${INSTRUCTOR_FIELDS})
      `
      )
      .order('start_date', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const items: SpotlightWithInstructor[] = (data || []).map((row: Record<string, unknown>) => {
      const instRel = row.instructor as Record<string, unknown> | null;
      return {
        id: row.id as string,
        start_date: row.start_date as string,
        end_date: row.end_date as string,
        featured_quote: (row.featured_quote as string | null) ?? null,
        featured_quote_es: (row.featured_quote_es as string | null) ?? null,
        selection_reason: (row.selection_reason as string | null) ?? null,
        instructor: instRel
          ? {
              id: instRel.id as string,
              name: instRel.name as string,
              avatar_url: (instRel.avatar_url as string | null) ?? null,
              storefront_banner_url: (instRel.storefront_banner_url as string | null) ?? null,
              storefront_tagline: (instRel.storefront_tagline as string | null) ?? null,
              specialties: (instRel.specialties as string[] | null) || [],
              average_rating: (instRel.average_rating as number | null) ?? null,
              total_reviews: (instRel.total_reviews as number | null) ?? null,
              total_sessions_hosted: (instRel.total_sessions_hosted as number | null) ?? null,
              is_verified_instructor: (instRel.is_verified_instructor as boolean | null) ?? null,
            }
          : null,
      };
    });

    return { success: true, data: items };
  } catch (error) {
    logError(error, { action: 'getSpotlightHistory' });
    return { success: false, error: 'Failed to fetch spotlight history' };
  }
}

/**
 * Algorithmically select the next instructor to spotlight.
 * Requires service role or RLS bypass at the caller site if inserting.
 */
export async function selectNextSpotlight(
  supabase: SupabaseClient
): Promise<DalResult<{ instructor_id: string } | null>> {
  try {
    // Anyone spotlighted in the last 60 days is off-limits
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const { data: recent, error: recentErr } = await supabase
      .from('instructor_spotlight')
      .select('instructor_id')
      .gte('start_date', cutoff);
    if (recentErr) return { success: false, error: recentErr.message };
    const excluded = new Set((recent || []).map((r) => (r as { instructor_id: string }).instructor_id));

    // Candidate instructors — verified, active, with upcoming sessions
    const todayIso = new Date().toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    const { data: candidates, error: candErr } = await supabase
      .from('users')
      .select('id, average_rating, total_reviews, total_sessions_hosted, total_participants_served')
      .eq('is_instructor', true)
      .eq('is_verified_instructor', true)
      .gte('total_sessions_hosted', 5)
      .gte('average_rating', 4.0);
    if (candErr) return { success: false, error: candErr.message };

    const eligibleIds = (candidates || []).map((c) => (c as { id: string }).id).filter((id) => !excluded.has(id));

    if (eligibleIds.length === 0) return { success: true, data: null };

    const { data: withSession, error: sessErr } = await supabase
      .from('sessions')
      .select('creator_id')
      .in('creator_id', eligibleIds)
      .eq('status', 'active')
      .gte('date', todayIso)
      .lte('date', in14);
    if (sessErr) return { success: false, error: sessErr.message };

    const hasSession = new Set((withSession || []).map((s) => (s as { creator_id: string }).creator_id));

    const scored = (candidates || [])
      .filter((c) => hasSession.has((c as { id: string }).id))
      .map((c) => {
        const row = c as {
          id: string;
          average_rating: number | null;
          total_reviews: number | null;
          total_sessions_hosted: number | null;
          total_participants_served: number | null;
        };
        const rating = row.average_rating ?? 0;
        const sessions = row.total_sessions_hosted ?? 0;
        const athletes = row.total_participants_served ?? 0;
        const score = rating * 0.4 + Math.log1p(sessions) * 0.3 + Math.log1p(athletes) * 0.2;
        return { id: row.id, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return { success: true, data: null };
    return { success: true, data: { instructor_id: scored[0].id } };
  } catch (error) {
    logError(error, { action: 'selectNextSpotlight' });
    return { success: false, error: 'Failed to select spotlight' };
  }
}

/** Create a new spotlight record (caller is responsible for service role). */
export async function createSpotlight(
  supabase: SupabaseClient,
  instructorId: string,
  startDate: string,
  endDate: string,
  reason: string = 'algorithmic',
  quote?: string,
  quoteEs?: string
): Promise<DalResult<{ id: string }>> {
  try {
    const { data, error } = await supabase
      .from('instructor_spotlight')
      .insert({
        instructor_id: instructorId,
        start_date: startDate,
        end_date: endDate,
        selection_reason: reason,
        featured_quote: quote ?? null,
        featured_quote_es: quoteEs ?? null,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'createSpotlight' });
    return { success: false, error: 'Failed to create spotlight' };
  }
}

/** Deactivate a spotlight. */
export async function endSpotlight(supabase: SupabaseClient, spotlightId: string): Promise<DalResult<void>> {
  try {
    const { error } = await supabase.from('instructor_spotlight').update({ is_active: false }).eq('id', spotlightId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'endSpotlight', spotlightId });
    return { success: false, error: 'Failed to end spotlight' };
  }
}

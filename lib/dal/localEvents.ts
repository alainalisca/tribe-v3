/** DAL: local_fitness_events — curated directory of real Medellín fitness events */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface LocalFitnessEvent {
  id: string;
  name: string;
  description_en: string | null;
  description_es: string | null;
  sport_type: string;
  event_type: string;
  location_name: string;
  location_lat: number | null;
  location_lng: number | null;
  address: string | null;
  start_date: string | null;
  end_date: string | null;
  recurrence_pattern: string | null;
  recurrence_day: string | null;
  start_time: string | null;
  end_time: string | null;
  organizer: string | null;
  website_url: string | null;
  is_free: boolean;
  price_info: string | null;
  difficulty: string;
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalEventInsert {
  name: string;
  description_en?: string | null;
  description_es?: string | null;
  sport_type: string;
  event_type?: string;
  location_name: string;
  location_lat?: number | null;
  location_lng?: number | null;
  address?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  recurrence_pattern?: string | null;
  recurrence_day?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  organizer?: string | null;
  website_url?: string | null;
  is_free?: boolean;
  price_info?: string | null;
  difficulty?: string;
  image_url?: string | null;
  is_active?: boolean;
  created_by?: string | null;
}

export interface LocalEventStats {
  total: number;
  thisWeek: number;
  bySport: Record<string, number>;
}

/**
 * Fetch active local fitness events, optionally filtered by sport type.
 * Results are ordered by start_time ASC.
 */
export async function fetchLocalEvents(
  supabase: SupabaseClient,
  options?: { sport?: string; limit?: number }
): Promise<DalResult<LocalFitnessEvent[]>> {
  try {
    let query = supabase
      .from('local_fitness_events')
      .select('*')
      .eq('is_active', true)
      .order('start_time', { ascending: true });

    if (options?.sport && options.sport !== 'all') {
      query = query.eq('sport_type', options.sport);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (error) {
    logError(error, { action: 'fetchLocalEvents' });
    return { success: false, error: 'Failed to fetch local events' };
  }
}

/**
 * Fetch a single local fitness event by ID.
 */
export async function fetchLocalEventById(
  supabase: SupabaseClient,
  id: string
): Promise<DalResult<LocalFitnessEvent | null>> {
  try {
    const { data, error } = await supabase.from('local_fitness_events').select('*').eq('id', id).maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchLocalEventById', id });
    return { success: false, error: 'Failed to fetch local event' };
  }
}

/**
 * Create a new local fitness event. Requires admin privileges via RLS.
 */
export async function createLocalEvent(
  supabase: SupabaseClient,
  event: LocalEventInsert
): Promise<DalResult<LocalFitnessEvent>> {
  try {
    const { data, error } = await supabase.from('local_fitness_events').insert(event).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'createLocalEvent' });
    return { success: false, error: 'Failed to create local event' };
  }
}

/**
 * Update an existing local fitness event. Requires admin privileges via RLS.
 */
export async function updateLocalEvent(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<LocalEventInsert>
): Promise<DalResult<LocalFitnessEvent>> {
  try {
    const { data, error } = await supabase
      .from('local_fitness_events')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'updateLocalEvent', id });
    return { success: false, error: 'Failed to update local event' };
  }
}

/**
 * Soft-delete a local fitness event by setting is_active = false.
 * Requires admin privileges via RLS.
 */
export async function deleteLocalEvent(supabase: SupabaseClient, id: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('local_fitness_events')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'deleteLocalEvent', id });
    return { success: false, error: 'Failed to delete local event' };
  }
}

/**
 * Fetch aggregate stats about local fitness events.
 */
export async function fetchEventStats(supabase: SupabaseClient): Promise<DalResult<LocalEventStats>> {
  try {
    const { data, error } = await supabase
      .from('local_fitness_events')
      .select('id, sport_type, recurrence_day')
      .eq('is_active', true);

    if (error) return { success: false, error: error.message };

    const events = data ?? [];
    const today = new Date();
    const currentDayNum = today.getDay();
    const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const remainingDays = new Set<string>();
    for (let i = currentDayNum; i <= 6; i++) {
      remainingDays.add(weekDays[i]);
    }

    const thisWeek = events.filter((e) => e.recurrence_day && remainingDays.has(e.recurrence_day)).length;

    const bySport: Record<string, number> = {};
    for (const event of events) {
      bySport[event.sport_type] = (bySport[event.sport_type] ?? 0) + 1;
    }

    return {
      success: true,
      data: {
        total: events.length,
        thisWeek,
        bySport,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchEventStats' });
    return { success: false, error: 'Failed to fetch event stats' };
  }
}

/** DAL: community_events + community_event_rsvps (BUG-218) */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CommunityEvent {
  id: string;
  community_id: string;
  created_by: string;
  title: string;
  description: string | null;
  location: string | null;
  event_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  creator?: { id: string; name: string; avatar_url: string | null } | null;
}

export interface CommunityEventWithRsvp extends CommunityEvent {
  rsvp_count: number;
  user_rsvpd: boolean;
}

export interface CreateCommunityEventInput {
  community_id: string;
  created_by: string;
  title: string;
  description?: string | null;
  location?: string | null;
  event_at: string;
  ends_at?: string | null;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCommunityEvent(
  supabase: SupabaseClient,
  input: CreateCommunityEventInput
): Promise<DalResult<string>> {
  try {
    const { data, error } = await supabase
      .from('community_events')
      .insert({
        community_id: input.community_id,
        created_by: input.created_by,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        event_at: input.event_at,
        ends_at: input.ends_at ?? null,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    // 0-row guard: RLS-blocked inserts return no error but also no data.
    if (!data) return { success: false, error: 'Event not created — RLS may have blocked the insert' };
    return { success: true, data: data.id };
  } catch (err) {
    logError(err, { action: 'createCommunityEvent' });
    return { success: false, error: 'Failed to create event' };
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * Fetch upcoming events for a community, annotated with RSVP count and
 * whether the current user has RSVPd.
 *
 * RLS ensures only members (or public communities) can read events.
 * Counts are derived client-side from the rsvps sub-select to avoid
 * a separate RPC call.
 */
export async function listCommunityEvents(
  supabase: SupabaseClient,
  communityId: string,
  userId?: string | null
): Promise<DalResult<CommunityEventWithRsvp[]>> {
  try {
    // Only return events that haven't started yet or are still in progress.
    // Uses event_at >= now (v1 filter); events with ends_at in the future but
    // event_at in the past remain excluded — acceptable for v1.
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('community_events')
      .select('*, creator:created_by(id, name, avatar_url), community_event_rsvps(user_id)')
      .eq('community_id', communityId)
      .gte('event_at', now)
      .order('event_at', { ascending: true });

    if (error) return { success: false, error: error.message };

    const events: CommunityEventWithRsvp[] = (data || []).map((row) => {
      // community_event_rsvps is a join array
      const rsvps = (row.community_event_rsvps ?? []) as { user_id: string }[];
      return {
        id: row.id,
        community_id: row.community_id,
        created_by: row.created_by,
        title: row.title,
        description: row.description,
        location: row.location,
        event_at: row.event_at,
        ends_at: row.ends_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        creator: row.creator ?? null,
        rsvp_count: rsvps.length,
        user_rsvpd: userId ? rsvps.some((r) => r.user_id === userId) : false,
      };
    });

    return { success: true, data: events };
  } catch (err) {
    logError(err, { action: 'listCommunityEvents' });
    return { success: false, error: 'Failed to load events' };
  }
}

// ─── RSVP ─────────────────────────────────────────────────────────────────────

export async function rsvpToEvent(supabase: SupabaseClient, eventId: string, userId: string): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase
      .from('community_event_rsvps')
      .insert({ event_id: eventId, user_id: userId })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation: already RSVPd — treat as success
      if (error.code === '23505') return { success: true };
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'RSVP not saved — RLS may have blocked the insert' };
    return { success: true };
  } catch (err) {
    logError(err, { action: 'rsvpToEvent' });
    return { success: false, error: 'Failed to RSVP' };
  }
}

export async function cancelRsvp(supabase: SupabaseClient, eventId: string, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('community_event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    logError(err, { action: 'cancelRsvp' });
    return { success: false, error: 'Failed to cancel RSVP' };
  }
}

/**
 * DAL: the gym's inbox of pending venue requests (T-GYM1).
 *
 * Separate from gymVenue.ts so both stay well under the 300-line limit, and
 * because this is the one read on the gym's side of the relationship: every
 * other partner read serves an athlete looking at a card or a storefront.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { VenueRequest } from './gymVenue';

interface RequestRow {
  id: string;
  title: string | null;
  sport: string;
  date: string;
  start_time: string | null;
  duration: number;
  is_paid: boolean | null;
  price_cents: number | null;
  currency: string | null;
  creator_id: string;
  creator: {
    id: string;
    name: string;
    avatar_url: string | null;
    average_rating: number | null;
    total_sessions_hosted: number | null;
  } | null;
}

/** A venue this instructor may pick in the create/edit form. */
export interface SelectableVenue {
  id: string;
  business_name: string;
  business_type: string;
  logo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** Their own gym: publishes instantly when the gym auto-approves. */
  onMyRoster: boolean;
}

/**
 * Pending requests for one gym, soonest session first.
 *
 * Two queries, not one per row: the sessions with their creators, then the
 * gym's active roster in a single fetch, so "No está en tu roster" is decided
 * in memory. Embedding the roster per session would be a join per row for a
 * badge.
 */
export async function fetchVenueRequests(
  supabase: SupabaseClient,
  partnerId: string
): Promise<DalResult<VenueRequest[]>> {
  try {
    const [sessionsResult, rosterResult] = await Promise.all([
      supabase
        .from('sessions')
        .select(
          'id, title, sport, date, start_time, duration, is_paid, price_cents, currency, creator_id, ' +
            'creator:users!sessions_creator_id_fkey(id, name, avatar_url, average_rating, total_sessions_hosted)'
        )
        .eq('partner_id', partnerId)
        .eq('partner_status', 'pending')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase.from('partner_instructors').select('instructor_id').eq('partner_id', partnerId).eq('is_active', true),
    ]);

    if (sessionsResult.error) return { success: false, error: sessionsResult.error.message };
    if (rosterResult.error) return { success: false, error: rosterResult.error.message };

    const roster = new Set((rosterResult.data ?? []).map((r) => r.instructor_id as string));

    const requests: VenueRequest[] = ((sessionsResult.data ?? []) as unknown as RequestRow[]).map((row) => ({
      sessionId: row.id,
      title: row.title,
      sport: row.sport,
      date: row.date,
      startTime: row.start_time,
      duration: row.duration,
      isPaid: row.is_paid,
      priceCents: row.price_cents,
      currency: row.currency,
      instructor: row.creator
        ? {
            id: row.creator.id,
            name: row.creator.name,
            avatarUrl: row.creator.avatar_url,
            averageRating: row.creator.average_rating,
            totalSessionsHosted: row.creator.total_sessions_hosted,
          }
        : null,
      notOnRoster: !roster.has(row.creator_id),
    }));

    return { success: true, data: requests };
  } catch (error) {
    logError(error, { action: 'fetchVenueRequests', partnerId });
    return { success: false, error: 'Failed to fetch venue requests' };
  }
}

const SELECTABLE_COLUMNS = 'id, business_name, business_type, logo_url, address, lat, lng';

/**
 * Partners this instructor may pick as a venue.
 *
 * Their own rosters sort first -- those publish instantly when the gym
 * auto-approves -- then any other active partner matched by name, because an
 * unaffiliated instructor may request a gym they do not belong to and simply
 * lands in pending.
 */
export async function fetchSelectableVenues(
  supabase: SupabaseClient,
  instructorId: string,
  search = ''
): Promise<DalResult<SelectableVenue[]>> {
  try {
    const term = search.trim();
    let query = supabase.from('featured_partners').select(SELECTABLE_COLUMNS).eq('status', 'active').limit(20);
    if (term) query = query.ilike('business_name', `%${term}%`);

    const [rosterResult, activeResult] = await Promise.all([
      supabase.from('partner_instructors').select('partner_id').eq('instructor_id', instructorId).eq('is_active', true),
      query,
    ]);

    if (rosterResult.error) return { success: false, error: rosterResult.error.message };
    if (activeResult.error) return { success: false, error: activeResult.error.message };

    const mine = new Set((rosterResult.data ?? []).map((r) => r.partner_id as string));
    const withFlag: SelectableVenue[] = (
      (activeResult.data ?? []) as unknown as Omit<SelectableVenue, 'onMyRoster'>[]
    ).map((r) => ({ ...r, onMyRoster: mine.has(r.id) }));

    withFlag.sort(
      (a, b) => Number(b.onMyRoster) - Number(a.onMyRoster) || a.business_name.localeCompare(b.business_name)
    );
    return { success: true, data: withFlag };
  } catch (error) {
    logError(error, { action: 'fetchSelectableVenues', instructorId });
    return { success: false, error: 'Failed to fetch venues' };
  }
}

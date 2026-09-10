/**
 * DAL: gym and studio venue identity, and the gym's approval of it (T-GYM1).
 *
 * Lives apart from featuredPartners.ts, which is already at the 300-line limit.
 *
 * THE GYM OWNS ITS NAME. A session shows a gym's chip, logo and bold venue name
 * only when that gym has approved the session at its venue. The verdict is not
 * writable by any client: migration 158 revoked INSERT and UPDATE on
 * sessions.partner_status / partner_reviewed_at from `authenticated` and moved
 * both transitions into SECURITY DEFINER functions. So the two mutating
 * functions here are RPC calls, not table writes, and passing a status from the
 * client is not merely discouraged -- it is impossible.
 *
 * Reads are batched by design: the card needs "which gym is this instructor a
 * coach at" for every creator on the visible page, and doing that per card is a
 * request per card.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** The minimum a surface needs to render a gym as an organization. */
export interface GymIdentity {
  id: string;
  business_name: string;
  business_type: string;
  logo_url: string | null;
  status: string;
}

const GYM_IDENTITY_COLUMNS = 'id, business_name, business_type, logo_url, status';

/** A pending venue request, as the gym's dashboard shows it. */
export interface VenueRequest {
  sessionId: string;
  title: string | null;
  sport: string;
  date: string;
  startTime: string | null;
  duration: number;
  isPaid: boolean | null;
  priceCents: number | null;
  currency: string | null;
  instructor: {
    id: string;
    name: string;
    avatarUrl: string | null;
    averageRating: number | null;
    totalSessionsHosted: number | null;
  } | null;
  /** True when the requester is not an active member of this gym's roster. */
  notOnRoster: boolean;
}

/** Only an active partner may lend its identity to a session. */
function isRenderable(partner: GymIdentity | null | undefined): boolean {
  return !!partner && partner.status === 'active';
}

/**
 * Gyms by id, for the sessions on one page.
 *
 * Not a PostgREST embed on sessions.partner_id: the anon read path is the
 * sessions_public VIEW (migration 140 revoked anon from the base table), and a
 * view carries no foreign key for PostgREST to embed through. anon does hold
 * table-level SELECT on featured_partners, so a second batched query works for
 * signed-out and signed-in visitors alike -- which matters, because signed-out
 * visitors are who this ticket exists for.
 */
export async function fetchPartnersByIds(
  supabase: SupabaseClient,
  partnerIds: string[]
): Promise<DalResult<Map<string, GymIdentity>>> {
  const unique = [...new Set(partnerIds.filter(Boolean))];
  if (unique.length === 0) return { success: true, data: new Map() };

  try {
    const { data, error } = await supabase.from('featured_partners').select(GYM_IDENTITY_COLUMNS).in('id', unique);

    if (error) return { success: false, error: error.message };

    const byId = new Map<string, GymIdentity>();
    for (const row of (data ?? []) as GymIdentity[]) {
      if (isRenderable(row)) byId.set(row.id, row);
    }
    return { success: true, data: byId };
  } catch (error) {
    logError(error, { action: 'fetchPartnersByIds' });
    return { success: false, error: 'Failed to fetch partners' };
  }
}

/**
 * "Which gym is this instructor a coach at", for every creator on one page.
 *
 * One query for the whole page, never one per card. An instructor on two
 * rosters resolves to the first active partner returned; the affiliation tag
 * shows one gym, and picking a stable-but-arbitrary one is better than
 * rendering two tags in a card row that has no space for them.
 */
export async function fetchPartnersForInstructors(
  supabase: SupabaseClient,
  instructorIds: string[]
): Promise<DalResult<Map<string, GymIdentity>>> {
  const unique = [...new Set(instructorIds.filter(Boolean))];
  if (unique.length === 0) return { success: true, data: new Map() };

  try {
    const { data, error } = await supabase
      .from('partner_instructors')
      .select(`instructor_id, partner:featured_partners!inner(${GYM_IDENTITY_COLUMNS})`)
      .in('instructor_id', unique)
      .eq('is_active', true);

    if (error) return { success: false, error: error.message };

    const byInstructor = new Map<string, GymIdentity>();
    for (const row of (data ?? []) as unknown as {
      instructor_id: string;
      partner: GymIdentity | null;
    }[]) {
      if (!byInstructor.has(row.instructor_id) && isRenderable(row.partner)) {
        byInstructor.set(row.instructor_id, row.partner as GymIdentity);
      }
    }
    return { success: true, data: byInstructor };
  } catch (error) {
    logError(error, { action: 'fetchPartnersForInstructors' });
    return { success: false, error: 'Failed to fetch instructor affiliations' };
  }
}

/** Active roster size, for the "· {n} coaches" line. */
export async function fetchRosterCount(supabase: SupabaseClient, partnerId: string): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('partner_instructors')
      .select('instructor_id', { count: 'exact', head: true })
      .eq('partner_id', partnerId)
      .eq('is_active', true);

    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchRosterCount', partnerId });
    return { success: false, error: 'Failed to count roster' };
  }
}

/**
 * Set (or clear) a session's venue.
 *
 * Returns the resulting status so the create/edit form can tell the instructor
 * immediately whether they are published or waiting. The status is decided
 * inside the database, never sent from here -- that is the whole point of the
 * RPC. Passing null clears all three columns.
 */
export async function setSessionPartner(
  supabase: SupabaseClient,
  sessionId: string,
  partnerId: string | null
): Promise<DalResult<'approved' | 'pending' | null>> {
  try {
    const { data, error } = await supabase.rpc('set_session_partner', {
      p_session_id: sessionId,
      p_partner_id: partnerId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as 'approved' | 'pending' | null) ?? null };
  } catch (error) {
    logError(error, { action: 'setSessionPartner', sessionId, partnerId });
    return { success: false, error: 'Failed to set the session venue' };
  }
}

/**
 * Approve or decline a venue request. Gym owner or admin only.
 *
 * The rejection for anyone else comes from the database, not from a check here,
 * so a creator calling this directly is refused even though they own the row.
 */
export async function reviewVenueRequest(
  supabase: SupabaseClient,
  sessionId: string,
  decision: 'approved' | 'declined'
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.rpc('review_venue_request', {
      p_session_id: sessionId,
      p_decision: decision,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'reviewVenueRequest', sessionId, decision });
    return { success: false, error: 'Failed to review the venue request' };
  }
}

/** Toggle "auto-approve my coaches" on the gym's own row. */
export async function setAutoApproveRoster(
  supabase: SupabaseClient,
  partnerId: string,
  enabled: boolean
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('featured_partners')
      .update({ auto_approve_roster: enabled })
      .eq('id', partnerId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'setAutoApproveRoster', partnerId, enabled });
    return { success: false, error: 'Failed to save the auto-approve setting' };
  }
}

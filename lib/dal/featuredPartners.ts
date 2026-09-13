/** Data Access Layer: Featured Partners */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface FeaturedPartner {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  /**
   * Permanent public URL segment for /g/[slug] (163). NOT NULL in the database
   * and filled by a BEFORE INSERT trigger, so every fetcher below can rely on
   * it. Never write it from the client: see the column COMMENT in 163.
   */
  slug: string;
  description: string | null;
  description_es: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  specialties: string[];
  tier: string;
  /** Roster coaches publish without waiting when true (158). */
  auto_approve_roster: boolean;
  /** Editorial placement, highest first (161). 0 = unplaced. */
  display_order: number;
  /**
   * The partner account's own avatar, embedded so the banner can fall back to
   * it when logo_url is null -- the same chain the storefront header and the
   * discover tile use. Without it BullBox showed a "CB" monogram in the feed
   * while showing its real logo on both other surfaces.
   *
   * public.users is under a column-level SELECT regime and this banner renders
   * on the public home feed, so an ungranted column would fail the WHOLE embed
   * rather than degrade. avatar_url is verified readable by anon.
   */
  user?: { avatar_url: string | null } | { avatar_url: string | null }[] | null;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  monthly_fee_cents: number;
  currency: string;
  total_impressions: number;
  total_clicks: number;
  total_bookings: number;
  min_sessions_per_month: number;
  min_rating: number;
  created_at: string;
  updated_at: string;
}

export interface PartnerInstructor {
  id: string;
  partner_id: string;
  instructor_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  user?: {
    id: string;
    name: string;
    avatar_url: string | null;
    specialties: string[] | null;
  };
}

export interface PartnerApplication {
  business_name: string;
  business_type?: string;
  description?: string;
  description_es?: string;
  specialties?: string[];
  address?: string;
  lat?: number;
  lng?: number;
  website_url?: string;
  phone?: string;
  logo_url?: string;
}

export interface PartnerStats {
  total_impressions: number;
  total_clicks: number;
  total_bookings: number;
  revenue_cents: number;
}

// --- Read operations ---

/** Fetch active featured partners for the home feed banner */
export async function fetchActivePartners(supabase: SupabaseClient, limit = 5): Promise<DalResult<FeaturedPartner[]>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .select(
        'id, user_id, slug, business_name, business_type, description, description_es, logo_url, banner_url, website_url, phone, address, lat, lng, specialties, tier, status, starts_at, expires_at, monthly_fee_cents, currency, total_impressions, total_clicks, total_bookings, min_sessions_per_month, min_rating, created_at, updated_at, display_order, auto_approve_roster, user:users(avatar_url)'
      )
      .eq('status', 'active')
      // display_order is editorial placement and sorts ahead of everything
      // (161). tier stays below it so a commercial field never doubles as
      // merchandising, and total_impressions keeps rotating everything that
      // ties -- which, at display_order 0, is every partner not deliberately
      // placed.
      .order('display_order', { ascending: false })
      .order('tier', { ascending: false })
      .order('total_impressions', { ascending: true })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (error) {
    logError(error, { action: 'fetchActivePartners' });
    return { success: false, error: 'Failed to fetch active partners' };
  }
}

/** Get a partner record by their user ID */
export async function fetchPartnerByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<FeaturedPartner | null>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .select(
        'id, user_id, slug, business_name, business_type, description, description_es, logo_url, banner_url, website_url, phone, address, lat, lng, specialties, tier, status, starts_at, expires_at, monthly_fee_cents, currency, total_impressions, total_clicks, total_bookings, min_sessions_per_month, min_rating, created_at, updated_at, display_order, auto_approve_roster, user:users(avatar_url)'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchPartnerByUserId', userId });
    return { success: false, error: 'Failed to fetch partner' };
  }
}

/** Get a partner by their partner ID */
export async function fetchPartnerById(
  supabase: SupabaseClient,
  partnerId: string
): Promise<DalResult<FeaturedPartner | null>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .select(
        'id, user_id, slug, business_name, business_type, description, description_es, logo_url, banner_url, website_url, phone, address, lat, lng, specialties, tier, status, starts_at, expires_at, monthly_fee_cents, currency, total_impressions, total_clicks, total_bookings, min_sessions_per_month, min_rating, created_at, updated_at, display_order, auto_approve_roster, user:users(avatar_url)'
      )
      .eq('id', partnerId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchPartnerById', sessionId: partnerId });
    return { success: false, error: 'Failed to fetch partner' };
  }
}

/** Get instructors belonging to a partner */
export async function fetchPartnerInstructors(
  supabase: SupabaseClient,
  partnerId: string
): Promise<DalResult<PartnerInstructor[]>> {
  try {
    // `users!inner` so partner_instructor rows whose user is flagged as a
    // test account (or has been deleted) get dropped from the result rather
    // than appearing with a null `user`. Filter is `users.is_test_account=eq.false`.
    // Migration 052.
    const { data, error } = await supabase
      .from('partner_instructors')
      .select('*, user:users!inner(id, name, avatar_url, specialties, is_test_account)')
      .eq('partner_id', partnerId)
      .eq('is_active', true)
      .eq('user.is_test_account', false);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (error) {
    logError(error, { action: 'fetchPartnerInstructors' });
    return { success: false, error: 'Failed to fetch partner instructors' };
  }
}

/** Get upcoming sessions by any instructor in the partner's roster */
export async function fetchPartnerSessions(supabase: SupabaseClient, partnerId: string): Promise<DalResult<unknown[]>> {
  try {
    // First get all instructor IDs for this partner
    const { data: instructors, error: iErr } = await supabase
      .from('partner_instructors')
      .select('instructor_id')
      .eq('partner_id', partnerId)
      .eq('is_active', true);

    if (iErr) return { success: false, error: iErr.message };

    // Also include the partner's own user_id
    const { data: partner } = await supabase.from('featured_partners').select('user_id').eq('id', partnerId).single();

    const candidateIds = [...(instructors?.map((i) => i.instructor_id) ?? []), ...(partner ? [partner.user_id] : [])];
    if (candidateIds.length === 0) return { success: true, data: [] };

    // Drop any candidate user that's flagged as a test account (migration
    // 052). The partner's own user_id wasn't covered by the inner-join
    // filter on `fetchPartnerInstructors`, so it's checked here too.
    const { data: liveUsers, error: liveErr } = await supabase
      .from('users')
      .select('id')
      .in('id', candidateIds)
      .eq('is_test_account', false);

    if (liveErr) return { success: false, error: liveErr.message };
    const instructorIds = (liveUsers ?? []).map((u) => u.id);

    if (instructorIds.length === 0) return { success: true, data: [] };

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('sessions')
      .select(
        'id, creator_id, sport, location, date, start_time, duration, max_participants, current_participants, status, title, description, latitude, longitude, photos, skill_level, is_paid, price_cents, currency'
      )
      .in('creator_id', instructorIds)
      .eq('status', 'open')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(20);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (error) {
    logError(error, { action: 'fetchPartnerSessions' });
    return { success: false, error: 'Failed to fetch partner sessions' };
  }
}

/** Get partner stats: impressions, clicks, bookings, revenue */
export async function fetchPartnerStats(supabase: SupabaseClient, partnerId: string): Promise<DalResult<PartnerStats>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .select('total_impressions, total_clicks, total_bookings')
      .eq('id', partnerId)
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: {
        total_impressions: data.total_impressions ?? 0,
        total_clicks: data.total_clicks ?? 0,
        total_bookings: data.total_bookings ?? 0,
        revenue_cents: 0, // Placeholder — will query payments table later
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchPartnerStats' });
    return { success: false, error: 'Failed to fetch partner stats' };
  }
}

// --- Admin operations ---

/** Fetch ALL partners regardless of status (admin only — requires admin RLS policy) */
export async function fetchAllPartners(supabase: SupabaseClient): Promise<DalResult<FeaturedPartner[]>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .select(
        'id, user_id, slug, business_name, business_type, description, description_es, logo_url, banner_url, website_url, phone, address, lat, lng, specialties, tier, status, starts_at, expires_at, monthly_fee_cents, currency, total_impressions, total_clicks, total_bookings, min_sessions_per_month, min_rating, created_at, updated_at, display_order, auto_approve_roster, user:users(avatar_url)'
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (error) {
    logError(error, { action: 'fetchAllPartners' });
    return { success: false, error: 'Failed to fetch all partners' };
  }
}

/** Update a partner's status (and optionally expires_at) */
export async function updatePartnerStatus(
  supabase: SupabaseClient,
  partnerId: string,
  status: string,
  expiresAt?: string | null
): Promise<DalResult<null>> {
  try {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'active') {
      update.starts_at = new Date().toISOString();
      if (expiresAt) {
        update.expires_at = expiresAt;
      } else {
        // Default: 6 months from now
        const exp = new Date();
        exp.setMonth(exp.getMonth() + 6);
        update.expires_at = exp.toISOString();
      }
    }
    const { error } = await supabase.from('featured_partners').update(update).eq('id', partnerId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updatePartnerStatus', sessionId: partnerId });
    return { success: false, error: 'Failed to update partner status' };
  }
}

/** Update a partner's tier */
export async function updatePartnerTier(
  supabase: SupabaseClient,
  partnerId: string,
  tier: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('featured_partners')
      .update({ tier, updated_at: new Date().toISOString() })
      .eq('id', partnerId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updatePartnerTier', sessionId: partnerId });
    return { success: false, error: 'Failed to update partner tier' };
  }
}

// --- Write operations ---

type PartnerMetric = 'total_impressions' | 'total_clicks' | 'total_bookings';

/** Increment a partner metric (impressions, clicks, bookings) */
export async function incrementPartnerMetric(
  supabase: SupabaseClient,
  partnerId: string,
  metric: PartnerMetric
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.rpc('increment_counter', {
      table_name: 'featured_partners',
      row_id: partnerId,
      column_name: metric,
    });

    // Fallback: log and move on if RPC doesn't exist yet
    if (error) {
      logError(error, { action: 'incrementPartnerMetric', sessionId: partnerId });
    }

    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'incrementPartnerMetric' });
    return { success: false, error: 'Failed to increment metric' };
  }
}

/** Self-activate a pending partner record (beta free trial, 6 months).
 *  Calls the `self_activate_featured_partner` SECURITY DEFINER RPC which
 *  enforces ownership and status checks server-side.
 *
 *  Returns:
 *    { success: true,  data: { alreadyActive: false } } — first activation
 *    { success: true,  data: { alreadyActive: true  } } — idempotent no-op
 *    { success: false, error: string               } — not found / not owner
 */
export async function selfActivatePartner(supabase: SupabaseClient): Promise<DalResult<{ alreadyActive: boolean }>> {
  try {
    const { data, error } = await supabase.rpc('self_activate_featured_partner');

    if (error) {
      logError(error, { action: 'selfActivatePartner' });
      return { success: false, error: error.message };
    }

    // RPC returns a JSONB discriminated union
    const result = data as { ok: boolean; already_active?: boolean; error?: string } | null;

    if (!result || !result.ok) {
      const reason = result?.error ?? 'unknown_error';
      return { success: false, error: reason };
    }

    return { success: true, data: { alreadyActive: result.already_active === true } };
  } catch (err) {
    logError(err, { action: 'selfActivatePartner' });
    return { success: false, error: 'Failed to activate partner' };
  }
}

/** Submit a partnership application (inserts a pending record) */
export async function applyForPartnership(
  supabase: SupabaseClient,
  userId: string,
  application: PartnerApplication
): Promise<DalResult<FeaturedPartner>> {
  try {
    const { data, error } = await supabase
      .from('featured_partners')
      .insert({
        user_id: userId,
        business_name: application.business_name,
        business_type: application.business_type ?? 'studio',
        description: application.description ?? null,
        description_es: application.description_es ?? null,
        specialties: application.specialties ?? [],
        address: application.address ?? null,
        lat: application.lat ?? null,
        lng: application.lng ?? null,
        website_url: application.website_url ?? null,
        phone: application.phone ?? null,
        logo_url: application.logo_url ?? null,
        status: 'pending',
        tier: 'standard',
        monthly_fee_cents: 0,
        currency: 'COP',
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'applyForPartnership', userId });
    return { success: false, error: 'Failed to submit application' };
  }
}

/**
 * The image to show for a partner: its own logo, then the account's avatar,
 * then nothing (callers render a monogram).
 *
 * ONE chain for three surfaces -- the storefront header, the discover tile and
 * the feed banner. The banner showed "CB" for BullBox while the other two
 * showed its real logo, because it had no fallback of its own.
 *
 * PostgREST types a to-one embed as an array even though it returns an object,
 * so both shapes are handled here rather than cast at each call site.
 */
export function partnerLogoUrl(partner: {
  logo_url: string | null;
  user?: { avatar_url: string | null } | { avatar_url: string | null }[] | null;
}): string | null {
  if (partner.logo_url) return partner.logo_url;
  const account = Array.isArray(partner.user) ? partner.user[0] : partner.user;
  return account?.avatar_url ?? null;
}

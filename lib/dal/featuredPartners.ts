/** Data Access Layer: Featured Partners */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface FeaturedPartner {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
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
      .select('*')
      .eq('status', 'active')
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
    const { data, error } = await supabase.from('featured_partners').select('*').eq('user_id', userId).maybeSingle();

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
    const { data, error } = await supabase.from('featured_partners').select('*').eq('id', partnerId).maybeSingle();

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
    const { data, error } = await supabase
      .from('partner_instructors')
      .select('*, user:users(id, name, avatar_url, specialties)')
      .eq('partner_id', partnerId)
      .eq('is_active', true);

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

    const instructorIds = [...(instructors?.map((i) => i.instructor_id) ?? []), ...(partner ? [partner.user_id] : [])];

    if (instructorIds.length === 0) return { success: true, data: [] };

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
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

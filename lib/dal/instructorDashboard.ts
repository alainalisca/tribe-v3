/** DAL: Instructor Dashboard — sessions, stats, storefront, packages */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Session, UserUpdate } from '@/lib/database.types';

export interface InstructorSessionRow extends Session {
  participant_count: number;
}

export interface InstructorStats {
  totalSessions: number;
  totalAthletes: number;
  averageRating: number;
  totalRevenueCents: number;
  revenueCurrency: 'COP' | 'USD';
  sessionsThisMonth: number;
  sessionsLastMonth: number;
}

export interface ServicePackageRow {
  id: string;
  instructor_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  package_type: string;
  session_count: number | null;
  duration_days: number | null;
  is_active: boolean;
  tag: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServicePackageUpsert {
  id?: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  package_type: string;
  session_count: number | null;
  is_active: boolean;
}

// --- Read operations ---

/** Fetch upcoming + past sessions for an instructor, with participant counts */
export async function fetchInstructorSessions(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<{ upcoming: InstructorSessionRow[]; past: InstructorSessionRow[] }>> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*, session_participants(count)')
      .eq('creator_id', userId)
      .order('date', { ascending: true });

    if (error) return { success: false, error: error.message };

    const mapped = (sessions || []).map((s) => {
      const countArr = s.session_participants as unknown as { count: number }[];
      const participant_count = countArr?.[0]?.count ?? 0;
      const { session_participants: _drop, ...rest } = s;
      return { ...rest, participant_count } as InstructorSessionRow;
    });

    const upcoming = mapped.filter((s) => s.date >= today && s.status !== 'cancelled');
    const past = mapped
      .filter((s) => s.date < today || s.status === 'cancelled')
      .sort((a, b) => b.date.localeCompare(a.date));

    return { success: true, data: { upcoming, past } };
  } catch (error) {
    logError(error, { action: 'fetchInstructorSessions', userId });
    return { success: false, error: 'Failed to fetch instructor sessions' };
  }
}

/** Aggregate stats: total sessions, athletes, rating, revenue */
export async function fetchInstructorStats(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<InstructorStats>> {
  try {
    // Total sessions hosted
    const { count: totalSessions, error: sessErr } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId);

    if (sessErr) return { success: false, error: sessErr.message };

    // Distinct athletes trained (from session_participants on this instructor's sessions)
    const { data: sessionIds, error: sidErr } = await supabase.from('sessions').select('id').eq('creator_id', userId);

    if (sidErr) return { success: false, error: sidErr.message };

    let totalAthletes = 0;
    if (sessionIds && sessionIds.length > 0) {
      const ids = sessionIds.map((s) => s.id);
      const { data: participants, error: pErr } = await supabase
        .from('session_participants')
        .select('user_id')
        .in('session_id', ids)
        .eq('status', 'confirmed');

      if (pErr) return { success: false, error: pErr.message };
      const uniqueUsers = new Set((participants || []).map((p) => p.user_id).filter(Boolean));
      totalAthletes = uniqueUsers.size;
    }

    // Average rating from reviews
    const { data: reviews, error: revErr } = await supabase.from('reviews').select('rating').eq('host_id', userId);

    if (revErr) return { success: false, error: revErr.message };

    const averageRating =
      reviews && reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

    // Total revenue from approved payments
    const { data: payments, error: payErr } = await supabase
      .from('payments')
      .select('instructor_payout_cents, currency, session:sessions!inner(creator_id)')
      .eq('status', 'approved')
      .eq('session.creator_id', userId);

    if (payErr) return { success: false, error: payErr.message };

    const totalRevenueCents = (payments || []).reduce((sum, p) => sum + (p.instructor_payout_cents || 0), 0);
    const revenueCurrency = (payments?.[0] as { currency?: string })?.currency === 'USD' ? 'USD' : 'COP';

    // Monthly trend
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];

    const { count: sessionsThisMonth } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .gte('date', thisMonthStart);

    const { count: sessionsLastMonth } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .gte('date', lastMonthStart)
      .lt('date', thisMonthStart);

    return {
      success: true,
      data: {
        totalSessions: totalSessions || 0,
        totalAthletes,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRevenueCents,
        revenueCurrency: revenueCurrency as 'COP' | 'USD',
        sessionsThisMonth: sessionsThisMonth || 0,
        sessionsLastMonth: sessionsLastMonth || 0,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchInstructorStats', userId });
    return { success: false, error: 'Failed to fetch instructor stats' };
  }
}

// --- Storefront profile update ---

export interface StorefrontProfileUpdate {
  bio?: string | null;
  instructor_bio?: string | null;
  storefront_tagline?: string | null;
  specialties?: string[] | null;
  storefront_banner_url?: string | null;
}

/** Update storefront-related fields on users table */
export async function updateStorefrontProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: StorefrontProfileUpdate
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('users')
      .update(updates as UserUpdate)
      .eq('id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateStorefrontProfile', userId });
    return { success: false, error: 'Failed to update storefront profile' };
  }
}

// --- Service packages ---

/** Fetch active packages for an instructor (dashboard variant) */
export async function fetchDashboardPackages(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<ServicePackageRow[]>> {
  try {
    const { data, error } = await supabase
      .from('service_packages')
      .select('*')
      .eq('instructor_id', userId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchServicePackages', userId });
    return { success: false, error: 'Failed to fetch packages' };
  }
}

/** Create or update a service package */
export async function upsertServicePackage(
  supabase: SupabaseClient,
  userId: string,
  pkg: ServicePackageUpsert
): Promise<DalResult<ServicePackageRow>> {
  try {
    const payload = { ...pkg, instructor_id: userId };

    if (pkg.id) {
      // Update existing
      const { data, error } = await supabase
        .from('service_packages')
        .update(payload)
        .eq('id', pkg.id)
        .eq('instructor_id', userId)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data };
    }

    // Insert new
    const { data, error } = await supabase.from('service_packages').insert([payload]).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'upsertServicePackage', userId });
    return { success: false, error: 'Failed to save package' };
  }
}

/** Soft-delete a package by setting is_active = false (dashboard variant) */
export async function deactivateDashboardPackage(
  supabase: SupabaseClient,
  packageId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('service_packages').update({ is_active: false }).eq('id', packageId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deactivateServicePackage', packageId });
    return { success: false, error: 'Failed to deactivate package' };
  }
}

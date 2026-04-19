// Data Access Layer for instructor marketplace features
// Fetches featured/verified instructors for the home feed teaser and explore page

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** Full instructor profile for Browse Instructors page */
export interface InstructorProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  tagline: string | null;
  location: string | null;
  specialties: string[];
  verified: boolean;
  average_rating: number;
  total_reviews: number;
  total_sessions: number;
  is_instructor: boolean;
  created_at: string;
  location_lat: number | null;
  location_lng: number | null;
  years_experience: number;
}

/**
 * Fetch instructors for the Browse Instructors page with optional filters.
 */
export async function fetchInstructors(
  supabase: SupabaseClient,
  options?: {
    sport?: string;
    searchQuery?: string;
    sortBy?: 'rating' | 'sessions' | 'newest' | 'nearest';
    lat?: number;
    lng?: number;
    limit?: number;
  }
): Promise<DalResult<InstructorProfile[]>> {
  try {
    let query = supabase
      .from('users')
      .select(
        'id, name, avatar_url, storefront_tagline, location, specialties, is_verified_instructor, average_rating, total_reviews, total_sessions_hosted, is_instructor, created_at, location_lat, location_lng, years_experience'
      )
      .eq('is_instructor', true);

    // Filter by sport in specialties array
    if (options?.sport) {
      query = query.contains('specialties', [options.sport]);
    }

    // Search by name
    if (options?.searchQuery) {
      query = query.ilike('name', `%${options.searchQuery}%`);
    }

    // Sort
    const sortBy = options?.sortBy ?? 'sessions';
    switch (sortBy) {
      case 'rating':
        query = query.order('average_rating', { ascending: false, nullsFirst: false });
        break;
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'nearest':
      case 'sessions':
      default:
        query = query.order('total_sessions_hosted', { ascending: false, nullsFirst: false });
        break;
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const instructors: InstructorProfile[] = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      avatar_url: row.avatar_url,
      tagline: row.storefront_tagline ?? null,
      location: row.location ?? null,
      specialties: (row.specialties as string[]) || [],
      verified: row.is_verified_instructor ?? false,
      average_rating: row.average_rating ?? 0,
      total_reviews: row.total_reviews ?? 0,
      total_sessions: row.total_sessions_hosted ?? 0,
      is_instructor: true,
      created_at: row.created_at,
      location_lat: row.location_lat ?? null,
      location_lng: row.location_lng ?? null,
      years_experience: row.years_experience ?? 0,
    }));

    return { success: true, data: instructors };
  } catch (error) {
    logError(error, { action: 'fetchInstructors' });
    return { success: false, error: 'Failed to fetch instructors' };
  }
}

export interface FeaturedInstructor {
  id: string;
  name: string;
  avatar_url: string | null;
  specialties: string[] | null;
  average_rating: number | null;
  total_reviews: number | null;
  total_sessions_hosted: number | null;
  storefront_tagline: string | null;
  is_verified_instructor: boolean | null;
  location: string | null;
  years_experience: number | null;
}

/**
 * Fetch featured instructors for the home feed teaser.
 * Prioritizes: verified instructors, high ratings, most sessions hosted.
 * Returns up to `limit` instructors (default 6).
 */
export async function fetchFeaturedInstructors(
  supabase: SupabaseClient,
  limit: number = 6
): Promise<DalResult<FeaturedInstructor[]>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(
        'id, name, avatar_url, specialties, average_rating, total_reviews, total_sessions_hosted, storefront_tagline, is_verified_instructor, location, years_experience'
      )
      .eq('is_instructor', true)
      .order('is_verified_instructor', { ascending: false, nullsFirst: false })
      .order('average_rating', { ascending: false, nullsFirst: false })
      .order('total_sessions_hosted', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as FeaturedInstructor[] };
  } catch (error) {
    logError(error, { action: 'fetchFeaturedInstructors' });
    return { success: false, error: 'Failed to fetch featured instructors' };
  }
}

/**
 * Fetch count of upcoming paid sessions for an instructor.
 * Used to show "X upcoming sessions" on instructor cards.
 */
/**
 * Check if a user is eligible for instructor upsell.
 * Eligible: 3+ hosted sessions AND avg rating >= 4.0 AND not already instructor.
 */
export async function checkInstructorUpsellEligibility(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<{ eligible: boolean; sessionCount: number; avgRating: number }>> {
  try {
    // 1. Check if already an instructor
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_instructor')
      .eq('id', userId)
      .single();

    if (userError) return { success: false, error: userError.message };
    if (user?.is_instructor) {
      return { success: true, data: { eligible: false, sessionCount: 0, avgRating: 0 } };
    }

    // 2. Count sessions hosted by this user
    const { count: sessionCount, error: sessError } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId);

    if (sessError) return { success: false, error: sessError.message };

    // 3. Get average rating from reviews where host_id = userId
    const { data: reviews, error: revError } = await supabase.from('reviews').select('rating').eq('host_id', userId);

    if (revError) return { success: false, error: revError.message };

    const avgRating =
      reviews && reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

    const count = sessionCount || 0;
    const eligible = count >= 3 && avgRating >= 4.0;

    return { success: true, data: { eligible, sessionCount: count, avgRating } };
  } catch (error) {
    logError(error, { action: 'checkInstructorUpsellEligibility', userId });
    return { success: false, error: 'Failed to check instructor upsell eligibility' };
  }
}

/**
 * Fetch count of upcoming paid sessions for an instructor.
 * Used to show "X upcoming sessions" on instructor cards.
 */
export async function fetchInstructorUpcomingSessionCount(
  supabase: SupabaseClient,
  instructorId: string
): Promise<DalResult<number>> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { count, error } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', instructorId)
      .eq('is_paid', true)
      .eq('status', 'active')
      .gte('date', today);

    if (error) return { success: false, error: error.message };
    return { success: true, data: count || 0 };
  } catch (error) {
    logError(error, { action: 'fetchInstructorUpcomingSessionCount', instructorId });
    return { success: false, error: 'Failed to fetch session count' };
  }
}

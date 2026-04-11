// Data Access Layer for instructor marketplace features
// Fetches featured/verified instructors for the home feed teaser and explore page

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

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

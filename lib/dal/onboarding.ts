/**
 * DAL: first-run state on the users row (T-ONB1).
 *
 * Replaces six separate localStorage keys. localStorage was per-device, so the
 * same athlete was re-onboarded on their laptop, in the Capacitor shell, in the
 * WhatsApp in-app browser, and after any cache clear.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface OnboardingState {
  /** NULL when the athlete has never finished or dismissed the introduction. */
  onboardingCompletedAt: string | null;
  /** Stable ids of banners and guides dismissed for good. */
  dismissedBanners: string[];
}

/**
 * Read the caller's first-run state.
 *
 * A failure here must be treated as "unknown", never as "not yet onboarded":
 * callers render nothing when the answer is unknown, so a transient error
 * costs a missing tour rather than a repeated one.
 */
export async function fetchOnboardingState(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<OnboardingState>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('onboarding_completed_at, dismissed_banners')
      .eq('id', userId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'no_row' };

    return {
      success: true,
      data: {
        onboardingCompletedAt: data.onboarding_completed_at ?? null,
        dismissedBanners: data.dismissed_banners ?? [],
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchOnboardingState' });
    return { success: false, error: 'Failed to read onboarding state' };
  }
}

/**
 * Mark the introduction finished. Dismissing counts as completing, so every
 * exit path calls this (Al, 2026-09-09).
 *
 * Idempotent: writing a later timestamp over an earlier one changes nothing
 * that is read, since callers only test for NULL.
 */
export async function completeOnboarding(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'completeOnboarding' });
    return { success: false, error: 'Failed to save onboarding state' };
  }
}

/**
 * Dismiss one banner, for good.
 *
 * Goes through the dismiss_banner RPC rather than writing the array from here.
 * A client-side read-modify-write races: dismiss two banners in one session, or
 * the same account in two tabs, and the second write clobbers the first,
 * resurrecting a banner the athlete already dismissed. The RPC appends inside
 * the database in a single statement and no-ops when the id is already present.
 */
export async function dismissBanner(supabase: SupabaseClient, bannerId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.rpc('dismiss_banner', { banner_id: bannerId });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'dismissBanner', bannerId });
    return { success: false, error: 'Failed to dismiss banner' };
  }
}

/**
 * Reset the caller's first-run state so the introduction can be seen again.
 * Powers the "Replay tours" control in settings.
 */
export async function resetOnboardingState(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed_at: null, dismissed_banners: [] })
      .eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'resetOnboardingState' });
    return { success: false, error: 'Failed to reset onboarding state' };
  }
}

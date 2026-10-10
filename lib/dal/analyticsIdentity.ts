/**
 * T-ANALYTICS1 part B. The facts PostHog's identify() needs about the signed-in
 * user, and nothing else: role inputs, preferred language. Read-only.
 *
 * Three reads, because the facts live in three places:
 *   - users.is_instructor, users.preferred_language
 *   - is_app_admin() for admin (users.is_admin is not client-readable since 113)
 *   - a featured_partners row owned by the user, which is what makes an account
 *     a gym: there is no account_type column (see app/onboarding/role/page.tsx).
 *     RLS "Partners manage own record" lets an owner read its own row whatever
 *     its status, so a pending application still reads as a gym.
 *
 * Admin and gym fail SOFT to false: a missed admin flag makes one person look
 * like a regular user in analytics, which is better than not identifying them.
 * The users read failing is a hard failure, because without it there is no
 * role at all.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { fetchUserIsAdmin } from './users';
import type { DalResult } from './types';

export interface AnalyticsIdentityFacts {
  isAdmin: boolean;
  ownsPartner: boolean;
  isInstructor: boolean;
  preferredLanguage: string | null;
}

export async function fetchAnalyticsIdentityFacts(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<AnalyticsIdentityFacts>> {
  try {
    const [userRes, adminRes, partnerRes] = await Promise.all([
      supabase.from('users').select('is_instructor, preferred_language').eq('id', userId).maybeSingle(),
      fetchUserIsAdmin(supabase, userId),
      supabase.from('featured_partners').select('id').eq('user_id', userId).limit(1),
    ]);

    if (userRes.error) return { success: false, error: userRes.error.message };
    if (!userRes.data) return { success: false, error: 'user_not_found' };

    const row = userRes.data as { is_instructor: boolean | null; preferred_language: string | null };
    return {
      success: true,
      data: {
        isAdmin: adminRes.success ? adminRes.data === true : false,
        ownsPartner: !partnerRes.error && (partnerRes.data?.length ?? 0) > 0,
        isInstructor: row.is_instructor === true,
        preferredLanguage: row.preferred_language,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchAnalyticsIdentityFacts', userId });
    return { success: false, error: 'Failed to fetch analytics identity' };
  }
}

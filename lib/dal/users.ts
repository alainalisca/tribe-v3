/** DAL: users table — profile reads, updates, admin checks */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult, UserForNotification } from './types';
import type { User as UserRow, UserUpdate } from '@/lib/database.types';

export async function fetchUserProfile(supabase: SupabaseClient, userId: string): Promise<DalResult<UserRow>> {
  try {
    // Guard against `/profile/undefined` style routes where userId becomes
    // the literal string "undefined"/"null" or empty (BUG-004).
    if (!userId || userId === 'undefined' || userId === 'null') {
      return { success: false, error: 'user_not_found' };
    }
    // maybeSingle differentiates "no row" from RLS/network errors so
    // callers can show "user not found" only when the user truly doesn't
    // exist — not on transient failure (parallel to BUG-001 fix).
    // Column list is intentionally explicit (never `*`): `users` has per-column
    // SELECT grants (migrations 067 + 113), so `*` would hit permission-denied
    // on revoked columns. Excluded here:
    //   - push_subscription, fcm_token, fcm_platform, fcm_updated_at
    //     (service-role only since 067 — reading them from a session client
    //     errors; the push-send paths use fetchUserProfileMaybe instead)
    //   - is_admin, payout_method, stripe_account_id, wompi_merchant_id,
    //     total_earnings_cents (revoked in 113). Self reads its own admin status
    //     via is_app_admin() and its payout/earnings via fetchMyBillingProfile();
    //     no page reads these off a foreign profile.
    const { data, error } = await supabase
      .from('users')
      .select(
        'id, name, email, avatar_url, bio, location, location_lat, location_lng, sports, preferred_sports, specialties, certifications, years_experience, instructor_bio, is_instructor, is_verified_instructor, banned, photos, username, website_url, instagram_username, facebook_url, storefront_tagline, storefront_banner_url, storefront_video_url, storefront_tier, storefront_pro_since, storefront_pro_expires, banner_url, preferred_language, session_reminders_enabled, terms_accepted, terms_accepted_at, safety_waiver_accepted, safety_waiver_accepted_at, average_rating, total_reviews, rating, show_rate, sessions_completed, total_sessions_hosted, total_participants_served, earnings_currency, follower_count, following_count, verified_credentials, last_login_at, last_motivation_sent, last_motivation_message_id, last_reengagement_sent, last_weekly_recap_sent, welcome_email_sent_at, created_at, updated_at'
      )
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      logError(error, { action: 'fetchUserProfile', userId });
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'user_not_found' };
    // The select intentionally omits 9 columns (see note above); cast the
    // narrowed row back to UserRow — no caller reads the omitted fields off
    // this result (verified for T-SEC3).
    return { success: true, data: data as unknown as UserRow };
  } catch (error) {
    logError(error, { action: 'fetchUserProfile', userId });
    return { success: false, error: 'Failed to fetch user' };
  }
}

/**
 * Is the CURRENT user an admin? `is_admin` is no longer client-readable
 * (migration 113); admin status is resolved via the is_app_admin() SECURITY
 * DEFINER RPC, which only ever reports the authenticated caller. The `userId`
 * param is retained for call-site compatibility (every caller passes their own
 * id) and guarded: a mismatched id fails loudly rather than silently returning
 * the caller's own status, since the RPC cannot answer for another user.
 */
export async function fetchUserIsAdmin(supabase: SupabaseClient, userId: string): Promise<DalResult<boolean>> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || (userId && userId !== user.id)) {
      return { success: false, error: 'fetchUserIsAdmin only supports the current user' };
    }
    const { data, error } = await supabase.rpc('is_app_admin');
    if (error) return { success: false, error: error.message };
    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'fetchUserIsAdmin' });
    return { success: false, error: 'Failed to check admin status' };
  }
}

/**
 * Fetch all admin user IDs (for sending admin notifications, e.g. partner
 * applications). Uses the get_admin_user_ids() SECURITY DEFINER RPC because the
 * previous cross-user `select id where is_admin = true` is blocked by the 113
 * revoke. Returns only admin UUIDs — never the is_admin flag of a queried user.
 */
export async function fetchAdminUserIds(supabase: SupabaseClient): Promise<DalResult<string[]>> {
  try {
    const { data, error } = await supabase.rpc('get_admin_user_ids');
    if (error) return { success: false, error: error.message };
    // RETURNS SETOF uuid -> PostgREST yields an array of id strings.
    return { success: true, data: (data as string[] | null) ?? [] };
  } catch (error) {
    logError(error, { action: 'fetchAdminUserIds' });
    return { success: false, error: 'Failed to fetch admin user IDs' };
  }
}

export interface MyBillingProfile {
  payout_method: string | null;
  stripe_account_id: string | null;
  wompi_merchant_id: string | null;
  total_earnings_cents: number | null;
  earnings_currency: string | null;
}

const EMPTY_BILLING_PROFILE: MyBillingProfile = {
  payout_method: null,
  stripe_account_id: null,
  wompi_merchant_id: null,
  total_earnings_cents: null,
  earnings_currency: null,
};

/**
 * Fetch the CURRENT user's own payout/earnings fields, which live on `users`
 * but are no longer client-readable (migration 113). Backed by the
 * get_my_private_profile() SECURITY DEFINER RPC, scoped strictly to auth.uid().
 * Distinct from fetchMyPrivateProfile() (userPrivate.ts), which reads the
 * separate `user_private` PII table.
 */
export async function fetchMyBillingProfile(supabase: SupabaseClient): Promise<DalResult<MyBillingProfile>> {
  try {
    const { data, error } = await supabase.rpc('get_my_private_profile');
    if (error) return { success: false, error: error.message };
    // Returns a jsonb object, or null when unauthenticated.
    return { success: true, data: (data as MyBillingProfile | null) ?? { ...EMPTY_BILLING_PROFILE } };
  } catch (error) {
    logError(error, { action: 'fetchMyBillingProfile' });
    return { success: false, error: 'Failed to fetch billing profile' };
  }
}

export async function fetchUserName(supabase: SupabaseClient, userId: string): Promise<DalResult<string>> {
  try {
    const { data, error } = await supabase.from('users').select('name').eq('id', userId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data?.name || '' };
  } catch (error) {
    logError(error, { action: 'fetchUserName' });
    return { success: false, error: 'Failed to fetch user name' };
  }
}

export async function fetchUserField(
  supabase: SupabaseClient,
  userId: string,
  field: string
  // REASON: dynamic field access — callers know the expected return type
): Promise<DalResult<unknown>> {
  try {
    const { data, error } = await supabase.from('users').select(field).eq('id', userId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as Record<string, unknown>)?.[field] };
  } catch (error) {
    logError(error, { action: 'fetchUserField', field });
    return { success: false, error: `Failed to fetch ${field}` };
  }
}

export async function fetchUsersByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<DalResult<Array<{ id: string; name: string; avatar_url: string | null }>>> {
  try {
    const { data, error } = await supabase.from('users').select('id, name, avatar_url').in('id', ids);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUsersByIds' });
    return { success: false, error: 'Failed to fetch users' };
  }
}

export async function updateUser(supabase: SupabaseClient, userId: string, data: UserUpdate): Promise<DalResult<null>> {
  try {
    // .select() so we can tell an actual write apart from a 0-row no-op
    // (row missing or RLS-blocked). Without this, a blocked update returns
    // {error:null} and callers (e.g. the profile editor) report "saved"
    // when nothing changed — the silent profile-save failure.
    const { data: rows, error } = await supabase.from('users').update(data).eq('id', userId).select('id');
    if (error) return { success: false, error: error.message };
    if (!rows || rows.length === 0) return { success: false, error: 'no_rows_updated' };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateUser' });
    return { success: false, error: 'Failed to update user' };
  }
}

export async function updateUsersByIds(
  supabase: SupabaseClient,
  ids: string[],
  data: UserUpdate
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('users').update(data).in('id', ids);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateUsersByIds' });
    return { success: false, error: 'Failed to update users' };
  }
}

/** @deprecated Use softDeleteUser instead for GDPR-compliant account deletion */
export async function deleteUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  return softDeleteUser(supabase, userId);
}

/**
 * Soft-delete user: cancel future sessions, anonymize PII, deactivate connections.
 * Preserves the record for audit trail while removing personal data.
 */
export async function softDeleteUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    // 1. Cancel all future sessions this user created
    const { data: futureSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('creator_id', userId)
      .gte('date', new Date().toISOString())
      .in('status', ['active', 'upcoming']);

    for (const session of futureSessions || []) {
      await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', session.id);
    }

    // 2. Remove user from future session participations
    await supabase
      .from('session_participants')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'confirmed');

    // 3. Anonymize user profile (keep record, remove PII)
    await supabase
      .from('users')
      .update({
        name: 'Deleted User',
        email: `deleted-${userId}@deleted.tribe.app`,
        avatar_url: null,
        bio: null,
        phone: null,
        location_lat: null,
        location_lng: null,
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', userId);

    // 4. Deactivate connections
    await supabase
      .from('connections')
      .update({ status: 'cancelled' })
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    // NOTE: hard auth-user deletion (auth.admin.deleteUser) is intentionally
    // NOT done here. It needs the service-role key and MUST run server-side.
    // Previously this ran in the BROWSER (deleteUser was called from the
    // settings hook) where process.env.SUPABASE_SERVICE_ROLE_KEY is
    // undefined — so the call silently failed and every "deleted" account
    // became a zombie: PII wiped + deleted_at set, but the auth user still
    // alive and able to log back in. The /api/account/delete route now
    // performs the auth deletion server-side after these data steps.
    return { success: true };
  } catch (error) {
    logError(error, { action: 'softDeleteUser', userId });
    return { success: false, error: 'Failed to delete account' };
  }
}

export async function upsertUser(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'upsertUser' });
    return { success: false, error: 'Failed to upsert user' };
  }
}

/** The only user fields the batch email jobs consume. */
export type EmailJobUser = Pick<UserRow, 'id' | 'email' | 'name' | 'preferred_language' | 'created_at'>;

const EMAIL_JOB_USER_FIELDS = 'id, email, name, preferred_language, created_at';
const EMAIL_JOB_PAGE_SIZE = 500;

/**
 * Every user eligible to receive a batch email (weekly recap, inactive nudge).
 *
 * Callers MUST pass the service-role client. This is a backend batch job, and
 * `users` has per-column SELECT grants (migrations 067 + 113) that the anon and
 * authenticated roles cannot satisfy — the previous wide select broke silently
 * under those revokes.
 *
 * Selects only the fields the jobs actually use, so a future column revoke
 * can't break email again.
 *
 * Excludes soft-deleted, banned, and test accounts. Uses `not(col, 'is', true)`
 * rather than `eq(col, false)` so a NULL never silently drops a real recipient.
 *
 * Paginates rather than capping: a fixed `.limit()` would silently skip users
 * once the base outgrows it.
 */
export async function fetchUsersForEmailJobs(supabase: SupabaseClient): Promise<DalResult<EmailJobUser[]>> {
  try {
    const users: EmailJobUser[] = [];
    for (let from = 0; ; from += EMAIL_JOB_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('users')
        .select(EMAIL_JOB_USER_FIELDS)
        .is('deleted_at', null)
        .not('banned', 'is', true)
        .not('is_test_account', 'is', true)
        .order('created_at', { ascending: false })
        .range(from, from + EMAIL_JOB_PAGE_SIZE - 1);
      if (error) {
        logError(error, { action: 'fetchUsersForEmailJobs' });
        return { success: false, error: error.message };
      }
      const page = (data ?? []) as unknown as EmailJobUser[];
      users.push(...page);
      if (page.length < EMAIL_JOB_PAGE_SIZE) break;
    }
    return { success: true, data: users };
  } catch (error) {
    logError(error, { action: 'fetchUsersForEmailJobs' });
    return { success: false, error: 'Failed to fetch users' };
  }
}

/** Fetch user profile, returning null instead of error when not found. */
export async function fetchUserProfileMaybe(
  supabase: SupabaseClient,
  userId: string,
  fields?: string
): Promise<DalResult<Record<string, unknown> | null>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(fields || '*')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as Record<string, unknown> | null };
  } catch (error) {
    logError(error, { action: 'fetchUserProfileMaybe' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch users with push subscription and optional filters. */
export async function fetchUsersWithPush(
  supabase: SupabaseClient,
  fields: string,
  filters?: {
    lastMotivationBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    lastReengagementBefore?: string;
    lastWeeklyRecapBefore?: string;
  }
): Promise<DalResult<unknown[]>> {
  try {
    let query = supabase.from('users').select(fields).or('push_subscription.not.is.null,fcm_token.not.is.null');
    if (filters?.lastMotivationBefore)
      query = query.or(`last_motivation_sent.is.null,last_motivation_sent.lt.${filters.lastMotivationBefore}`);
    if (filters?.updatedAfter) query = query.gte('updated_at', filters.updatedAfter);
    if (filters?.updatedBefore) query = query.lte('updated_at', filters.updatedBefore);
    if (filters?.lastReengagementBefore)
      query = query.or(`last_reengagement_sent.is.null,last_reengagement_sent.lt.${filters.lastReengagementBefore}`);
    if (filters?.lastWeeklyRecapBefore)
      query = query.or(`last_weekly_recap_sent.is.null,last_weekly_recap_sent.lt.${filters.lastWeeklyRecapBefore}`);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUsersWithPush' });
    return { success: false, error: 'Failed' };
  }
}

/** Check if a user has blocked another user. */
export async function fetchBlockedStatus(
  supabase: SupabaseClient,
  userId: string,
  blockedUserId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('user_id', userId)
      .eq('blocked_user_id', blockedUserId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'fetchBlockedStatus' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch users who haven't been sent the welcome onboarding email yet (oldest first). */
export async function fetchUsersNeedingWelcomeEmail(
  supabase: SupabaseClient,
  limit = 50
): Promise<DalResult<Pick<UserRow, 'id' | 'email' | 'name' | 'preferred_language'>[]>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, preferred_language')
      .is('welcome_email_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      logError(error, { action: 'fetchUsersNeedingWelcomeEmail' });
      return { success: false, error: error.message };
    }
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUsersNeedingWelcomeEmail' });
    return { success: false, error: 'Failed to fetch users needing welcome email' };
  }
}

/** Mark the welcome onboarding email as sent for a user (stamps welcome_email_sent_at). */
export async function markWelcomeEmailSent(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) {
      logError(error, { action: 'markWelcomeEmailSent', userId });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'markWelcomeEmailSent', userId });
    return { success: false, error: 'Failed to mark welcome email sent' };
  }
}

/** Fetch user with specific fields for push notification. */
export async function fetchUserForNotification(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<UserForNotification | null>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, push_subscription, preferred_language, fcm_token, fcm_platform')
      .eq('id', userId)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as UserForNotification };
  } catch (error) {
    logError(error, { action: 'fetchUserForNotification' });
    return { success: false, error: 'Failed' };
  }
}

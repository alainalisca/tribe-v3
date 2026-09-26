import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';
import { upsertUser, fetchUserProfileMaybe } from '@/lib/dal';
import { upgradeProviderAvatarUrl } from '@/lib/providerAvatar';

interface UpsertResult {
  isNewUser: boolean;
}

/**
 * Upsert user profile after OAuth sign-in.
 * Shared by both the web OAuth callback and native OAuth flows.
 *
 * @param user - Supabase auth user object
 * @param displayName - Optional override for the user's name (e.g. from Apple's first-sign-in response)
 * @returns Whether this is a new user (no existing profile or account created within last 60s)
 */
export async function upsertUserProfile(user: User, displayName?: string): Promise<UpsertResult> {
  const supabase = createClient();
  let isNewUser = false;

  try {
    const profileResult = await fetchUserProfileMaybe(supabase, user.id, 'id, name, avatar_url, created_at');
    const existingProfile = profileResult.success ? profileResult.data : null;

    // Upgraded at capture, so a new Google sign-up never stores the 96px
    // version in the first place. The migration repairs the rows written
    // before this existed; this is what stops the problem recurring.
    const providerAvatar = upgradeProviderAvatarUrl(
      user.user_metadata?.avatar_url || user.user_metadata?.picture || null
    );
    const existingAvatar = existingProfile?.avatar_url || null;
    const rawExistingName = existingProfile?.name;
    const existingName = typeof rawExistingName === 'string' && rawExistingName.trim() ? rawExistingName.trim() : null;
    const computedName =
      displayName || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';

    // Build upsert payload — handle Apple's potential null email
    const upsertPayload: Record<string, string | null> = {
      id: user.id,
    };
    if (user.email) {
      upsertPayload.email = user.email;
    }

    // Only set name for a new user, when the profile has no name yet, or when the
    // provider explicitly supplies one (displayName is passed only on Apple's first
    // sign-in). Never overwrite a name the user edited in their profile with the
    // provider's value on a routine re-login. Omitting the column leaves it untouched
    // on the upsert's UPDATE path, exactly like the avatar_url guard above.
    if (displayName || !existingName) {
      upsertPayload.name = computedName;
    }

    // Only set avatar_url when the user doesn't already have one. Never overwrite an
    // existing avatar (an uploaded photo, or one captured at an earlier sign-in) with
    // the provider's value — that value is null for Apple and photo-less Google
    // accounts, so writing it on every login was silently wiping uploaded photos.
    // Omitting the column leaves it untouched on the upsert's UPDATE path.
    if (!existingAvatar && providerAvatar) {
      upsertPayload.avatar_url = providerAvatar;
    }

    const upsertResult = await upsertUser(supabase, upsertPayload);

    if (!upsertResult.success) {
      logError(new Error(upsertResult.error), { action: 'upsertUserProfile', userId: user.id });
    }

    // Detect new user: no existing profile or account created within last 60s
    isNewUser = !existingProfile || Date.now() - new Date(user.created_at).getTime() < 60_000;

    // Fire-and-forget admin notification for new OAuth signups
    if (isNewUser) {
      const provider = user.app_metadata?.provider;
      const signupMethod = provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google' : 'Email';
      fetch('/api/notify-admin-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: computedName,
          userEmail: user.email || 'unknown',
          signupMethod,
        }),
      }).catch((err) => logError(err, { action: 'notifyAdminSignup', userId: user.id }));
    }
  } catch (err) {
    logError(err, { action: 'upsertUserProfile', userId: user.id });
  }

  log('info', 'User profile upserted', {
    userId: user.id,
    action: 'upsertUserProfile',
  });

  return { isNewUser };
}

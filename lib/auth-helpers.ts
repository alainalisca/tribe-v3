import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';
import { updateUser, fetchUserProfileMaybe, insertUserProfileRow } from '@/lib/dal';
import type { NewUserProfileRow } from '@/lib/dal';
import { upgradeProviderAvatarUrl } from '@/lib/providerAvatar';
import { sendSignupAttribution } from '@/lib/signupAttributionClient';

interface UpsertResult {
  isNewUser: boolean;
}

/** What a sign-in may write onto an EXISTING row. Never email: see below. */
interface ProfileRefresh {
  name?: string;
  avatar_url?: string;
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Sync the profile row after a completed sign-in (OAuth callback and email OTP).
 *
 * T-AUTH3. This used to be ONE upsert carrying id, name, email and avatar_url.
 * `ON CONFLICT DO UPDATE SET email = EXCLUDED.email` reads `users.email`, which
 * migration 118 revoked from `authenticated`, so every sign-in since failed with
 * 42501 and wrote nothing. New Google sign-ups lost their photo that way.
 *
 * Now it is two plain statements, neither of which reads a revoked column:
 *  - no row yet: INSERT, the only place `email` is sent (the column is NOT NULL,
 *    and `handle_new_user` normally wrote it already);
 *  - row exists: UPDATE of `name` and/or `avatar_url`, and only the ones that
 *    are missing. A sign-in never rewrites an email.
 *
 * NAME (folded in from `fix/oauth-name-overwrite`, 91f1dd3, never merged). The
 * broken upsert was the only thing stopping every re-login from resetting a name
 * the user edited back to the Google name. Fixing the write without this guard
 * would have brought that bug back. A sign-in sets `name` only when the row has
 * none, or when the caller passes an explicit `displayName`.
 *
 * If the profile read FAILS we do not know what the row holds, so nothing is
 * written: a guess here can overwrite an edited name.
 *
 * @param displayName - Optional explicit name that should win (e.g. Apple's first-sign-in response)
 * @returns Whether this is a new user (no existing profile or account created within last 60s)
 */
export async function upsertUserProfile(user: User, displayName?: string): Promise<UpsertResult> {
  const supabase = createClient();
  let isNewUser = false;

  // Upgraded at capture, so a new Google sign-up never stores the 96px version.
  const providerAvatar = upgradeProviderAvatarUrl(
    user.user_metadata?.avatar_url || user.user_metadata?.picture || null
  );
  const computedName =
    displayName || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';

  try {
    const profileResult = await fetchUserProfileMaybe(supabase, user.id, 'id, name, avatar_url, created_at');
    const existingProfile = profileResult.success ? (profileResult.data ?? null) : null;

    if (!profileResult.success) {
      logError(new Error(profileResult.error), { action: 'upsertUserProfile.read', userId: user.id });
    } else if (existingProfile === null) {
      await insertMissingProfile(supabase, user, computedName, providerAvatar);
    } else {
      // Only fill what is missing. Never overwrite an existing avatar (an
      // uploaded photo) or an edited name with the provider's value.
      const refresh: ProfileRefresh = {};
      if (displayName || !nonBlank(existingProfile.name)) refresh.name = computedName;
      if (!nonBlank(existingProfile.avatar_url) && providerAvatar) refresh.avatar_url = providerAvatar;
      await refreshProfile(supabase, user.id, refresh);
    }

    // T-GROW1 part C. On every completed sign-in, NOT gated on isNewUser below:
    // that test is a 60 second heuristic an OTP typed a minute late fails, and
    // the server decides whether the account is new enough to credit.
    sendSignupAttribution(user.id);

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

type Client = ReturnType<typeof createClient>;

async function refreshProfile(supabase: Client, userId: string, refresh: ProfileRefresh): Promise<void> {
  if (Object.keys(refresh).length === 0) return;
  const result = await updateUser(supabase, userId, refresh);
  if (!result.success) {
    logError(new Error(result.error), { action: 'upsertUserProfile.update', userId });
  }
}

async function insertMissingProfile(
  supabase: Client,
  user: User,
  name: string,
  providerAvatar: string | null
): Promise<void> {
  const row: NewUserProfileRow = { id: user.id, name };
  if (user.email) row.email = user.email; // Apple can withhold it
  if (providerAvatar) row.avatar_url = providerAvatar;

  const inserted = await insertUserProfileRow(supabase, row);
  if (inserted.success) return;

  if (inserted.duplicate) {
    // handle_new_user created the row between our read and our insert. It
    // seeds name from the same metadata, so only the photo can be missing.
    await refreshProfile(supabase, user.id, providerAvatar ? { avatar_url: providerAvatar } : {});
    return;
  }
  logError(new Error(inserted.error), { action: 'upsertUserProfile.insert', userId: user.id });
}

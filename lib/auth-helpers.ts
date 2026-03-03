import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';

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
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id, avatar_url, created_at')
      .eq('id', user.id)
      .maybeSingle();

    const avatarUrl = user.user_metadata?.avatar_url || null;
    const name =
      displayName || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';

    // Build upsert payload — handle Apple's potential null email
    const upsertPayload: Record<string, string | null> = {
      id: user.id,
      name,
      avatar_url: avatarUrl,
    };
    if (user.email) {
      upsertPayload.email = user.email;
    }

    const { error: upsertError } = await supabase.from('users').upsert(upsertPayload, { onConflict: 'id' });

    if (upsertError) {
      logError(upsertError, { action: 'upsertUserProfile', userId: user.id });
    }

    // Detect new user: no existing profile or account created within last 60s
    isNewUser = !existingProfile || Date.now() - new Date(user.created_at).getTime() < 60_000;
  } catch (err) {
    logError(err, { action: 'upsertUserProfile', userId: user.id });
  }

  log('info', 'User profile upserted', {
    userId: user.id,
    action: 'upsertUserProfile',
  });

  return { isNewUser };
}

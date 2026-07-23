/**
 * Authenticated password change.
 *
 * Why this exists: the only way to change a password used to be the
 * forgot-password flow on the login screen, which requires signing OUT and
 * waiting for an email. A signed-in user who simply wants a new password had no
 * route at all (real user feedback, 2026-06-29: "no puedo cambiar la contraseña").
 *
 * Why the current password is verified first: supabase.auth.updateUser({ password })
 * accepts any valid session and does NOT check the old password. Shipping it bare
 * would mean anyone holding an unlocked phone could silently take over the account.
 * Supabase exposes no dedicated "verify this password" endpoint, so the standard
 * pattern is to re-run signInWithPassword for the same user: it returns an error on
 * a wrong password and re-issues a session for the same account on success, so the
 * user stays signed in either way.
 *
 * Why not supabase.auth.reauthenticate(): it emails a six-digit nonce, which
 * reintroduces the exact email round-trip the user was complaining about.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

/** Mirrors Supabase's own minimum. Enforced here so the UI fails fast and in-language. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordChangeError =
  | 'current_wrong'
  | 'mismatch'
  | 'too_short'
  | 'same_as_current'
  | 'no_email'
  | 'generic';

export interface PasswordChangeResult {
  success: boolean;
  error?: PasswordChangeError;
}

/**
 * Pure input validation, split out so it is testable without a Supabase client
 * and so the dialog can show an error before making any network call.
 */
export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): PasswordChangeError | null {
  if (newPassword !== confirmPassword) return 'mismatch';
  if (newPassword.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (newPassword === currentPassword) return 'same_as_current';
  return null;
}

/**
 * Verify the current password, set the new one, then sign out every OTHER
 * session.
 *
 * The scope: 'others' sign-out is deliberate: Supabase does not revoke other
 * sessions on a password change, so without it a device that was already signed
 * in stays signed in with the old password's session. That is the opposite of
 * what someone changing their password expects. It runs last and its failure is
 * logged but not surfaced, because the password itself has already changed by
 * then and reporting an error would wrongly imply it had not.
 */
export async function changePassword(
  supabase: SupabaseClient,
  email: string | undefined,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<PasswordChangeResult> {
  const invalid = validatePasswordChange(currentPassword, newPassword, confirmPassword);
  if (invalid) return { success: false, error: invalid };

  if (!email) return { success: false, error: 'no_email' };

  try {
    // 1. Prove the caller knows the current password.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) return { success: false, error: 'current_wrong' };

    // 2. Set the new password.
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      logError(updateError, { action: 'changePassword.update' });
      return { success: false, error: 'generic' };
    }

    // 3. Revoke other devices. Non-fatal: the password is already changed.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
    if (signOutError) {
      logError(signOutError, { action: 'changePassword.signout_others' });
    }

    return { success: true };
  } catch (error) {
    logError(error, { action: 'changePassword' });
    return { success: false, error: 'generic' };
  }
}

/**
 * Which auth provider backs this account. Only 'email' users have a password
 * that Tribe can change: as of 2026-07-23 production has 55 email, 13 apple and
 * 8 google accounts, so roughly a quarter of users have no password at all.
 * Those users see the row disabled with an explanation rather than hidden, so
 * the absence reads as an answer instead of a missing feature.
 */
export function getPasswordProvider(provider: string | undefined): 'email' | 'apple' | 'google' | 'other' {
  if (provider === 'email') return 'email';
  if (provider === 'apple') return 'apple';
  if (provider === 'google') return 'google';
  return 'other';
}

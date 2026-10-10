/**
 * Client half of the "Invitado por X" banner. See app/api/referral/inviter/route.ts.
 *
 * Returns the inviter's first name, or null for anything else (unknown code,
 * network failure, rate limit). The banner is a courtesy: a failure must never
 * block or delay sign-up, so nothing here throws.
 */
import { logError } from '@/lib/logger';

export async function fetchInviterFirstName(code: string): Promise<string | null> {
  try {
    // Trailing slash: next.config sets trailingSlash, so the bare path is a 308.
    const res = await fetch(`/api/referral/inviter/?code=${encodeURIComponent(code)}`);
    if (!res.ok) {
      if (res.status !== 400 && res.status !== 429) {
        logError(new Error(`inviter lookup ${res.status}`), { action: 'fetchInviterFirstName' });
      }
      return null;
    }
    const body: { firstName?: unknown } = await res.json();
    return typeof body.firstName === 'string' && body.firstName ? body.firstName : null;
  } catch (error) {
    logError(error, { action: 'fetchInviterFirstName' });
    return null;
  }
}

/**
 * Browser half of T-GROW1 part C: hand the stored touches to /api/attr/signup/.
 *
 * Called from upsertUserProfile, which every completed sign-in passes through
 * (the OAuth callback for Google, Apple and the email confirmation link, and
 * the email OTP verify). Called on EVERY one of them, not only when the client
 * thinks the user is new: the server owns that decision (lib/signupAttribution.ts
 * rule 1 explains why the client's 60 second test cannot).
 *
 * NEVER THROWS AND NEVER DELAYS SIGN-IN. Both callers navigate away right after,
 * so the request goes with `keepalive` and is not awaited; a failure costs one
 * account's attribution and must not cost the sign-in.
 *
 * Sends nothing when neither touch is tagged, which is most sign-ins, and
 * nothing for a user it has already sent for on this device. The second is a
 * courtesy to the rate limiter, not a correctness rule: the server refuses a
 * second write on its own.
 */
import { isTagged, readFirstTouch, readLastTouch } from '@/lib/attribution';
import { logError } from '@/lib/logger';

export const SIGNUP_ATTR_SENT_KEY = 'tribe_attr_signup_sent';

function alreadySentFor(userId: string): boolean {
  try {
    return window.localStorage.getItem(SIGNUP_ATTR_SENT_KEY) === userId;
  } catch {
    return false;
  }
}

function markSentFor(userId: string): void {
  try {
    window.localStorage.setItem(SIGNUP_ATTR_SENT_KEY, userId);
  } catch {
    // Storage blocked: the next sign-in sends again and the server says 'already'.
  }
}

export function sendSignupAttribution(userId: string, now: number = Date.now()): void {
  try {
    if (alreadySentFor(userId)) return;
    const first = readFirstTouch(now);
    const last = readLastTouch(now);
    if (!isTagged(first) && !isTagged(last)) return;

    void fetch('/api/attr/signup/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ first, last }),
    })
      .then((res) => {
        // Any answer the server reached a verdict on ends this device's attempts.
        // A 5xx or a 429 does not, so the next sign-in tries again.
        if (res.ok) markSentFor(userId);
      })
      .catch((err) => logError(err, { action: 'sendSignupAttribution', userId }));
  } catch (err) {
    logError(err, { action: 'sendSignupAttribution', userId });
  }
}

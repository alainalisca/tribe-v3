/**
 * Pending post-onboarding destination (T-C1 Gate 2).
 *
 * New signups are hard-redirected to /onboarding/role, which used to discard
 * the ?returnTo they signed up with (an invite link, a shared session). The
 * auth handlers store the destination here at the moment they branch to
 * onboarding; the final onboarding step consumes it.
 *
 * Why sessionStorage: it survives the hard redirects (window.location.href)
 * and the OAuth round-trip within the same tab, but dies with the tab — so a
 * stale destination cannot leak into a login days later. The value is
 * single-use: consuming it always removes it first.
 *
 * The stored value is NEVER trusted on read. Both store and consume apply the
 * same rule as getSafeReturnTo in useAuthHandlers: an app-relative path with a
 * single leading slash. Everything else collapses to null.
 */
import { logError } from '@/lib/logger';

const KEY = 'tribe_pending_return_to';

/**
 * The one returnTo validation rule: a same-app path ("/x..."), never
 * protocol-relative ("//evil.com"), never absolute ("https://...").
 * Returns null for anything unsafe so callers fall back to their default.
 */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith('/') && !value.startsWith('//') ? value : null;
}

/**
 * Decode a raw ?returnTo= query value without letting a malformed percent
 * sequence throw. Returns the raw string on decode failure — sanitizeReturnTo
 * still gates whatever comes out.
 */
export function decodeReturnToParam(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Remember where a brand-new signup was headed before onboarding. No-ops for
 * missing, unsafe, or default ("/") destinations — storing those would only
 * create a value that needs clearing.
 */
export function storePendingReturnTo(path: string | null | undefined): void {
  const safe = sanitizeReturnTo(path);
  if (!safe || safe === '/') return;
  try {
    sessionStorage.setItem(KEY, safe);
  } catch (error) {
    // Storage can be unavailable (private mode, disabled cookies). The user
    // then simply gets the pre-Gate-2 behavior: onboarding ends at its default.
    logError(error, { action: 'storePendingReturnTo' });
  }
}

/**
 * Single-use read of the pending destination. Removes the value BEFORE
 * validating so a bad entry can never linger, and re-validates on the way out
 * — never redirect to a stored value without re-checking it.
 */
export function consumePendingReturnTo(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return sanitizeReturnTo(raw);
  } catch (error) {
    logError(error, { action: 'consumePendingReturnTo' });
    return null;
  }
}

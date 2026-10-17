/**
 * T-SITE1. "Might this visitor be signed in?", answered from cookie NAMES alone.
 *
 * @supabase/ssr stores the session as `sb-<project-ref>-auth-token`, split into
 * `.0`, `.1`... chunks when large. Presence is not validity: an expired session
 * still has the cookie. That is acceptable for both callers, because each errs
 * toward the app:
 *
 * - middleware: a cookie sends `/` to the feed (app/page.tsx), which resolves the
 *   session for real and sends a stale one to the site;
 * - the site nav: a cookie swaps "Entrar" for the avatar only once the session
 *   actually resolves.
 *
 * What it buys is that a visitor WITHOUT the cookie, which is every first visit,
 * gets the prerendered site with no auth round trip and no supabase-js download.
 */
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export function hasAuthCookieName(names: Iterable<string>): boolean {
  for (const name of names) if (AUTH_COOKIE.test(name)) return true;
  return false;
}

/** The names in a `document.cookie` string. */
export function cookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter(Boolean);
}

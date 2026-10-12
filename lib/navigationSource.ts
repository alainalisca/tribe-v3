/**
 * T-ANALYTICS1 part D. Where did this page view come from, in app terms?
 *
 * session_viewed needs a `source` (feed / profile / share link / ...), and the
 * session page has no way to know it: dozens of links point at /session/[id]
 * and none says who it is. Rather than thread a ?from= through every one of
 * them, PostHogProvider records each App Router pathname here, and the session
 * page asks what the PREVIOUS one was.
 *
 * Module state, deliberately: one value per tab, reset on a full page load,
 * which is exactly when "the previous in-app page" stops meaning anything.
 */
import type { SessionViewSource } from '@/lib/analytics';

let currentPath: string | null = null;
let previousPath: string | null = null;

function normalise(pathname: string): string {
  // next.config has trailingSlash: true, so /profile/x/ and /profile/x are one page.
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Called by PostHogProvider on every pathname change. */
export function recordNavigation(pathname: string | null): void {
  if (!pathname) return;
  const path = normalise(pathname);
  if (path === currentPath) return;
  previousPath = currentPath;
  currentPath = path;
}

/**
 * The in-app page before `pathname`, or null on the first page of a visit.
 *
 * Independent of effect order: if the provider has already recorded
 * `pathname`, the page before it is `previousPath`; if it has not yet (the
 * reader's effect ran first), the page before it is still `currentPath`.
 */
export function pathBefore(pathname: string): string | null {
  return normalise(pathname) === currentPath ? previousPath : currentPath;
}

/**
 * Classify the page a session was opened FROM. 'map' is never returned: no map
 * of sessions exists (the only map is the instructors page, held in component
 * state), and guessing would put wrong numbers in a funnel.
 */
export function sessionViewSourceFrom(previous: string | null): SessionViewSource {
  if (previous === null) return 'direct';
  if (previous === '/' || previous === '/feed' || previous.startsWith('/feed/')) return 'feed';
  if (previous.startsWith('/s/')) return 'share_link';
  if (
    previous.startsWith('/profile/') ||
    previous.startsWith('/i/') ||
    previous.startsWith('/g/') ||
    previous === '/instructors' ||
    previous.startsWith('/storefront')
  ) {
    return 'profile';
  }
  return 'other';
}

/** Test-only. */
export function __resetNavigationForTests(): void {
  currentPath = null;
  previousPath = null;
}

/**
 * T-AV24 (Al, 2026-09-30, option 1). The athletes flag, enforced in
 * middleware with a REAL 404, for the program's signed-in pages.
 *
 * WHY MIDDLEWARE AND NOT ONLY THE PAGE. The root app/loading.tsx puts every
 * page inside a Suspense boundary, so the response has already started
 * streaming with status 200 by the time a page runs. A page's notFound() can
 * then render the 404 UI but cannot change the status. Measured 2026-09-30,
 * flag off, signed in: /atletas/ and /pase/verificar/{code}/ both answered
 * 200 with the 404 page, while an unknown route answered 404. So a stranger
 * could tell the unreleased routes exist by their status alone, which is what
 * the hard line's "normal 404" forbids. Middleware runs before any rendering,
 * so its 404 is real. The pages keep their own notFound() as a second layer.
 *
 * EXACT PREFIXES ONLY. /pase/{slug}/ (the public pass page, printed on
 * posters) and /api/pase must never be touched by this, flag on or off;
 * t-av24-proof.LOCAL.sh checks their real status codes in both states.
 *
 * FAIL CLOSED. The same resolver the pages use (isAthleteValueEnabled with
 * the `athletes` feature, admin-aware by design for signed-in surfaces), and
 * any error resolving it, the user or the admin RPC, is a no.
 */
import { isAthleteValueEnabled, type AdminRpcClient } from './athleteValue';
import { ATHLETES_FEATURE } from './athletesAttribution';

/** The program's flag-gated pages. Nothing else, and never /pase/{slug}. */
export const ATHLETES_GATED_PREFIXES = ['/atletas', '/pase/verificar'] as const;

/**
 * An internal path no route matches, so a rewrite to it renders the app's
 * ordinary not-found page: the same body an unknown URL gets.
 */
export const GATED_NOT_FOUND_PATH = '/__tav-gated-not-found__';

export function isAthletesGatedPath(pathname: string): boolean {
  return ATHLETES_GATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * May this caller reach a gated page. `getUserId` is a thunk so a failure to
 * read the session is caught here and answered as no.
 */
export async function athletesGateAllows(
  getUserId: () => Promise<string | null>,
  supabase: AdminRpcClient,
  env?: Record<string, string | undefined>
): Promise<boolean> {
  try {
    const userId = await getUserId();
    return await isAthleteValueEnabled(userId, supabase, { feature: ATHLETES_FEATURE, env });
  } catch {
    // Fail closed: an error resolving the flag is not a reason to show an
    // unreleased page. Deliberately silent: middleware runs on every request
    // to these paths, and the page's own check logs if it is reached.
    return false;
  }
}

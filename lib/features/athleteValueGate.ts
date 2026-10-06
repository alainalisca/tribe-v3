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
export const ATHLETES_GATED_PREFIXES = ['/atletas', '/pase/verificar', '/admin/atletas'] as const;

/**
 * An internal path no route matches, so a rewrite to it renders the app's
 * ordinary not-found page: the same body an unknown URL gets.
 */
export const GATED_NOT_FOUND_PATH = '/__tav-gated-not-found__';

export function isAthletesGatedPath(pathname: string): boolean {
  return ATHLETES_GATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type PartnerRole = 'owner' | 'coach' | 'admin';

/** The client shape the gym role check needs: one RPC with one argument. */
export interface PartnerRoleRpcClient {
  rpc(fn: 'av_my_partner_role', args: { p_partner_id: string }): PromiseLike<{ data: unknown; error: unknown }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GYM_PATH = /^\/atletas\/gym(?:\/([^/]*))?(\/.*)?$/;
const STAFF: readonly PartnerRole[] = ['owner', 'coach', 'admin'];
const OWNER_OR_ADMIN: readonly PartnerRole[] = ['owner', 'admin'];

/**
 * T-AV26 (Al's decision 2). Who may reach a page under /atletas/gym/{id}/.
 *
 *   null              not a gym path; the flag alone decides
 *   'not_found'       a gym path with no valid partner id
 *   { partnerId, roles }
 *                     the caller's av_my_partner_role(partnerId) must be one
 *                     of `roles`: owner, coach or admin for the dashboard and
 *                     the door list; owner or admin only for /ajustes/
 *
 * A page's own notFound() streams with status 200 under the root loading
 * boundary (T-AV24), so this is what makes "a coach on settings" and "another
 * gym's owner" a REAL 404. The pages keep their own checks as a second layer.
 */
export function gymPathRequirement(
  pathname: string
): null | 'not_found' | { partnerId: string; roles: readonly PartnerRole[] } {
  const m = GYM_PATH.exec(pathname);
  if (!m) return null;
  const partnerId = m[1] ?? '';
  if (!UUID.test(partnerId)) return 'not_found';
  const rest = m[2] ?? '/';
  const isSettings = rest === '/ajustes' || rest.startsWith('/ajustes/');
  return { partnerId, roles: isSettings ? OWNER_OR_ADMIN : STAFF };
}

/**
 * T-AV27b. /admin/atletas/ is for app admins only, and a non-admin gets a REAL
 * 404 here rather than the redirect the other admin pages do, so the
 * unreleased screen cannot be discovered by its status.
 */
export function isAdminAthletesPath(pathname: string): boolean {
  return pathname === '/admin/atletas' || pathname.startsWith('/admin/atletas/');
}

/** is_app_admin(), strictly true. Any error is a no. */
async function callerIsAdmin(supabase: AdminRpcClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_app_admin');
  return !error && data === true;
}

/** Does the caller hold one of `roles` for this partner. Any error is a no. */
async function callerHasPartnerRole(
  supabase: PartnerRoleRpcClient,
  partnerId: string,
  roles: readonly PartnerRole[]
): Promise<boolean> {
  const { data, error } = await supabase.rpc('av_my_partner_role', { p_partner_id: partnerId });
  if (error) return false;
  return typeof data === 'string' && (roles as readonly string[]).includes(data);
}

/**
 * May this caller reach a gated page. `getUserId` is a thunk so a failure to
 * read the session is caught here and answered as no. With `pathname` set and
 * under /atletas/gym/, the caller must also hold the partner role that path
 * needs (gymPathRequirement).
 */
export async function athletesGateAllows(
  getUserId: () => Promise<string | null>,
  supabase: AdminRpcClient & PartnerRoleRpcClient,
  env?: Record<string, string | undefined>,
  pathname?: string
): Promise<boolean> {
  try {
    const userId = await getUserId();
    const flagOn = await isAthleteValueEnabled(userId, supabase, { feature: ATHLETES_FEATURE, env });
    if (!flagOn) return false;
    if (pathname !== undefined && isAdminAthletesPath(pathname)) return !!userId && (await callerIsAdmin(supabase));
    const need = pathname === undefined ? null : gymPathRequirement(pathname);
    if (need === null) return true;
    if (need === 'not_found' || !userId) return false;
    return await callerHasPartnerRole(supabase, need.partnerId, need.roles);
  } catch {
    // Fail closed: an error resolving the flag is not a reason to show an
    // unreleased page. Deliberately silent: middleware runs on every request
    // to these paths, and the page's own check logs if it is reached.
    return false;
  }
}

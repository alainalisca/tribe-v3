import { isUserId } from '@/lib/coachLink';
import { GATE_TIMEOUT_MS } from '@/lib/site/publicPageGate';

/**
 * T-POLISH1 PR 3b-0 (signed out) and 3b-2 (everyone): where a visitor to
 * /storefront/<user id>/ goes.
 *
 * /storefront was an auth-gated app page, so a signed-out visitor was sent to
 * /auth with the whole URL folded into returnTo. The printed QR codes and the
 * pass links (`/storefront/<uuid>/?src=…&code=…`) therefore landed on a sign-in
 * wall, and their src and code never reached AttributionCapture, which reads
 * only the top-level query.
 *
 * The storefront now lives on its public pages: the gym's /g/<slug>/ or the
 * coach's /i/<id>/, which carry its actions, reviews and pass (PR 3b-1) and,
 * for a signed-in viewer, the app's tab bar (PR 3b-2). middleware.ts sends
 * every visitor there with a 307 and the query string copied whole, so the tags
 * arrive where the root layout captures them, and a link printed or emailed
 * with /storefront keeps working.
 *
 * The rule is /i's (publicPageGate coachVerdict): the account must exist and not
 * be a test account, banned or deleted, or the answer is a 404. Then an active
 * gym or studio it owns wins (its storefront shows the organisation, so its
 * public page is /g), else an instructor gets /i, else a 404 (an athlete has no
 * storefront to stand in for).
 *
 * 307, not 308: the answer depends on data that changes (a coach opens a gym, an
 * account is banned) and browsers keep a permanent redirect forever. /storefront
 * was never public, so a temporary redirect costs nothing in search.
 *
 * Two indexed reads with the anon key, in parallel: only what any visitor may
 * read (featured_partners' "Anyone can read active" policy; users' public
 * columns, the same select the /i gate makes). A read that fails or is slow
 * returns 'error' and middleware lets today's auth gate handle the request.
 */

const STOREFRONT_PAGE = /^\/storefront\/([^/]+)\/?$/;

/** The id in a /storefront page path, or null for every other path. */
export function storefrontIdFor(pathname: string): string | null {
  const m = STOREFRONT_PAGE.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return '';
  }
}

export type StorefrontAccount = {
  is_instructor: boolean | null;
  is_test_account: boolean | null;
  banned: boolean | null;
  deleted_at: string | null;
};
export type StorefrontGym = { id: string; slug: string | null };

export type StorefrontDestination = { kind: 'redirect'; path: string } | { kind: 'notFound' } | { kind: 'error' };

/** The decision, from the two rows. Pure, so every case is tested without a network. */
export function storefrontDestination(
  userId: string,
  account: StorefrontAccount | null,
  gym: StorefrontGym | null
): StorefrontDestination {
  if (!account || account.is_test_account || account.banned || account.deleted_at) return { kind: 'notFound' };
  if (gym) return { kind: 'redirect', path: `/g/${encodeURIComponent(gym.slug || gym.id)}/` };
  if (account.is_instructor) return { kind: 'redirect', path: `/i/${userId.toLowerCase()}/` };
  return { kind: 'notFound' };
}

type Fetcher = typeof fetch;

async function readOne<T>(url: string, anonKey: string, fetcher: Fetcher): Promise<T | null | 'error'> {
  try {
    const res = await fetcher(url, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0 ? (rows[0] as T) : null;
  } catch {
    return 'error';
  }
}

/** Where a visitor to /storefront/<id>/ goes. */
export async function storefrontRedirectDestination(
  id: string,
  env: { url: string; anonKey: string },
  fetcher: Fetcher = fetch
): Promise<StorefrontDestination> {
  if (!isUserId(id)) return { kind: 'notFound' };
  if (!env.url || !env.anonKey) return { kind: 'error' };
  const base = env.url.replace(/\/+$/, '');
  const userId = id.toLowerCase();
  const [account, gym] = await Promise.all([
    readOne<StorefrontAccount>(
      `${base}/rest/v1/users?select=is_instructor,is_test_account,banned,deleted_at&id=eq.${userId}&limit=1`,
      env.anonKey,
      fetcher
    ),
    readOne<StorefrontGym>(
      `${base}/rest/v1/featured_partners?select=id,slug&user_id=eq.${userId}&status=eq.active` +
        `&business_type=in.(gym,studio)&order=created_at.asc&limit=1`,
      env.anonKey,
      fetcher
    ),
  ]);
  if (account === 'error' || gym === 'error') return { kind: 'error' };
  return storefrontDestination(userId, account, gym);
}

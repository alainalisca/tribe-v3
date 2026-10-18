import { isUserId, normalizeHandle } from '@/lib/coachLink';

/**
 * T-SSR1: a real HTTP 404 for a public page that must not exist for this
 * visitor, decided in middleware BEFORE anything renders. A page's own
 * notFound() cannot set the status: the root loading boundary (app/loading.tsx)
 * has already streamed a 200 by then (the same reason /atletas is gated in
 * middleware, T-AV24).
 *
 *   /session/<id>/  404 when the id is not a UUID; when the public view has
 *                   no such session and the visitor is signed out (signed in,
 *                   an invite_only session may still be theirs: the page
 *                   decides); and for a test session (sessions.is_test) unless
 *                   the visitor is its host or an admin.
 *   /i/<x>/         404 when no user has that id or handle, or the user is not
 *                   a listed coach (an instructor, not a test account, not
 *                   banned, not deleted).
 *
 * One indexed read per request (sessions_public by id; users by id or
 * handle), with the anon key: only what any visitor may read. Only the page
 * paths: the cards (/session/<id>/card/, /i/<x>/card/) and the session's
 * edit and chat pages are not checked. A read that fails or is slow lets the
 * page through, where the server layout and the page keep their own guards.
 */
export const GATE_TIMEOUT_MS = 1500;

const SESSION_PAGE = /^\/session\/([^/]+)\/?$/;
const COACH_PAGE = /^\/i\/([^/]+)\/?$/;

export type GateTarget = { kind: 'session'; id: string } | { kind: 'coach'; key: string } | { kind: 'notFound' };

/** Which check a path needs, or null for every other path. */
export function gateTargetFor(pathname: string): GateTarget | null {
  const s = SESSION_PAGE.exec(pathname);
  if (s) return isUserId(s[1]) ? { kind: 'session', id: s[1].toLowerCase() } : { kind: 'notFound' };
  const c = COACH_PAGE.exec(pathname);
  if (c) {
    let key: string;
    try {
      key = decodeURIComponent(c[1]);
    } catch {
      return { kind: 'notFound' };
    }
    return { kind: 'coach', key };
  }
  return null;
}

export type SessionRow = { is_test: boolean | null; creator_id: string | null };
export type CoachRow = {
  is_instructor: boolean | null;
  is_test_account: boolean | null;
  banned: boolean | null;
  deleted_at: string | null;
};

/** 'hide' (404), 'show', or 'ask' (a signed-in visitor on a test session: host or admin?). */
export function sessionVerdict(row: SessionRow | null, signedIn: boolean): 'hide' | 'show' | 'ask' {
  if (!row) return signedIn ? 'show' : 'hide';
  if (!row.is_test) return 'show';
  return signedIn ? 'ask' : 'hide';
}

export function coachVerdict(row: CoachRow | null): 'hide' | 'show' {
  if (!row) return 'hide';
  return row.is_instructor && !row.is_test_account && !row.banned && !row.deleted_at ? 'show' : 'hide';
}

type Fetcher = typeof fetch;

/** The one read for a target: the row, null when there is none, or 'error' (let the page decide). */
export async function readGateRow(
  target: Exclude<GateTarget, { kind: 'notFound' }>,
  env: { url: string; anonKey: string },
  fetcher: Fetcher = fetch
): Promise<SessionRow | CoachRow | null | 'error'> {
  if (!env.url || !env.anonKey) return 'error';
  const base = env.url.replace(/\/+$/, '');
  const query =
    target.kind === 'session'
      ? `sessions_public?select=is_test,creator_id&id=eq.${encodeURIComponent(target.id)}&limit=1`
      : `users?select=is_instructor,is_test_account,banned,deleted_at&${
          isUserId(target.key) ? 'id' : 'handle'
        }=eq.${encodeURIComponent(isUserId(target.key) ? target.key.toLowerCase() : normalizeHandle(target.key))}&limit=1`;
  try {
    const res = await fetcher(`${base}/rest/v1/${query}`, {
      headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0 ? (rows[0] as SessionRow | CoachRow) : null;
  } catch {
    return 'error';
  }
}

/** base64 or base64url to text; atob, so it runs in the Edge middleware too. */
function decodeBase64(b64: string): string {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/**
 * The signed-in visitor's access token, read from the @supabase/ssr session
 * cookie (`sb-<ref>-auth-token`, or its `.0`, `.1`... chunks) WITHOUT a
 * supabase client: a client's getUser() refreshes an expired session, and with
 * nowhere to write the new cookies here that would spend the browser's refresh
 * token and sign the visitor out. Null when absent, unreadable or expired.
 */
export function accessTokenFromCookies(
  cookies: { name: string; value: string }[],
  nowSeconds: number = Date.now() / 1000
): string | null {
  const byName = new Map(cookies.map((c) => [c.name, c.value]));
  const base = cookies.map((c) => /^(sb-.+-auth-token)(\.\d+)?$/.exec(c.name)?.[1]).find(Boolean);
  if (!base) return null;
  let raw = byName.get(base);
  if (raw === undefined) {
    const parts: string[] = [];
    for (let i = 0; byName.has(`${base}.${i}`); i++) parts.push(byName.get(`${base}.${i}`)!);
    raw = parts.join('');
  }
  if (!raw) return null;
  try {
    let text = raw.startsWith('base64-') ? decodeBase64(raw.slice(7)) : raw;
    if (text.startsWith('%')) text = decodeURIComponent(text);
    const parsed = JSON.parse(text) as { access_token?: unknown } | unknown[];
    const token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token;
    if (typeof token !== 'string') return null;
    const payload = JSON.parse(decodeBase64(token.split('.')[1] ?? '')) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' && payload.exp > nowSeconds ? token : null;
  } catch {
    return null;
  }
}

/**
 * A signed-in visitor on a test session: 'show' for its host or an admin,
 * 'hide' for anyone else. Supabase checks the token (auth/v1/user, then
 * is_app_admin() as that user). No usable token, or any failure: 'show', and
 * the page decides (its server layout guards test sessions too).
 */
export async function hostOrAdminVerdict(
  row: SessionRow,
  token: string | null,
  env: { url: string; anonKey: string },
  fetcher: Fetcher = fetch
): Promise<'hide' | 'show'> {
  if (!token || !env.url) return 'show';
  const base = env.url.replace(/\/+$/, '');
  const headers = { apikey: env.anonKey, Authorization: `Bearer ${token}`, Accept: 'application/json' };
  try {
    const userRes = await fetcher(`${base}/auth/v1/user`, {
      headers,
      signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!userRes.ok) return 'show';
    const user = (await userRes.json()) as { id?: string };
    if (!user.id) return 'show';
    if (user.id === row.creator_id) return 'show';
    const adminRes = await fetcher(`${base}/rest/v1/rpc/is_app_admin`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!adminRes.ok) return 'show';
    return (await adminRes.json()) === true ? 'show' : 'hide';
  } catch {
    return 'show';
  }
}

/**
 * T-AV29 (Al's phone scan, 2026-10-06). The origin a PERSON reaches this app
 * on, for any link that leaves the request: the voucher QR a phone camera
 * scans, the door link in the owner's email.
 *
 * NOT `new URL(request.url).origin`. In the dev server that is the server's
 * own hostname: a pass claimed through http://192.168.8.230:3003 got a QR for
 * http://localhost:3003/pase/verificar/{code}/ (measured by matching the
 * returned QR against candidate URLs), and "localhost" on a phone is the phone.
 * The scan reached nothing, so the coach typed the address and lost the pass.
 *
 * Order:
 *   1. NEXT_PUBLIC_SITE_URL, when it is an absolute http(s) URL: the app's
 *      declared public address (production sets it; a LAN test sets it to the
 *      Mac's address)
 *   2. the request's own Host (x-forwarded-host first, as Vercel's proxy
 *      sends it), with x-forwarded-proto, else http for localhost or a
 *      private address and https otherwise
 *   3. request.url's origin, the last resort
 * A host header is used only if it is a bare host[:port], so a forged header
 * cannot smuggle a path, credentials or a second URL into the link.
 */
const BARE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/i;

function siteOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function isLocalOrPrivate(host: string): boolean {
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (name === 'localhost' || name === '127.0.0.1' || name === '::1') return true;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(name);
}

export function publicOrigin(
  request: { url: string; headers: Headers },
  env: Record<string, string | undefined> = process.env
): string {
  const site = siteOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (site) return site;

  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').split(',')[0].trim();
  if (host && BARE_HOST.test(host)) {
    const forwarded = (request.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim();
    const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : isLocalOrPrivate(host) ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

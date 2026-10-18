import { sessionCardResponse } from '@/lib/og/sessionCard';

/**
 * T-JOIN1 Part B: a session's share card (lib/og/sessionCard.ts), the JPEG
 * the session page's og:image names. A route handler with a trailing slash,
 * like every Tribe card (an opengraph-image file's URL would be 308'd by
 * trailingSlash: true). Public, cached five minutes at the CDN; the URL carries
 * ?v=<fingerprint>, so a changed card reaches a newly shared link.
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const res = await sessionCardResponse(id);
  if (!res) return new Response('Not found', { status: 404 });
  res.headers.set('Cache-Control', CACHE_CONTROL);
  return res;
}

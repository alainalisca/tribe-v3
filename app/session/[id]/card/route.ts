import { sessionCardResponse } from '@/lib/og/sessionCard';

/**
 * T-JOIN1: a session's share card (lib/og/sessionCard.ts), the JPEG the
 * session page's og:image names. A route handler with a trailing slash, like
 * every Tribe card (an opengraph-image file's URL would be 308'd by
 * trailingSlash: true).
 *
 * Always an image, never a 404 for a session id: WhatsApp keeps the first
 * preview it gets, so an empty answer is an empty preview for good. A session
 * that is not public gets the site's home card, cached five minutes in case it
 * becomes public.
 *
 * The URL carries ?v=<fingerprint of everything the card shows>, so the CDN
 * keeps a card a week and a changed card is a new URL: the first fetch is the
 * only slow one (a cold render took 3.1 s on the preview, 2026-10-18), and the
 * session page warms it (app/session/[id]/layout.tsx).
 */
export const dynamic = 'force-dynamic';

const CACHE_CARD = 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000';
const CACHE_FALLBACK = 'public, max-age=300, s-maxage=300';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const { res, fallback } = await sessionCardResponse(id);
  res.headers.set('Cache-Control', fallback ? CACHE_FALLBACK : CACHE_CARD);
  return res;
}

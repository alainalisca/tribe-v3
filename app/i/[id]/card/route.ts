import { coachCardResponse } from '@/lib/og/coachCard';

/**
 * T-SHARE1 Part C: a coach's share card (lib/og/coachCard.ts), the JPEG the
 * og:image of /i/<handle> names. A route handler with a trailing slash, like
 * the site's cards, not an opengraph-image file: trailingSlash: true would 308
 * the URL Next gives those. Its URL carries ?v=<fingerprint>, so the CDN may
 * keep it a day and a changed card still reaches a newly shared link.
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await coachCardResponse(id);
  if (!res) return new Response('Not found', { status: 404 });
  res.headers.set('Cache-Control', CACHE_CONTROL);
  return res;
}

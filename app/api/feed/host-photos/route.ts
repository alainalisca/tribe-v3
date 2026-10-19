import { NextResponse } from 'next/server';
import { hostHeroesFor, MAX_HOSTS } from '@/lib/feed/hostHeroes';

/**
 * GET /api/feed/host-photos/?ids=<uuid>,<uuid> (T-UI-FD1): the home feed's
 * card photos, one request per page for every host on it (lib/feed/
 * hostHeroes.ts). Signed-in only (middleware: /api/feed is not public).
 * Returns { photos: { <hostId>: { url, x, y } | null } }.
 */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_HOSTS) {
    return NextResponse.json({ photos: {} }, { status: ids.length === 0 ? 200 : 400 });
  }
  const photos = await hostHeroesFor(ids);
  return NextResponse.json({ photos }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}

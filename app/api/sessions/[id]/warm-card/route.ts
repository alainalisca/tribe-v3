import { after, NextResponse } from 'next/server';
import { shareImageOrigin } from '@/lib/http/shareImageOrigin';
import { logError } from '@/lib/logger';
import { loadSessionForCard, sessionCardVersion, sharesAsHomeCard } from '@/lib/og/sessionCard';

/**
 * POST /api/sessions/[id]/warm-card (T-JOIN1): render a session's share card
 * into the CDN after the session is created or edited (lib/share/
 * warmSessionCard.ts). Works out the same versioned URL the page's og:image
 * names and fetches it after the response, so the next request for it, most
 * likely WhatsApp's, is a cache hit.
 *
 * Signed-in only (middleware: /api/sessions is not public). Reads nothing a
 * signed-out visitor could not: the public session and its card.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ warmed: false }, { status: 400 });
  try {
    const loaded = await loadSessionForCard(id);
    // Not public (yet): nothing a share could show, nothing to warm.
    // A test or cancelled session shares as the home card (T-JOIN1b): nothing of its own to warm.
    if (!loaded || sharesAsHomeCard(loaded.row)) return NextResponse.json({ warmed: false }, { status: 202 });
    const url = `${shareImageOrigin()}/session/${id}/card/?v=${sessionCardVersion(loaded.row, loaded.partnerName, loaded.host)}`;
    after(() => fetch(url, { headers: { 'user-agent': 'TribeCardWarmup/1.0' } }).catch(() => undefined));
    return NextResponse.json({ warmed: true, url }, { status: 202 });
  } catch (error) {
    logError(error, { action: 'warmCard', sessionId: id });
    return NextResponse.json({ warmed: false }, { status: 202 });
  }
}

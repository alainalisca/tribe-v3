import { NextResponse } from 'next/server';
import { loadSessionMoments } from '@/lib/moments/batch';
import { guardMomentsManager, PRIVATE, fail } from '@/lib/moments/routeGuard';
import { logError } from '@/lib/logger';

/** GET /api/moments/<session>/ (T-MOM1): the upload screen's photos, tags and people. Host, admin or photographer. */
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const g = await guardMomentsManager(sessionId);
  if (!g.ok) return g.res;
  try {
    return NextResponse.json(await loadSessionMoments(g.service, sessionId), { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.state', sessionId });
    return fail(500, 'load_failed');
  }
}

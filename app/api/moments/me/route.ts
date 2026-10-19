import { NextResponse } from 'next/server';
import { fail, guardMe, PRIVATE } from '@/lib/moments/routeGuard';
import { loadMyMoments } from '@/lib/moments/mine';
import { logError } from '@/lib/logger';

/** GET /api/moments/me/ (T-MOM1 Part C): the signed-in person's own Momentos, by session. */
export async function GET() {
  const g = await guardMe();
  if (!g.ok) return g.res;
  try {
    return NextResponse.json({ batches: await loadMyMoments(g.service, g.user.id) }, { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.me.load' });
    return fail(500, 'load_failed');
  }
}

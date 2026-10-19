import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guardMe, PRIVATE } from '@/lib/moments/routeGuard';
import { loadMyTag, setShowOnCoachPage } from '@/lib/moments/myActions';
import { logError } from '@/lib/logger';

const Body = z.object({ show: z.boolean() }).strict();

/**
 * POST /api/moments/me/<media>/coach-page/ (T-MOM1 Part D): "Mostrar en la
 * página de <coach>". Only the person in the photo decides, on their own tag;
 * the coach never can.
 */
export async function POST(req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const g = await guardMe(mediaId);
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request');
  const tag = await loadMyTag(g.service, g.user.id, mediaId);
  if (!tag) return fail(404, 'not_found');
  try {
    await setShowOnCoachPage(g.service, tag, parsed.data.show);
    return NextResponse.json({ show: parsed.data.show }, { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.me.coachPage', mediaId });
    return fail(500, 'update_failed');
  }
}

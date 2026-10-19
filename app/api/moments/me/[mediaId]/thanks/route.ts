import { NextResponse } from 'next/server';
import { fail, guardMe, PRIVATE } from '@/lib/moments/routeGuard';
import { loadMyTag, thankForPhoto } from '@/lib/moments/myActions';
import { logError } from '@/lib/logger';

/** POST /api/moments/me/<media>/thanks/ (T-MOM1 Part C): "Gracias". The uploader hears once per batch. */
export async function POST(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const g = await guardMe(mediaId);
  if (!g.ok) return g.res;
  const tag = await loadMyTag(g.service, g.user.id, mediaId);
  if (!tag) return fail(404, 'not_found');
  try {
    return NextResponse.json(await thankForPhoto(g.service, g.user.id, tag), { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.me.thanks', mediaId });
    return fail(500, 'thanks_failed');
  }
}

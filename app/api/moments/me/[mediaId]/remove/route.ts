import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guardMe, PRIVATE } from '@/lib/moments/routeGuard';
import { loadMyTag, removeMeFromPhoto } from '@/lib/moments/myActions';
import { logError } from '@/lib/logger';

const Body = z.object({ requestDelete: z.boolean().optional() }).strict();

/**
 * POST /api/moments/me/<media>/remove/ (T-MOM1 Part C): "Quitarme de esta
 * foto" (the uploader is not told), or with { requestDelete: true } "Pedir que
 * la borren" (removed too, and the uploader is asked to delete it).
 */
export async function POST(req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const g = await guardMe(mediaId);
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(400, 'bad_request');
  const tag = await loadMyTag(g.service, g.user.id, mediaId);
  if (!tag) return fail(404, 'not_found');
  try {
    return NextResponse.json(await removeMeFromPhoto(g.service, g.user.id, tag, !!parsed.data.requestDelete), {
      headers: PRIVATE,
    });
  } catch (error) {
    logError(error, { action: 'moments.me.remove', mediaId });
    return fail(500, 'remove_failed');
  }
}

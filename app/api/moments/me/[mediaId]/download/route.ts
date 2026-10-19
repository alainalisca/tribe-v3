import { NextResponse } from 'next/server';
import { fail, guardMe, PRIVATE } from '@/lib/moments/routeGuard';
import { downloadUrl, loadMyTag } from '@/lib/moments/myActions';

/** GET /api/moments/me/<media>/download/ (T-MOM1 Part C): "Descargar", a 1-hour signed URL to the original. */
export async function GET(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const g = await guardMe(mediaId);
  if (!g.ok) return g.res;
  const tag = await loadMyTag(g.service, g.user.id, mediaId);
  if (!tag) return fail(404, 'not_found');
  const url = await downloadUrl(g.service, tag);
  if (!url) return fail(500, 'sign_failed');
  return NextResponse.json({ url }, { headers: PRIVATE });
}

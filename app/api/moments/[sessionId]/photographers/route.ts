import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guardPhotographerGranter, PRIVATE } from '@/lib/moments/routeGuard';
import { grantPhotographer, loadPhotographers, revokePhotographer } from '@/lib/moments/photographers';
import { logError } from '@/lib/logger';

/**
 * /api/moments/<session>/photographers/ (T-MOM1 Part C): "Fotógrafo de esta
 * sesión". GET the list and who could be named; POST { userId } names one
 * (someone in the session); DELETE { userId } removes one. Host or admin only.
 */
const Body = z.object({ userId: z.string().uuid() }).strict();
type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { sessionId } = await params;
  const g = await guardPhotographerGranter(sessionId);
  if (!g.ok) return g.res;
  return NextResponse.json(await loadPhotographers(g.service, sessionId), { headers: PRIVATE });
}

export async function POST(req: Request, { params }: Params) {
  const { sessionId } = await params;
  const g = await guardPhotographerGranter(sessionId);
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request');
  try {
    if (!(await grantPhotographer(g.service, sessionId, parsed.data.userId, g.user.id)))
      return fail(400, 'not_in_session');
    return NextResponse.json(await loadPhotographers(g.service, sessionId), { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.photographers.grant', sessionId });
    return fail(500, 'grant_failed');
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { sessionId } = await params;
  const g = await guardPhotographerGranter(sessionId);
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request');
  try {
    await revokePhotographer(g.service, sessionId, parsed.data.userId);
    return NextResponse.json(await loadPhotographers(g.service, sessionId), { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.photographers.revoke', sessionId });
    return fail(500, 'revoke_failed');
  }
}

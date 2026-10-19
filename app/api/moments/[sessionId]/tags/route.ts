import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardMomentsManager, PRIVATE, fail } from '@/lib/moments/routeGuard';
import { applyTags } from '@/lib/moments/tagging';
import { loadSessionMoments } from '@/lib/moments/batch';
import { logError } from '@/lib/logger';

/** POST /api/moments/<session>/tags/ (T-MOM1): tag or untag people on several photos at once. Answers the new state. */
const uuid = z.string().uuid();
const body = z.object({
  mediaIds: z.array(uuid).min(1).max(500),
  targets: z
    .array(z.object({ kind: z.enum(['user', 'invite', 'guest']), id: uuid }))
    .min(1)
    .max(100),
  mode: z.enum(['add', 'remove']),
});

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const g = await guardMomentsManager(sessionId);
  if (!g.ok) return g.res;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid_body');
  try {
    await applyTags(g.service, { sessionId, ...parsed.data, actorId: g.user.id });
    return NextResponse.json(await loadSessionMoments(g.service, sessionId), { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.tags', sessionId });
    return fail(500, 'tag_failed');
  }
}

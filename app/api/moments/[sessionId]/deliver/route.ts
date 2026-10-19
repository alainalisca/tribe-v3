import { NextResponse } from 'next/server';
import { guardMomentsManager, PRIVATE, fail } from '@/lib/moments/routeGuard';
import { deliverSessionMoments } from '@/lib/moments/deliver';
import { makeMomentsNotifier } from '@/lib/moments/notify';
import { logError } from '@/lib/logger';

/** POST /api/moments/<session>/deliver/ (T-MOM1): "Entregar". One notification per tagged person. */
export async function POST(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const g = await guardMomentsManager(sessionId);
  if (!g.ok) return g.res;
  try {
    const { data: s } = await g.service
      .from('sessions')
      .select('title, sport, creator_id')
      .eq('id', sessionId)
      .maybeSingle();
    const session = s as { title: string | null; sport: string | null; creator_id: string | null } | null;
    const { data: host } = session?.creator_id
      ? await g.service.from('users').select('name').eq('id', session.creator_id).maybeSingle()
      : { data: null };
    const notify = makeMomentsNotifier(g.service, {
      sessionId,
      actorId: g.user.id,
      session: {
        title: session?.title ?? null,
        sport: session?.sport ?? null,
        creatorName: (host as { name?: string } | null)?.name ?? null,
      },
    });
    return NextResponse.json(await deliverSessionMoments(g.service, sessionId, notify), { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.deliver', sessionId });
    return fail(500, 'deliver_failed');
  }
}

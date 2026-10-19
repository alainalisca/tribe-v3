import { NextResponse } from 'next/server';
import { guardMomentsManager, PRIVATE, fail } from '@/lib/moments/routeGuard';
import { checkInvite, createInvite } from '@/lib/moments/invites';
import { logError } from '@/lib/logger';

/** POST /api/moments/<session>/invites/ (T-MOM1): "Alguien que no está en Tribe": a name and an optional WhatsApp. */
export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const g = await guardMomentsManager(sessionId);
  if (!g.ok) return g.res;
  const raw = (await req.json().catch(() => null)) as { name?: unknown; phone?: unknown } | null;
  const check = checkInvite({
    name: typeof raw?.name === 'string' ? raw.name : '',
    phone: typeof raw?.phone === 'string' ? raw.phone : null,
  });
  if (!check.ok) return fail(400, check.error);
  try {
    const invite = await createInvite(g.service, {
      sessionId,
      name: check.name,
      phone: check.phone,
      createdBy: g.user.id,
    });
    return NextResponse.json(
      { kind: 'invite', id: invite?.id, name: invite?.display_name, hasPhone: !!invite?.phone, claimed: false },
      { status: 201, headers: PRIVATE }
    );
  } catch (error) {
    logError(error, { action: 'moments.invite', sessionId });
    return fail(500, 'invite_failed');
  }
}

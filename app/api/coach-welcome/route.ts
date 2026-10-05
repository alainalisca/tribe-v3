/**
 * POST /api/coach-welcome (T-AV33, P1-6): called by joinSession after a
 * confirmed join, fire-and-forget, to send the coach's welcome note.
 *
 * THE CALLER CHOOSES NOTHING BUT THE SESSION. Whether anyone is welcomed is
 * av_claim_welcome_for_join's decision (migration 8005), made with the
 * caller's own session: the join must be confirmed, it must be the person's
 * first relationship with the coach, never the coach, once ever, and the push
 * only within the shared T-AV cap. Calling this twice, early, or for a session
 * the caller did not join welcomes nobody.
 *
 * ORDER: the flag (404 when off), the session, the body, the claim, delivery.
 * The response never says whether anyone was welcomed.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { athleteValueOr404 } from '@/lib/features/athleteValueServer';
import { claimWelcomeForJoin } from '@/lib/dal/coachWelcome';
import { deliverWelcome, WELCOME_FEATURE } from '@/lib/coachContact/welcomeDelivery';
import { logError } from '@/lib/logger';

const PRIVATE = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const off = await athleteValueOr404(WELCOME_FEATURE);
  if (off) return off;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE });

    let body: { sessionId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: PRIVATE });
    }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (!UUID.test(sessionId)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: PRIVATE });

    const claimed = await claimWelcomeForJoin(supabase, sessionId);
    if (claimed.success) await deliverWelcome(claimed.data ?? [], new URL(request.url).origin);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (error: unknown) {
    logError(error, { route: '/api/coach-welcome', action: 'POST' });
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
  }
}

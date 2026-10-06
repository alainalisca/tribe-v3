/**
 * POST /api/atletas/notify (T-AV27b): called by the door after a confirm or a
 * "joined", to tell the referring athlete (and, when an arrival makes a
 * captain ready, the gym owner).
 *
 * THE CALLER CHOOSES NOTHING BUT THE PASS AND THE EVENT. Whether anyone is
 * told is av_athletes_claim_notification's decision (210), made with the
 * caller's own session: the caller must work that door, the event must have
 * happened, the guest must be credited, each event goes once, and the push
 * respects the cap. So calling this twice, early, or for another gym's pass
 * notifies nobody. The browser calls it fire-and-forget; a failure here never
 * undoes the confirm.
 *
 * ORDER: the flag (404 when off), the session, the body, the claim, delivery.
 * The response says only whether the request was accepted, never who was told.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { athleteValueOr404 } from '@/lib/features/athleteValueServer';
import { claimDoorNotifications } from '@/lib/dal/athleteNotify';
import { deliverNotifications } from '@/lib/atletas/athleteNotifications';
import { logError } from '@/lib/logger';

const PRIVATE = { 'Cache-Control': 'private, no-store' };
const PASS_CODE = /^[A-Z]{2}-[A-Z2-9]{4}$/;
const DOOR_EVENTS = ['arrived', 'joined'] as const;
type DoorEvent = (typeof DOOR_EVENTS)[number];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const off = await athleteValueOr404('athletes');
  if (off) return off;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE });

    let body: { passCode?: unknown; event?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: PRIVATE });
    }
    const passCode = typeof body.passCode === 'string' ? body.passCode.trim().toUpperCase() : '';
    const event = body.event as DoorEvent;
    if (!PASS_CODE.test(passCode) || !DOOR_EVENTS.includes(event)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400, headers: PRIVATE });
    }

    const claimed = await claimDoorNotifications(supabase, passCode, event);
    // not_found and not_happened are the same quiet answer: nothing to tell.
    if (!claimed.success) return NextResponse.json({ ok: true }, { headers: PRIVATE });

    await deliverNotifications(supabase, claimed.data ?? [], {
      actorId: user.id,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (error: unknown) {
    logError(error, { route: '/api/atletas/notify', action: 'POST' });
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
  }
}

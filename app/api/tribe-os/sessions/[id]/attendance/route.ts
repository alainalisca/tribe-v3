/**
 * /api/tribe-os/sessions/[id]/attendance
 *   GET — attendance for one session, scoped to the caller's clients
 *
 * Used by the "mark attendance from session detail" UI in Mission 6.
 * The instructor-side view: shows which of MY clients I've already
 * marked attendance for at this session. RLS on client_attendance
 * (joined through clients) does the scoping; the route just tags
 * the userId so cache keys can be (session, instructor) later.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listAttendanceForSession } from '@/lib/dal/clients';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId } = gate;

  try {
    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'session_id_required' }, { status: 400 });
    }

    const result = await listAttendanceForSession(supabase, sessionId, userId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'list_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/sessions/[id]/attendance' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

/**
 * GET /api/tribe-os/revenue/unpaid
 *
 * Returns one row per client with at least one unpaid (attended,
 * !paid) attendance in the look-back window. Powers the
 * /os/revenue/unpaid surface where coaches can fire WhatsApp
 * payment reminders.
 *
 * Auth:
 *   - Tribe.OS premium gate
 *   - RLS scopes attendance reads to the caller's clients
 *
 * Query params:
 *   - window_days  optional, integer (1–365), defaults to 60
 *
 * Response: { success: true, data: { groups: UnpaidClientGroup[] } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listUnpaidAttendance } from '@/lib/dal/clients';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const url = new URL(request.url);
    const windowParam = url.searchParams.get('window_days');
    const parsed = windowParam ? Number.parseInt(windowParam, 10) : undefined;
    const windowDays = Number.isFinite(parsed) && parsed! > 0 && parsed! <= 365 ? parsed : undefined;

    const result = await listUnpaidAttendance(supabase, { windowDays });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { groups: result.data ?? [] },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/revenue/unpaid' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

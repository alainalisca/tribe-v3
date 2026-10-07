/**
 * GET /api/atletas/home-card (T-AV24): should the Home entry card show.
 *
 * Al, 2026-09-30: the Home card shows only when the athletes flag is on AND
 * the signed-in user has an ACTIVE program_athletes row. The Profile card
 * needs only the flag (so a non-athlete can still reach the not-in-program
 * page) and uses /api/features/athlete-value.
 *
 * Returns { active: boolean } and NOTHING ELSE: not the program, not the gym,
 * not the level. route.test.ts pins the exact body. Flag off is the program's
 * ordinary 404 (hard line 8). Signed out answers { active: false }; middleware
 * already requires a session for /api routes not on its public list.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { athleteValueOr404 } from '@/lib/features/athleteValueServer';
import { hasActiveAthleteRow } from '@/lib/dal/athleteHome';
import { logError } from '@/lib/logger';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

export async function GET(): Promise<NextResponse> {
  const off = await athleteValueOr404('athletes');
  if (off) return off;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const active = user ? await hasActiveAthleteRow(supabase, user.id) : false;
    return NextResponse.json({ active }, { headers: PRIVATE });
  } catch (error: unknown) {
    logError(error, { route: '/api/atletas/home-card', action: 'GET' });
    // Fail closed: an error is not a reason to show the card.
    return NextResponse.json({ active: false }, { headers: PRIVATE });
  }
}

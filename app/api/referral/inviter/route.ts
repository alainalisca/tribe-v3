/**
 * GET /api/referral/inviter?code=TRIBE-XXXXX  ->  { firstName: string | null }
 *
 * PUBLIC ON PURPOSE (no auth check). The caller is the signed-out visitor on
 * /auth/?ref=CODE, whom the banner greets with "Invitado por {firstName}".
 * Requiring a session would reproduce the bug this replaces: the browser
 * lookup it supersedes failed because `anon` cannot read public.referrals.
 *
 * What keeps that safe:
 *  - the response is one first name, or null (lib/dal/referralInviter.ts);
 *  - malformed codes are refused before any query;
 *  - "no such code" and "owner has no usable name" answer identically, so the
 *    route cannot be used to enumerate which codes exist;
 *  - 30 lookups per IP per minute (lib/rate-limit, fails open by design).
 */
import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { lookupInviterFirstName } from '@/lib/dal/referralInviter';

const LIMIT = 30;
const WINDOW_MS = 60_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = (request.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase();
  if (!code || code.length > 20) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  try {
    const admin = getServiceRoleClient();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = await checkRateLimit(admin, `referral-inviter:${ip}`, LIMIT, WINDOW_MS);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const result = await lookupInviterFirstName(admin, code);
    if (!result.success) {
      logError(new Error(result.error), { action: 'api.referral.inviter' });
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    return NextResponse.json(
      { firstName: result.data ?? null },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    );
  } catch (error) {
    logError(error, { action: 'api.referral.inviter' });
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}

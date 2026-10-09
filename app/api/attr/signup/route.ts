/**
 * POST /api/attr/signup/ -- T-GROW1 part C. Record how a new account arrived.
 *
 * @auth Required. The signed-in user's own row only; the user id comes from the
 *       session cookie and never from the body, so there is nothing to IDOR.
 * @body { first: Attribution | null, last: Attribution | null }, the two
 *       touches lib/attribution.ts keeps in localStorage.
 * @returns 200 { status: 'recorded' | 'already' | 'too_old' | 'none' }.
 *       401 signed out, 400 bad body, 429 rate limited, 500 a failed write.
 *
 * Called by lib/signupAttributionClient.ts after EVERY completed sign-in; this
 * route decides whether the account is new enough to credit (see
 * lib/signupAttribution.ts for the three rules). Covered by data policy v1.1.
 *
 * Public at the middleware layer only because /api/attr is, by prefix: the
 * visit beacon must accept signed-out traffic. This route does its own auth
 * below, and middleware.publicPaths.test.ts pins that it is reachable rather
 * than redirected to /auth.
 *
 * Writes through the service role because migration 214's trigger refuses every
 * signup_* write while auth.uid() is set. See lib/dal/signupAttribution.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { sanitizeAttributionObject } from '@/lib/attribution';
import { decideSignupAttribution, SIGNUP_WINDOW_MS } from '@/lib/signupAttribution';
import { fetchUserCreatedAt, recordSignupAttribution } from '@/lib/dal/signupAttribution';

/** A sign-in completes once per page load; ten a minute is a loop, not a person. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceRoleClient();
    const { allowed } = await checkRateLimit(admin, `attr-signup:${user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    const raw = body as Record<string, unknown>;

    // The same revalidation /api/pase applies to first_touch: every field through
    // the shared sanitizers, and OAuth rules A, B and C, so a callback-shaped
    // touch or a UUID-shaped "code" is refused here whatever the client sent.
    const first = sanitizeAttributionObject(raw.first);
    const last = sanitizeAttributionObject(raw.last);

    const created = await fetchUserCreatedAt(admin, user.id);
    if (!created.success) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    // No public.users row: handle_new_user swallows its own errors, so this can
    // happen. Nothing to attach attribution to, and not this route's to create.
    if (created.data === null || created.data === undefined) return NextResponse.json({ status: 'none' });

    const now = Date.now();
    const decision = decideSignupAttribution(first, last, created.data, now);
    if (decision.kind !== 'write') return NextResponse.json({ status: decision.kind });

    const result = await recordSignupAttribution(
      admin,
      user.id,
      decision.fields,
      new Date(now - SIGNUP_WINDOW_MS).toISOString()
    );
    if (!result.success) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    return NextResponse.json({ status: result.data });
  } catch (error) {
    logError(error, { route: '/api/attr/signup', action: 'POST' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

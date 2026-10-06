/**
 * T-AV0, Step 6. Server-side entry points for the `athlete_value` flag.
 *
 * Split from lib/features/athleteValue.ts so the decision logic stays
 * importable by a unit test without pulling in next/headers -- importing
 * `cookies()` into a test environment is how a pure function stops being
 * testable. Everything here is the wiring: get the user, get a client, ask.
 *
 * Two shapes, because a page and an API route fail differently:
 *
 *   requireAthleteValuePage()  -> calls notFound(); the page renders the
 *                                 app's normal 404, indistinguishable from a
 *                                 route that was never built
 *   athleteValueOr404()        -> returns a 404 NextResponse, or null when the
 *                                 caller may proceed
 *
 * Both return 404 rather than 403. A 403 says "this exists and you may not
 * have it", which tells a stranger the surface is there and invites a second
 * look; a 404 says nothing at all. Rule 6 of T-AV0's hard line asks for the
 * normal 404 in those words.
 */
import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAthleteValueEnabled } from './athleteValue';

/**
 * Resolve the flag for whoever is making the current request.
 *
 * A signed-out visitor is `userId: null`, which the allowlist can never match
 * and the admin RPC answers false for -- so logged out is off unless the mode
 * is literally `all`.
 */
export async function athleteValueEnabledForRequest(feature: string | null = null): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAthleteValueEnabled(user?.id ?? null, supabase, { feature });
}

/** For server components. Throws Next's not-found when the flag is off. */
export async function requireAthleteValuePage(feature: string | null = null): Promise<void> {
  if (!(await athleteValueEnabledForRequest(feature))) notFound();
}

/** For route handlers. Returns a 404 response, or null to proceed. */
export async function athleteValueOr404(feature: string | null = null): Promise<NextResponse | null> {
  if (await athleteValueEnabledForRequest(feature)) return null;
  return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
}

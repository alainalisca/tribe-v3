/**
 * GET /api/features/athlete-value
 *
 * T-AV0, Step 6. The one place a CLIENT component may ask whether the
 * athlete-value flag is on for the person using the app.
 *
 * Why an endpoint instead of a NEXT_PUBLIC_ variable: a NEXT_PUBLIC_ value is
 * inlined into the JavaScript bundle, so the "decision" ships to the browser
 * and anyone can edit it. This runs the same resolver the pages and routes
 * use, on the server, against the caller's own session.
 *
 * Response (always 200 -- "is this on for me" is not a secret; what is behind
 * the flag is what is protected, and that is protected by the flag itself):
 *
 *   { enabled: boolean, features: string[] | null }
 *
 * `features` mirrors ATHLETE_VALUE_FEATURES so a client can ask about one
 * surface without a request per surface. It is null when every feature is on.
 * `?feature=pase` narrows `enabled` to that one feature.
 *
 * It deliberately does NOT report the mode, the allowlist or who the caller
 * is. Those answer "how was this decided", which is an operator's question,
 * not the browser's.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { isAthleteValueEnabled, readAthleteValueConfig } from '@/lib/features/athleteValue';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const feature = new URL(request.url).searchParams.get('feature');
    const enabled = await isAthleteValueEnabled(user?.id ?? null, supabase, { feature });

    return NextResponse.json(
      { enabled, features: readAthleteValueConfig().features },
      // The answer depends on the caller's cookies. Caching it shared would
      // hand one person's answer to the next visitor, which for a flag means
      // handing them a surface that is off for them.
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logError(error, { route: 'api/features/athlete-value' });
    // Fail CLOSED. An error resolving the flag is not a reason to show an
    // unreleased surface -- the whole point of the gate is that the default
    // answer is no.
    return NextResponse.json({ enabled: false, features: null }, { status: 200 });
  }
}

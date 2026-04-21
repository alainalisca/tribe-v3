/**
 * GET /api/health — lightweight liveness + database reachability probe.
 *
 * LR-02 (Launch Readiness). Purpose:
 *   - UptimeRobot hits this every 5 minutes to detect outages.
 *   - On-call uses it as a one-click sanity check during an incident.
 *   - Vercel edge cache must NEVER hold this response — see
 *     `dynamic = 'force-dynamic'` below.
 *
 * Contract:
 *   200 { status: 'ok',       db: 'ok',   ts }
 *   503 { status: 'degraded', db: 'down', ts }
 *
 * The probe runs a cheap indexed query (`users.select('id').limit(1)`) with
 * an explicit 3-second timeout. No sensitive data is read; no env vars are
 * leaked in the response body — keep the surface tight so it can stay
 * publicly accessible without auth.
 *
 * Public-path configuration: the middleware allowlists `/api/health` via
 * publicApiPaths, so the Supabase auth gate is skipped for this route
 * (monitoring services don't carry session cookies).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Never cache: a cached 200 would mask an outage. Also ensures UptimeRobot
// sees a real per-request probe rather than edge cache.
export const dynamic = 'force-dynamic';

const DB_PROBE_TIMEOUT_MS = 3000;

/** Minimal no-cache headers — defense-in-depth beyond force-dynamic. */
const noCacheHeaders = {
  'Cache-Control': 'no-store, max-age=0',
};

function degradedResponse(ts: string) {
  return NextResponse.json({ status: 'degraded', db: 'down', ts }, { status: 503, headers: noCacheHeaders });
}

export async function GET() {
  const ts = new Date().toISOString();

  try {
    const supabase = await createClient();

    // Race the probe against a timeout. If the DB hangs, we bail out rather
    // than block UptimeRobot's request slot indefinitely.
    const probe = supabase.from('users').select('id').limit(1).maybeSingle();
    const timeout = new Promise<{ error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'probe_timeout' } }), DB_PROBE_TIMEOUT_MS)
    );

    const result = (await Promise.race([probe, timeout])) as { error: { message: string } | null };

    if (result.error) {
      return degradedResponse(ts);
    }

    return NextResponse.json({ status: 'ok', db: 'ok', ts }, { status: 200, headers: noCacheHeaders });
  } catch {
    // Fail closed: any exception → degraded. We deliberately don't echo
    // the error message back to the client to avoid leaking internals.
    return degradedResponse(ts);
  }
}

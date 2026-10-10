/**
 * POST /api/attr
 *
 * T-GROW1 part D. Records that somebody arrived through a tagged link, so the
 * Origen tab has a DENOMINATOR. pass_leads can say where the people who left
 * their number came from; it cannot say how many saw the thing and did not, and
 * those two cases are indistinguishable in the leads table -- both are an absence
 * of rows.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS ROUTE HAS NO AUTH, WHICH IS A DECISION AND NOT AN OMISSION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * api-route-security requires auth on every route and names the exceptions:
 * cron, webhooks, and "truly public data routes, documented with a comment".
 * This is the third kind, and the reason is structural rather than convenient:
 * the event being recorded is a STRANGER ARRIVING. Nobody has an account yet.
 * Most of these requests are the first HTTP call a person ever makes to Tribe,
 * from a QR code on a poster in a gym. Requiring a session would restrict the log
 * to people who already signed up, which is the opposite population from the one
 * the measurement is about.
 *
 * It is modelled on /api/pase and /api/tribe-os-waitlist, the repo's two other
 * unauthenticated POSTs, and carries the same defences minus the ones that do not
 * apply:
 *
 *   RATE LIMIT        10 per minute per IP, the spec's number.
 *   SERVICE ROLE      attribution_events is unreachable by anon and authenticated
 *                     alike (213: RLS on, zero policies, no grants), so there is
 *                     no client insert path to forge rows through at all. This is
 *                     narrower than pass_leads, which had to grant anon INSERT.
 *   STRICT SANITISING Every field goes through lib/attribution's sanitizers, the
 *                     same ones the capture library and /api/pase use. A bad tag
 *                     becomes NULL; it never rejects the request.
 *   NO HONEYPOT, NO TIMING CHECK. /api/pase has both because it is a FORM and a
 *                     bot filling it costs a real person's attention. There is no
 *                     form here and nothing downstream reads a human. The rate
 *                     limit and the once-per-session index are the whole defence,
 *                     and they bound the only thing a bot could achieve: an
 *                     inflated visit count.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT DELIBERATELY DOES NOT STORE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * No user id, no IP, no user agent. The T-GROW0 privacy gate found that the
 * published Politica de tratamiento de datos v1.0 covers campaign MEASUREMENT and
 * does not cover recording how a person arrived against their ACCOUNT, so joining
 * a visit to an identity waits for v1.1 along with spec part C. The IP exists for
 * ten minutes inside public.rate_limits and nowhere else; a permanent column
 * would turn a counter into a location history. See migration 213's header.
 *
 * 2026-10-09: policy v1.1 now covers recording arrival on an account, and
 * T-GROW1 part C does that on the users row (signup_* columns, migration 214,
 * written by /api/attr/signup). THIS ROUTE IS UNCHANGED BY IT: a visit row
 * still holds no user id, and nothing joins it to one. v1.1 permits recording
 * how a person arrived; it does not oblige turning the visit log into a
 * per-person history, and that line is still held here on purpose.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT ANSWERS 204 AND THE CALLER IGNORES IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The browser sends this with `keepalive` during a navigation and never reads the
 * response. 204 with no body is the honest shape for that: there is nothing a
 * caller could do with a payload, and a body would be a place for this route to
 * start leaking what it knows. A deduplicated visit answers 204 as well -- the
 * once-per-session index refusing a second row is the index working, not an
 * error, and the client has nothing to retry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import {
  sanitizeTag,
  sanitizeLandingPath,
  isTagged,
  isCapturablePath,
  isAuthPath,
  type Attribution,
} from '@/lib/attribution';
import { insertAttributionEvent, isAttrEventType } from '@/lib/dal/attributionEvents';

/** The spec's number: 10 per minute per IP. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Matches attribution_events_session_key_check exactly. */
const SESSION_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * One shape of 400, saying nothing about which rule fired.
 *
 * The split /api/pase makes -- a named field for a validation failure, one flat
 * message for a bot check -- exists because a HUMAN is looking at that form and
 * can only fix what they are told. Nobody reads this response, so there is
 * nothing to be helpful to, and naming the rule would only tell a script what to
 * change.
 */
function badRequest(): NextResponse {
  return NextResponse.json({ error: 'invalid' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const admin = getServiceRoleClient();

    const { allowed } = await checkRateLimit(admin, `attr:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    // 429 with no body. The client does not retry and must not be encouraged to.
    if (!allowed) return new NextResponse(null, { status: 429 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest();
    }
    const raw = body as Record<string, unknown>;

    // event_type is a CLOSED VOCABULARY and is validated rather than sanitized,
    // because unlike a tag it is not visitor-supplied data that might have a typo
    // in it -- our own code chooses it from three values. A value outside them did
    // not come from this app, and attribution_events_event_type_check would refuse
    // it anyway; failing here keeps a pointless round trip off the database.
    if (!isAttrEventType(raw.event_type)) return badRequest();

    // Likewise the session key: minted by getSessionKey() three lines before it is
    // sent, so a malformed one is a bug in our code, not a visitor's mistake.
    // Migration 213 pins this charset for the same reason.
    const sessionKey = typeof raw.session_key === 'string' ? raw.session_key : '';
    if (!SESSION_KEY_RE.test(sessionKey)) return badRequest();

    /**
     * RULE A, SERVER SIDE: the OAuth callback is never a visit.
     *
     * The client no longer posts one, but the client is not the authority on this
     * route -- it is an unauthenticated POST and the body is whatever the sender
     * chose. Refused with 400 rather than stripped, because a visit event whose
     * landing page is an auth callback is not a visit with a bad field, it is not
     * a visit.
     *
     * This is what reached production on 2026-10-08: a visit row with
     * code=FF275D19-... and landing_path=/auth/callback/, where the code was a
     * redeemed Google PKCE authorization code.
     */
    const landingPath = sanitizeLandingPath(raw.landing_path);
    if (!isCapturablePath(landingPath)) return badRequest();

    // The tags, through the SHARED sanitizers. Not a second copy: lib/attribution
    // owns the charset, the casing and the 40, and migrations 211 and 213 bound the
    // columns at that same 40. lib/attribution.limits.test.ts fails if they drift.
    //
    // RULE B: `code` is dropped on any auth route. `ref` is not -- /auth/?ref=CODE
    // is a printed link shape and making it sticky is T-GROW2's whole premise.
    const onAuth = isAuthPath(landingPath);
    const attribution: Attribution = {
      src: sanitizeTag(raw.src, 'src'),
      code: onAuth ? null : sanitizeTag(raw.code, 'code'),
      ref: sanitizeTag(raw.ref, 'ref'),
      utm_source: sanitizeTag(raw.utm_source, 'utm_source'),
      utm_medium: sanitizeTag(raw.utm_medium, 'utm_medium'),
      utm_campaign: sanitizeTag(raw.utm_campaign, 'utm_campaign'),
      utm_content: sanitizeTag(raw.utm_content, 'utm_content'),
      landing_path: landingPath,
      ts: Date.now(),
    };

    // AN UNTAGGED EVENT IS REFUSED, and this is the one validation worth arguing
    // for. Without it the client could log every navigation and this table would
    // become a pageview log -- so the visits column would stop meaning "people who
    // arrived through this channel" and start meaning "screens opened", which is a
    // denominator nobody can divide by. PostHog already counts pageviews.
    if (!isTagged(attribution)) return badRequest();

    const result = await insertAttributionEvent(admin, {
      event_type: raw.event_type,
      session_key: sessionKey,
      attribution,
    });

    // A real failure is logged by the DAL and still answers 204. Nothing the
    // caller can do about it, and a 500 here would be a visible error on a
    // stranger's first page load over a row that only feeds a report.
    if (!result.success) return new NextResponse(null, { status: 204 });

    // 'inserted' and 'duplicate' both answer 204. The second is the
    // once-per-session index doing its job on a reload or a double-fired effect.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logError(error, { route: '/api/attr', action: 'POST' });
    // Still 204. This route is a beacon; an exception in it must never be a thing
    // a visitor can see, and there is no payload for them to act on.
    return new NextResponse(null, { status: 204 });
  }
}

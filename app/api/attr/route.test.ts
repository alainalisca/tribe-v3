import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * POST /api/attr (T-GROW1 part D).
 *
 * WHAT IS WORTH TESTING HERE, which is narrower than it looks. The route has one
 * job and three ways to get it wrong, and only the third is interesting:
 *
 *   1. it writes the event                       -- cheap, covered first
 *   2. it refuses what the table would refuse    -- cheap, covered
 *   3. IT NEVER LETS A FAILURE REACH THE VISITOR, and never counts a visit it
 *      should not. The denominator of every conversion number in T-GROW comes
 *      out of this table, so a route that over-reports is worse than one that
 *      under-reports: an inflated visit count makes a working channel look like
 *      a failing one, and nobody can tell from the outside.
 *
 * So the arms with real weight are the untagged refusal, the duplicate, and the
 * DAL-failure and exception cases that must still answer 204.
 *
 * Every arm asserts the OUTCOME and not only the attempt. CLAUDE.md records
 * thirty tests passing over an email leg that always returned 'failed', because
 * they asserted `send()` was called and never what it returned.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/dal/attributionEvents', async (importOriginal) => {
  // The real isAttrEventType is kept: it IS the vocabulary check, and mocking it
  // would make every validation arm below assert against a stub of the thing
  // under test.
  const actual = await importOriginal<typeof import('@/lib/dal/attributionEvents')>();
  return { ...actual, insertAttributionEvent: vi.fn() };
});

import { POST } from './route';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { insertAttributionEvent } from '@/lib/dal/attributionEvents';
import { logError } from '@/lib/logger';

const SESSION = 'abcdef0123456789abcdef0123456789';

function request(payload: unknown): NextRequest {
  return new NextRequest('https://tribe-v3.vercel.app/api/attr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

const VISIT = {
  event_type: 'visit',
  session_key: SESSION,
  src: 'runclub',
  code: 'RUNCLUB-SAT0927',
  ref: 'A7K2QX',
  utm_source: 'instagram',
  utm_medium: 'social',
  utm_campaign: 'hyrox-oct',
  utm_content: 'reel-01',
  landing_path: '/pase/bullbox/',
};

/** The argument the route handed the DAL. */
function sent() {
  return vi.mocked(insertAttributionEvent).mock.calls[0][1];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
  vi.mocked(insertAttributionEvent).mockResolvedValue({ success: true, data: 'inserted' });
});

describe('POST /api/attr', () => {
  it('records a tagged visit and answers 204 with no body', async () => {
    const res = await POST(request(VISIT));
    expect(res.status).toBe(204);
    // 204 means no body by definition, and the browser never reads one. A payload
    // here would be a place for this route to start leaking what it knows.
    expect(await res.text()).toBe('');

    expect(insertAttributionEvent).toHaveBeenCalledTimes(1);
    const arg = sent();
    expect(arg.event_type).toBe('visit');
    expect(arg.session_key).toBe(SESSION);
    expect(arg.attribution.src).toBe('runclub');
    expect(arg.attribution.ref).toBe('A7K2QX');
    expect(arg.attribution.utm_campaign).toBe('hyrox-oct');
    expect(arg.attribution.landing_path).toBe('/pase/bullbox/');
  });

  it('normalises casing the same way the lead path does', async () => {
    await POST(request({ ...VISIT, src: 'RunClub', code: 'runclub-sat0927', utm_source: 'Instagram' }));
    const a = sent().attribution;
    // One channel must be one row in the Origen table whichever way the link was
    // typed, and the visits and the leads have to normalise IDENTICALLY or the
    // two halves of a conversion rate are computed over different keys.
    expect(a.src).toBe('runclub');
    expect(a.utm_source).toBe('instagram');
    expect(a.code).toBe('RUNCLUB-SAT0927');
  });

  it('accepts the other two event types', async () => {
    for (const event_type of ['pass_view', 'share_click']) {
      vi.clearAllMocks();
      vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
      vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
      vi.mocked(insertAttributionEvent).mockResolvedValue({ success: true, data: 'inserted' });
      const res = await POST(request({ ...VISIT, event_type }));
      expect(res.status, event_type).toBe(204);
      expect(sent().event_type, event_type).toBe(event_type);
    }
  });

  it('REFUSES an untagged event, which is what keeps this from becoming a pageview log', async () => {
    const res = await POST(request({ event_type: 'visit', session_key: SESSION, landing_path: '/feed' }));
    // THE ARM WITH THE MOST WEIGHT IN THIS FILE. Without it the client could log
    // every navigation, and the visits column would stop meaning "people who
    // arrived through this channel" and start meaning "screens opened" -- a
    // denominator nobody can divide by. PostHog already counts pageviews.
    expect(res.status).toBe(400);
    expect(insertAttributionEvent).not.toHaveBeenCalled();
  });

  it('refuses an event_type outside the three the CHECK admits', async () => {
    for (const event_type of ['click', 'VISIT', '', null, 42, 'visit; drop table']) {
      vi.clearAllMocks();
      vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
      vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
      const res = await POST(request({ ...VISIT, event_type }));
      expect(res.status, String(event_type)).toBe(400);
      expect(insertAttributionEvent).not.toHaveBeenCalled();
    }
  });

  it('refuses a session key the table CHECK would refuse', async () => {
    for (const session_key of ['short', 'a'.repeat(65), 'has space!', '', null, 'tabs\there']) {
      vi.clearAllMocks();
      vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
      vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
      const res = await POST(request({ ...VISIT, session_key }));
      // Refused HERE rather than at the database, because this value is minted by
      // our own getSessionKey() three lines before it is sent: a malformed one is
      // a bug in our code, not a visitor's typo, and there is nothing to lose by
      // refusing it. The regex is the same one migration 213 pins.
      expect(res.status, String(session_key)).toBe(400);
      expect(insertAttributionEvent).not.toHaveBeenCalled();
    }
  });

  it('drops a malformed tag to null without refusing the event', async () => {
    const res = await POST(request({ ...VISIT, src: 'run club', utm_campaign: 'x'.repeat(41) }));
    // Unlike the session key, a tag comes off a printed poster, so the soft
    // failure is right here for the same reason it is right on the lead path.
    expect(res.status).toBe(204);
    const a = sent().attribution;
    expect(a.src).toBeNull();
    expect(a.utm_campaign).toBeNull();
    expect(a.code).toBe('RUNCLUB-SAT0927');
  });

  it('answers 429 with no body when rate limited, and writes nothing', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await POST(request(VISIT));
    expect(res.status).toBe(429);
    expect(await res.text()).toBe('');
    expect(insertAttributionEvent).not.toHaveBeenCalled();
  });

  it('rate limits on its own namespace, 10 per minute per IP', async () => {
    await POST(request(VISIT));
    // The namespace prefix is mandatory, or this endpoint shares a bucket with
    // /api/pase and five pass submissions would silence the visit log.
    expect(checkRateLimit).toHaveBeenCalledWith({}, 'attr:1.2.3.4', 10, 60_000);
  });

  it('answers 400 on a body that is not JSON', async () => {
    const res = await POST(request('{not json'));
    expect(res.status).toBe(400);
    expect(insertAttributionEvent).not.toHaveBeenCalled();
  });

  it('answers 204 on a DUPLICATE, because the once-per-session index is working', async () => {
    vi.mocked(insertAttributionEvent).mockResolvedValue({ success: true, data: 'duplicate' });
    const res = await POST(request(VISIT));
    // A reload, a double-fired effect or a retried keepalive beacon all land here.
    // Treating it as an error would put a log line and a non-2xx on the most
    // normal thing a browser does.
    expect(res.status).toBe(204);
  });

  it('answers 204 when the insert genuinely fails, and does not surface it', async () => {
    vi.mocked(insertAttributionEvent).mockResolvedValue({ success: false, error: 'boom' });
    const res = await POST(request(VISIT));
    // The row only feeds a report. A 500 on a stranger's first page load, over a
    // request they never see the answer to, buys nothing and costs a console
    // error on the page where a free class is being claimed.
    expect(res.status).toBe(204);
  });

  it('answers 204 and LOGS when something throws, rather than dying quietly', async () => {
    vi.mocked(checkRateLimit).mockRejectedValue(new Error('rate limit table is gone'));
    const res = await POST(request(VISIT));
    expect(res.status).toBe(204);
    // The RECOGNITION, not only the outcome. CLAUDE.md records a test that
    // asserted a tier-1 fallback and passed with the error branch deleted,
    // because the outer catch produced the same value: correct handling and no
    // handling looked identical. Asserting logError was called with the original
    // reason is what tells them apart.
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'rate limit table is gone' }),
      expect.objectContaining({ route: '/api/attr' })
    );
  });

  it('never sends a user id, an ip or a user agent to the DAL', async () => {
    await POST(request({ ...VISIT, user_id: 'sneaky', ip: '9.9.9.9', user_agent: 'curl' }));
    const arg = sent() as unknown as Record<string, unknown>;
    // The privacy line from migration 213's header, asserted rather than trusted
    // to the absence of code. A client cannot add a column by sending one, and
    // the payload is built from a named list rather than spread from the body.
    expect(Object.keys(arg).sort()).toEqual(['attribution', 'event_type', 'session_key']);
    expect(JSON.stringify(arg)).not.toContain('sneaky');
    expect(JSON.stringify(arg)).not.toContain('9.9.9.9');
    expect(JSON.stringify(arg)).not.toContain('curl');
  });
});

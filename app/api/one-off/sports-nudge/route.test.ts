/**
 * The one-off sports nudge: 28 real people, so the properties that matter are
 * "does not send" ones.
 *
 * Every case here is about restraint -- default to not sending, never send
 * twice, honour a preference, honour an opt-out. A campaign route's happy path
 * is the easy half; the half that can hurt somebody is the other one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: vi.fn(() => true) }));
vi.mock('@/lib/dal/notificationPreferences', () => ({ shouldSendNotification: vi.fn(async () => true) }));
vi.mock('@/lib/dal/oneOffSends', () => ({
  claimOneOffSend: vi.fn(async () => ({ success: true, data: { claimed: true, unsubToken: null } })),
  recordOneOffOutcome: vi.fn(async () => ({ success: true, data: null })),
  releaseOneOffClaim: vi.fn(async () => ({ success: true, data: null })),
}));
vi.mock('@/lib/dal/emailUnsubscribe', async () => ({
  isEmailSuppressed: vi.fn(async () => false),
  unsubUrlFor: vi.fn(async () => ({ success: true, data: 'https://x/api/unsubscribe?token=tok' })),
  // The REAL header builder: mocking it would test the mock's idea of RFC 8058
  // rather than the headers that actually go out.
  unsubHeaders: (await vi.importActual<typeof import('@/lib/dal/emailUnsubscribe')>('@/lib/dal/emailUnsubscribe'))
    .unsubHeaders,
}));

let audience: Array<Record<string, unknown>> = [];
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'is', 'not']) q[m] = () => q;
      q.or = () => Promise.resolve({ data: audience, error: null });
      return q;
    },
  }),
}));

import { POST } from './route';
import { isValidCronAuth } from '@/lib/auth/cron';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { claimOneOffSend, releaseOneOffClaim } from '@/lib/dal/oneOffSends';
import { isEmailSuppressed, unsubUrlFor } from '@/lib/dal/emailUnsubscribe';

const ATHLETE = { id: 'u1', name: 'Ana', email: 'a@b.co', fcm_token: 'tok-1', preferred_language: 'es' };

function req(body?: unknown) {
  return new Request('https://x/api/one-off/sports-nudge', {
    method: 'POST',
    headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  audience = [ATHLETE];
  process.env.RESEND_API_KEY = 'test-key';
  process.env.CRON_SECRET = 'test-secret';
  vi.mocked(isValidCronAuth).mockReturnValue(true);
  vi.mocked(shouldSendNotification).mockResolvedValue(true);
  vi.mocked(isEmailSuppressed).mockResolvedValue(false);
  vi.mocked(claimOneOffSend).mockResolvedValue({ success: true, data: { claimed: true, unsubToken: null } });
  vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: 'https://x/api/unsubscribe?token=tok' });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
});

describe('it refuses to send unless told to', () => {
  /** NON-VACUITY: an empty audience satisfies every "did not send" case. */
  it('the audience query actually returns somebody', async () => {
    const res = await POST(req({ dryRun: false }));
    expect((await res.json()).audience).toBe(1);
    expect(send).toHaveBeenCalledOnce();
  });

  it('NO BODY is a dry run', async () => {
    const body = await (await POST(req())).json();
    expect(body.dryRun).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('an EMPTY body is a dry run', async () => {
    expect((await (await POST(req({}))).json()).dryRun).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('dryRun:true is a dry run', async () => {
    await POST(req({ dryRun: true }));
    expect(send).not.toHaveBeenCalled();
  });

  it('only an explicit dryRun:false sends', async () => {
    await POST(req({ dryRun: false }));
    expect(send).toHaveBeenCalledOnce();
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('a dry run RELEASES its claims, so the real run is not consumed', async () => {
    // A rehearsal that keeps its claims makes the real send skip everybody,
    // which looks identical to a campaign that already ran.
    await POST(req({ dryRun: true }));
    expect(releaseOneOffClaim).toHaveBeenCalledTimes(2); // push + email
  });

  it('a bad secret sends nothing and reads nothing', async () => {
    vi.mocked(isValidCronAuth).mockReturnValue(false);
    expect((await POST(req({ dryRun: false }))).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
    expect(claimOneOffSend).not.toHaveBeenCalled();
  });
});

describe('it sends to each person at most once', () => {
  it('an already-claimed person is skipped on both channels', async () => {
    vi.mocked(claimOneOffSend).mockResolvedValue({ success: true, data: { claimed: false, unsubToken: null } });
    const body = await (await POST(req({ dryRun: false }))).json();
    expect(body.recipients.u1).toEqual({ push: 'skipped_already_sent', email: 'skipped_already_sent' });
    expect(send).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a claim that ERRORS does not send', async () => {
    vi.mocked(claimOneOffSend).mockResolvedValue({ success: false, error: 'db down' });
    const body = await (await POST(req({ dryRun: false }))).json();
    expect(body.recipients.u1.email).toBe('failed');
    expect(send).not.toHaveBeenCalled();
  });

  it('a claim that succeeds with NO DATA does not send either', async () => {
    // success:true with data undefined is the shape that would slip through a
    // bare `if (!claim.success)` check and send unrecorded.
    vi.mocked(claimOneOffSend).mockResolvedValue({ success: true } as never);
    const body = await (await POST(req({ dryRun: false }))).json();
    expect(body.recipients.u1.email).toBe('failed');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('it honours what people have said', () => {
  it('an unsubscribed person gets no email, and is not even claimed for it', async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    const body = await (await POST(req({ dryRun: false }))).json();
    expect(body.recipients.u1.email).toBe('suppressed');
    expect(send).not.toHaveBeenCalled();
    expect(claimOneOffSend).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'u1', 'email');
  });

  it('a person with NO unsubscribe token is not emailed at all', async () => {
    // 189 backfilled a token for every row, so this is the broken-backfill
    // case. Sending without a link would leave them no way out, which is the
    // thing the opt-out exists to prevent.
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: null });
    const body = await (await POST(req({ dryRun: false }))).json();
    expect(body.recipients.u1.email).toBe('failed');
    expect(send).not.toHaveBeenCalled();
  });

  it('someone with training nudges off gets no push', async () => {
    vi.mocked(shouldSendNotification).mockResolvedValue(false);
    const body = await (await POST(req({ dryRun: false }))).json();
    expect(body.recipients.u1.push).toBe('suppressed');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('the push gate asks about PUSH, not email', async () => {
    await POST(req({ dryRun: false }));
    expect(shouldSendNotification).toHaveBeenCalledWith(expect.anything(), 'u1', expect.any(String), 'push');
  });

  it('the type is one whose category defaults ON, or it reaches nobody', async () => {
    // `general` sits under `marketing`, which defaults false: using it would
    // suppress the push for essentially the whole audience while looking sent.
    await POST(req({ dryRun: false }));
    const type = vi.mocked(shouldSendNotification).mock.calls[0][2];
    expect(type).not.toBe('general');
  });

  it('no token means no push, and no claim burned on one', async () => {
    audience = [{ ...ATHLETE, fcm_token: null }];
    const body = await (await POST(req({ dryRun: false }))).json();
    expect(body.recipients.u1.push).toBe('no_address');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('what actually goes out', () => {
  it('the email carries a working unsubscribe link and the RFC 8058 headers', async () => {
    await POST(req({ dryRun: false }));
    const arg = send.mock.calls[0][0];
    // An <a href>, not merely the string appearing somewhere. The first
    // version of this case passed with the anchor's closing tag broken,
    // because the URL was still present as text -- a detector searching for a
    // NAME rather than asking whether the thing is clickable.
    expect(arg.html).toMatch(/<a\s+href="[^"]*\/api\/unsubscribe\?token=tok"/);
    expect(arg.headers['List-Unsubscribe']).toContain('/api/unsubscribe?token=tok');
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('sends from the same verified address as the rest of the app', async () => {
    // A sender on an unverified domain is rejected by Resend at the API. The
    // first draft of this route used a plausible-looking hola@tribeapp.co and
    // would have failed all 28 with nothing visible to the recipients.
    const { readFileSync } = await import('node:fs');
    const nudge = readFileSync('app/api/one-off/sports-nudge/route.ts', 'utf8');
    const existing = readFileSync('app/api/send-inactive-nudge/route.ts', 'utf8');
    const addressIn = (src: string) =>
      src
        .match(/from:\s*'([^']+)'|const FROM = '([^']+)'/)
        ?.slice(1)
        .find(Boolean);
    expect(addressIn(nudge)).toBeTruthy();
    expect(addressIn(nudge)).toBe(addressIn(existing));

    await POST(req({ dryRun: false }));
    expect(send.mock.calls[0][0].from).toBe(addressIn(existing));
  });

  it('both channels point at the sports step', async () => {
    await POST(req({ dryRun: false }));
    expect(send.mock.calls[0][0].html).toContain('/onboarding/sports');
    const pushBody = JSON.parse((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(pushBody.url).toBe('/onboarding/sports');
  });

  it('Spanish is the default, English only on an explicit preference', async () => {
    await POST(req({ dryRun: false }));
    expect(send.mock.calls[0][0].subject).toBe('¿Qué entrenas?');

    vi.clearAllMocks();
    vi.mocked(claimOneOffSend).mockResolvedValue({ success: true, data: { claimed: true, unsubToken: null } });
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: 'https://x/api/unsubscribe?token=tok' });
    vi.mocked(isEmailSuppressed).mockResolvedValue(false);
    vi.mocked(shouldSendNotification).mockResolvedValue(true);
    audience = [{ ...ATHLETE, preferred_language: 'en' }];
    await POST(req({ dryRun: false }));
    expect(send.mock.calls[0][0].subject).toBe('What do you train?');
  });

  it('no green text on the light email background', async () => {
    // Measured 2026-09-13: the best green in the palette is 3.04:1 on white,
    // which fails AA for body copy. Green is a fill with dark text on it.
    await POST(req({ dryRun: false }));
    const html: string = send.mock.calls[0][0].html;
    expect(html).not.toMatch(/color:\s*#A8DA36/i);
    expect(html).toContain('background:#A8DA36');
  });
});

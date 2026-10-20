import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/sessions/notify-cancel: the server side of the session-cancel push.
 * Who may trigger it (host or admin, only once the session is cancelled), who
 * receives it (rows of this session only), each athlete's language (Spanish
 * unless they chose English), and that a failed send never fails the call.
 */

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';

const SESSION_ID = '11111111-1111-4111-a111-111111111111';
const HOST = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const ADMIN = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
const STRANGER = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
const ES_USER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1';
const EN_USER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2';
const NULL_USER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3';
const P1 = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbb1';
const P2 = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbb2';
const P3 = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbb3';

const CANCELLED = {
  id: SESSION_ID,
  creator_id: HOST,
  status: 'cancelled',
  title: 'Boxeo en el parque',
  sport: 'Boxing',
  date: '2026-10-20',
  is_paid: false,
};

function mockCaller(user: { id: string } | null, isAdmin = false) {
  const rpc = vi.fn().mockResolvedValue({ data: isAdmin, error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc,
  } as never);
  return rpc;
}

function mockService(opts: {
  session?: Record<string, unknown> | null;
  rows?: Array<{ id: string; user_id: string | null }>;
  langs?: Array<{ id: string; preferred_language: string | null }>;
  hostName?: string | null;
}) {
  const participantsEq = vi.fn();
  const participantsIn = vi.fn().mockResolvedValue({ data: opts.rows ?? [], error: null });
  vi.mocked(getServiceRoleClient).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: opts.session ?? null, error: null }) }),
          }),
        };
      }
      if (table === 'session_participants') {
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              participantsEq(col, val);
              return { in: participantsIn };
            },
          }),
        };
      }
      // users: .select().in() for languages, .select().eq().maybeSingle() for the host name
      return {
        select: () => ({
          in: vi.fn().mockResolvedValue({ data: opts.langs ?? [], error: null }),
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { name: opts.hostName ?? null }, error: null }),
          }),
        }),
      };
    }),
  } as never);
  return { participantsEq, participantsIn };
}

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/sessions/notify-cancel/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
}

const okJson = (json: unknown = { success: true }) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(json),
  text: () => Promise.resolve(''),
});

/** The push bodies sent, keyed by recipient. */
function sentTo(fetchSpy: ReturnType<typeof vi.fn>) {
  const out: Record<string, { title: string; body: string; url: string; type: string; data: Record<string, string> }> =
    {};
  for (const [, init] of fetchSpy.mock.calls) {
    const b = JSON.parse((init as { body: string }).body);
    out[b.userId] = b;
  }
  return out;
}

describe('POST /api/sessions/notify-cancel', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = 'test-secret';
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
    fetchSpy = vi.fn().mockResolvedValue(okJson());
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => vi.unstubAllGlobals());

  // ── who may call ────────────────────────────────────────────────

  it('400 on an invalid body', async () => {
    mockCaller({ id: HOST });
    expect((await POST(req({ session_id: 'nope', participant_ids: [] }))).status).toBe(400);
    expect((await POST(req({ session_id: SESSION_ID, participant_ids: ['x'] }))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('401 when nobody is signed in', async () => {
    mockCaller(null);
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('403 for a signed-in caller who is neither the host nor an admin', async () => {
    const rpc = mockCaller({ id: STRANGER }, false);
    mockService({ session: CANCELLED, rows: [{ id: P1, user_id: ES_USER }] });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('is_app_admin');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('403 when the session does not exist', async () => {
    mockCaller({ id: HOST });
    mockService({ session: null });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('409 while the session is still active: no ping for a live session', async () => {
    mockCaller({ id: HOST });
    mockService({ session: { ...CANCELLED, status: 'active' }, rows: [{ id: P1, user_id: ES_USER }] });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(409);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an admin who is not the host may send it', async () => {
    mockCaller({ id: ADMIN }, true);
    mockService({
      session: CANCELLED,
      rows: [{ id: P1, user_id: ES_USER }],
      langs: [{ id: ES_USER, preferred_language: 'es' }],
    });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('the host is not asked about admin status', async () => {
    const rpc = mockCaller({ id: HOST });
    mockService({ session: CANCELLED, rows: [{ id: P1, user_id: ES_USER }] });
    await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    mockCaller({ id: HOST });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── who receives it ─────────────────────────────────────────────

  it('reads only rows of this session, and skips guest rows and the host', async () => {
    mockCaller({ id: HOST });
    const { participantsEq, participantsIn } = mockService({
      session: CANCELLED,
      rows: [
        { id: P1, user_id: ES_USER },
        { id: P2, user_id: null },
        { id: P3, user_id: HOST },
      ],
      langs: [{ id: ES_USER, preferred_language: 'es' }],
    });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1, P2, P3] }));
    expect(participantsEq).toHaveBeenCalledWith('session_id', SESSION_ID);
    expect(participantsIn).toHaveBeenCalledWith('id', [P1, P2, P3]);
    expect(Object.keys(sentTo(fetchSpy))).toEqual([ES_USER]);
    expect(await res.json()).toMatchObject({ success: true, sent: 1 });
  });

  it('nobody to notify: 200 and no send', async () => {
    mockCaller({ id: HOST });
    mockService({ session: CANCELLED, rows: [] });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── language ────────────────────────────────────────────────────

  it('Spanish, English, and no preference (Spanish), each in their own language', async () => {
    mockCaller({ id: HOST });
    mockService({
      session: CANCELLED,
      rows: [
        { id: P1, user_id: ES_USER },
        { id: P2, user_id: EN_USER },
        { id: P3, user_id: NULL_USER },
      ],
      langs: [
        { id: ES_USER, preferred_language: 'es' },
        { id: EN_USER, preferred_language: 'en' },
        { id: NULL_USER, preferred_language: null },
      ],
    });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1, P2, P3] }));
    expect(res.status).toBe(200);
    const sent = sentTo(fetchSpy);

    expect(sent[ES_USER].title).toBe('🚫 Sesión cancelada');
    expect(sent[ES_USER].body).toBe('La sesión "Boxeo en el parque" del martes 20 de octubre fue cancelada.');
    expect(sent[EN_USER].title).toBe('🚫 Session cancelled');
    expect(sent[EN_USER].body).toBe('"Boxeo en el parque" on Tuesday, October 20 was cancelled.');
    expect(sent[NULL_USER].title).toBe('🚫 Sesión cancelada');
    expect(sent[NULL_USER].body).toBe(sent[ES_USER].body);
  });

  it('a recipient with no users row still gets Spanish', async () => {
    mockCaller({ id: HOST });
    mockService({ session: CANCELLED, rows: [{ id: P1, user_id: ES_USER }], langs: [] });
    await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(sentTo(fetchSpy)[ES_USER].title).toBe('🚫 Sesión cancelada');
  });

  it('goes through /api/notifications/send with the type, the secret and the session link', async () => {
    mockCaller({ id: HOST });
    mockService({ session: CANCELLED, rows: [{ id: P1, user_id: ES_USER }] });
    await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/notifications/send/');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer test-secret');
    const b = sentTo(fetchSpy)[ES_USER];
    expect(b.type).toBe('session_cancelled');
    expect(b.url).toBe(`/session/${SESSION_ID}/`);
    expect(b.data).toEqual({ sessionId: SESSION_ID, type: 'session_cancelled' });
  });

  it('a paid session adds the refund line, in each language', async () => {
    mockCaller({ id: HOST });
    mockService({
      session: { ...CANCELLED, is_paid: true },
      rows: [
        { id: P1, user_id: ES_USER },
        { id: P2, user_id: EN_USER },
      ],
      langs: [
        { id: ES_USER, preferred_language: 'es' },
        { id: EN_USER, preferred_language: 'en' },
      ],
    });
    await POST(req({ session_id: SESSION_ID, participant_ids: [P1, P2] }));
    const sent = sentTo(fetchSpy);
    expect(sent[ES_USER].body).toMatch(/fue cancelada\. Te devolveremos el pago\.$/);
    expect(sent[EN_USER].body).toMatch(/was cancelled\. Your payment will be refunded\.$/);
  });

  it('an untitled session is named "<Deporte> con <Nombre>"', async () => {
    mockCaller({ id: HOST });
    mockService({
      session: { ...CANCELLED, title: null },
      rows: [{ id: P1, user_id: ES_USER }],
      langs: [{ id: ES_USER, preferred_language: 'es' }],
      hostName: 'Salomón Taborda',
    });
    await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(sentTo(fetchSpy)[ES_USER].body).toBe(
      'La sesión "Boxeo con Salomón" del martes 20 de octubre fue cancelada.'
    );
  });

  // ── failures never fail the call ────────────────────────────────

  it('one push fails (500): the others still go, the call still succeeds', async () => {
    mockCaller({ id: HOST });
    mockService({
      session: CANCELLED,
      rows: [
        { id: P1, user_id: ES_USER },
        { id: P2, user_id: EN_USER },
      ],
    });
    fetchSpy.mockImplementation((_url: string, init: { body: string }) =>
      Promise.resolve(
        JSON.parse(init.body).userId === ES_USER
          ? { ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve('boom') }
          : okJson()
      )
    );
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1, P2] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, sent: 1, failed: 1 });
  });

  it('the send throws (network): counted as failed, call still succeeds', async () => {
    mockCaller({ id: HOST });
    mockService({ session: CANCELLED, rows: [{ id: P1, user_id: ES_USER }] });
    fetchSpy.mockRejectedValue(new Error('ECONNRESET'));
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, sent: 0, failed: 1 });
  });

  it('a recipient with no push token (404) is counted, not an error', async () => {
    mockCaller({ id: HOST });
    mockService({
      session: CANCELLED,
      rows: [
        { id: P1, user_id: ES_USER },
        { id: P2, user_id: EN_USER },
      ],
    });
    fetchSpy.mockImplementation((_url: string, init: { body: string }) =>
      Promise.resolve(
        JSON.parse(init.body).userId === ES_USER
          ? { ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') }
          : okJson()
      )
    );
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1, P2] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, sent: 1, no_token: 1, failed: 0 });
  });

  it('a recipient who turned session updates off is counted as suppressed', async () => {
    mockCaller({ id: HOST });
    mockService({ session: CANCELLED, rows: [{ id: P1, user_id: ES_USER }] });
    fetchSpy.mockResolvedValue(okJson({ success: true, suppressed: true, reason: 'preference' }));
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(await res.json()).toMatchObject({ success: true, sent: 0, suppressed: 1 });
  });

  it('without CRON_SECRET it sends nothing and still answers 200', async () => {
    delete process.env.CRON_SECRET;
    mockCaller({ id: HOST });
    mockService({ session: CANCELLED, rows: [{ id: P1, user_id: ES_USER }] });
    const res = await POST(req({ session_id: SESSION_ID, participant_ids: [P1] }));
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

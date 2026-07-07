import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Security tests for /api/sessions/notify-join — the constrained replacement
 * for clients calling /api/notifications/send directly. The recipient and
 * message must be derived server-side; the client cannot pick who gets
 * notified or what it says.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
// Factory uses only vi.fn() — no outer variable reference — to satisfy hoisting.
vi.mock('@/lib/dal', () => ({ createNotification: vi.fn() }));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { createNotification } from '@/lib/dal';

// Full allowed set from migrations/011_social_features.sql and 023_notifications.sql.
const ALLOWED_NOTIFICATION_TYPES: readonly string[] = [
  'follow',
  'like',
  'comment',
  'review',
  'session_join',
  'session_leave', // T-NOTIF1: migration 105 dropped the CHECK; this is an app-used type
  'community_invite',
  'achievement',
  'referral_complete',
  'dm',
  'challenge_complete',
  'community_post',
  'session_reminder',
  'session_update',
  'new_message',
  'connection_request',
  'review_received',
  'referral_converted',
  'streak_milestone',
  'general',
];

/** Implementation that throws on any type violating the DB CHECK constraint. */
function constraintEnforcingImpl(
  _client: unknown,
  payload: { type: string; [k: string]: unknown }
): Promise<{ success: true; data: { id: string; [k: string]: unknown } }> {
  if (!ALLOWED_NOTIFICATION_TYPES.includes(payload.type)) {
    throw new Error(`Mock CHECK constraint violation: notifications.type '${payload.type}' is not in the allowed set`);
  }
  return Promise.resolve({ success: true as const, data: { id: 'notif-1', ...payload } });
}

const SESSION_ID = '11111111-1111-4111-a111-111111111111';
const CREATOR_ID = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const JOINER_ID = 'jjjjjjjj-jjjj-4jjj-ajjj-jjjjjjjjjjjj';

function mockAuth(user: { id: string } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  } as never);
}

function mockService(opts: {
  session?: { id: string; creator_id: string; sport: string; status: string } | null;
  isParticipant?: boolean;
  hostLanguage?: string | null;
}) {
  const sessionMaybe = vi.fn().mockResolvedValue({ data: opts.session ?? null, error: null });
  const participantMaybe = vi.fn().mockResolvedValue({
    data: opts.isParticipant ? { id: 'p1' } : null,
    error: null,
  });
  // Language lookup for the host: .select().eq().maybeSingle()
  const userMaybe = vi.fn().mockResolvedValue({
    data: { preferred_language: opts.hostLanguage ?? null },
    error: null,
  });
  vi.mocked(getServiceRoleClient).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'sessions') {
        return { select: () => ({ eq: () => ({ maybeSingle: sessionMaybe }) }) };
      }
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: userMaybe }) }) };
      }
      // session_participants: .select().eq().eq().maybeSingle()
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: participantMaybe }) }) }) };
    }),
  } as never);
}

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/sessions/notify-join', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
}

const ACTIVE_SESSION = { id: SESSION_ID, creator_id: CREATOR_ID, sport: 'Running', status: 'active' };

describe('POST /api/sessions/notify-join', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply the constraint-enforcing implementation after vi.clearAllMocks() resets it.
    vi.mocked(createNotification).mockImplementation(constraintEnforcingImpl as never);
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = 'test-secret';
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('400 on an invalid body', async () => {
    mockAuth({ id: JOINER_ID });
    const res = await POST(req({ session_id: 'not-a-uuid', joiner_name: '', kind: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('401 for a registered join with no authenticated user', async () => {
    mockAuth(null);
    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Alex', kind: 'join' }));
    expect(res.status).toBe(401);
  });

  it('403 when the caller is not a participant of the session', async () => {
    mockAuth({ id: JOINER_ID });
    mockService({ session: ACTIVE_SESSION, isParticipant: false });
    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Alex', kind: 'join' }));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('404 when the session does not exist', async () => {
    mockAuth({ id: JOINER_ID });
    mockService({ session: null });
    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Alex', kind: 'join' }));
    expect(res.status).toBe(404);
  });

  it('dispatches to the host with server-derived recipient + EN copy (null host language)', async () => {
    mockAuth({ id: JOINER_ID });
    // hostLanguage null → falls back to 'en'
    mockService({ session: ACTIVE_SESSION, isParticipant: true, hostLanguage: null });

    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Alex', kind: 'join' }));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/notifications/send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-secret');
    const sent = JSON.parse(init.body as string);
    // Recipient is the session creator, NOT anything client-supplied.
    expect(sent.userId).toBe(CREATOR_ID);
    expect(sent.title).toBe('🎉 New Training Partner!');
    expect(sent.body).toBe('Alex joined your Running session');
  });

  it('dispatches to the host in ES when host language is "es"', async () => {
    mockAuth({ id: JOINER_ID });
    mockService({ session: ACTIVE_SESSION, isParticipant: true, hostLanguage: 'es' });

    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Ana', kind: 'join' }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(sent.userId).toBe(CREATOR_ID);
    // ES title / body from notificationCopy('join', 'es', ...)
    expect(sent.title).toBe('🎉 ¡Nuevo compañero de entrenamiento!');
    expect(sent.body).not.toContain('joined');
    expect(sent.body).toContain('Ana');
  });

  it('allows the guest path without auth and sends a guest-templated body', async () => {
    mockAuth(null);
    mockService({ session: ACTIVE_SESSION, hostLanguage: null });
    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Sam', kind: 'guest' }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(sent.userId).toBe(CREATOR_ID);
    expect(sent.body).toBe('Sam (guest) joined your Running session');
  });

  it('stores in-app notification with constraint-allowed type "session_join" for all join kinds (BUG-203)', async () => {
    // Regression guard: the mock enforces the DB CHECK constraint; if route.ts
    // ever reverts to storing templateKey ('join' | 'join_request' | 'join_guest')
    // the mock will throw and this test will fail — rather than silently passing.
    for (const kind of ['join', 'request', 'guest'] as const) {
      vi.clearAllMocks();
      vi.mocked(createNotification).mockImplementation(constraintEnforcingImpl as never);
      vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
      fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);

      const authedUser = kind === 'guest' ? null : { id: JOINER_ID };
      mockAuth(authedUser);
      mockService({ session: ACTIVE_SESSION, isParticipant: kind !== 'guest', hostLanguage: null });

      const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Tester', kind }));
      expect(res.status).toBe(200);

      // The in-app notification must use the constraint-allowed type.
      expect(vi.mocked(createNotification)).toHaveBeenCalledOnce();
      const [, payload] = vi.mocked(createNotification).mock.calls[0] as [
        unknown,
        { type: string; entity_type: string; entity_id: string },
      ];
      expect(payload.type).toBe('session_join');
      expect(payload.entity_type).toBe('session');
      expect(payload.entity_id).toBe(SESSION_ID);
    }
  });

  // T-NOTIF1: leave notification.
  it('kind "leave" notifies the host even though the participant row is already gone', async () => {
    mockAuth({ id: JOINER_ID });
    // isParticipant: false — the leaver's row is deleted before this fires. A
    // 'join' would 403 here; 'leave' must skip that check and still notify.
    mockService({ session: ACTIVE_SESSION, isParticipant: false, hostLanguage: null });

    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Alex', kind: 'leave' }));
    expect(res.status).toBe(200);

    expect(vi.mocked(createNotification)).toHaveBeenCalledOnce();
    const [, payload] = vi.mocked(createNotification).mock.calls[0] as [unknown, { type: string }];
    expect(payload.type).toBe('session_leave');
    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(sent.userId).toBe(CREATOR_ID);
    expect(sent.body).toBe('Alex left your Running session');
  });

  it('kind "leave" renders in the host language (es)', async () => {
    mockAuth({ id: JOINER_ID });
    mockService({ session: ACTIVE_SESSION, isParticipant: false, hostLanguage: 'es' });
    const res = await POST(req({ session_id: SESSION_ID, joiner_name: 'Ana', kind: 'leave' }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(sent.body).not.toContain('left');
    expect(sent.body).toContain('salio');
  });
});

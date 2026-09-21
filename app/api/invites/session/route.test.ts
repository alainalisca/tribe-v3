import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/dal/notifications', () => ({
  createNotification: vi.fn(),
}));
vi.mock('@/lib/dal/sessions', () => ({
  fetchSession: vi.fn(),
}));
vi.mock('@/lib/dal/invites', () => ({
  insertInviteToken: vi.fn(),
}));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/dal/notifications';
import { fetchSession } from '@/lib/dal/sessions';
import { insertInviteToken } from '@/lib/dal/invites';

/**
 * Service-role client mock (T-INV1): the route reads the recipient's
 * preferred_language via .from('users').select().eq().maybeSingle().
 */
function createServiceMock(recipientLanguage: string | null = null) {
  return {
    from: vi.fn().mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { preferred_language: recipientLanguage }, error: null }),
        }),
      }),
    })),
  };
}

// ── Helpers ────────────────────────────────────────────────────────

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const RECIPIENT_USER_ID = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

function createMockRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/invites/session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
}

/**
 * Build a chainable Supabase mock.
 * The route calls supabase.from() for:
 *   1. 'session_participants' - recipient already-in-session check (.maybeSingle)
 *      (sender participation check only if sender is NOT creator)
 *   2. 'users' - sender profile lookup (.single)
 */
function createAuthMock(overrides: {
  recipientInSession?: unknown;
  senderProfile?: unknown;
  /** Simulates the recipient already-in-session lookup FAILING. The route used
   *  to discard this error, so a failed query read as "not in the session". */
  recipientCheckError?: unknown;
}) {
  // Track maybeSingle calls on session_participants to differentiate
  // sender participation check vs recipient check
  let participantMaybeSingleCount = 0;

  const mock = {
    auth: { getUser: vi.fn() },
    from: vi.fn().mockImplementation((table: string) => {
      const chain: Record<string, (...args: unknown[]) => unknown> = {};

      // All chainable methods return chain
      chain.select = () => chain;
      chain.eq = () => chain;

      if (table === 'session_participants') {
        chain.maybeSingle = () => {
          participantMaybeSingleCount++;
          // When sender IS creator, there's only one maybeSingle call (recipient check).
          // When sender is NOT creator, first call = sender check, second = recipient check.
          // For simplicity in our tests the sender is always the creator,
          // so every maybeSingle call is the recipient check.
          return Promise.resolve({
            data: overrides.recipientCheckError ? null : (overrides.recipientInSession ?? null),
            error: overrides.recipientCheckError ?? null,
          });
        };
      }

      if (table === 'users') {
        chain.single = () =>
          Promise.resolve({
            data: overrides.senderProfile ?? { name: 'Test User' },
            error: null,
          });
      }

      return chain;
    }),
  };

  return mock;
}

// ── Test suite ─────────────────────────────────────────────────────

describe('POST /api/invites/session', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  });

  // ── 1. Unauthenticated -> 401 ───────────────────────────────────

  it('returns 401 when user is not authenticated', async () => {
    const mockClient = createAuthMock({});
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Unauthorized' },
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);

    const req = createMockRequest({
      session_id: SESSION_ID,
      recipient_user_id: RECIPIENT_USER_ID,
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── 2. Self-invite -> 400 ───────────────────────────────────────

  it('returns 400 when user tries to invite themselves', async () => {
    const mockClient = createAuthMock({});
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 'test@test.com' } },
      error: null,
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);

    const req = createMockRequest({
      session_id: SESSION_ID,
      recipient_user_id: AUTH_USER_ID, // same as sender
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/cannot invite yourself/i);
  });

  // ── 3. Recipient already in session -> 409 ──────────────────────

  it('returns 409 when recipient is already in the session', async () => {
    const mockClient = createAuthMock({
      recipientInSession: { id: 'existing-participant-id' },
    });
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 'test@test.com' } },
      error: null,
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);

    vi.mocked(fetchSession).mockResolvedValue({
      success: true,
      data: {
        id: SESSION_ID,
        creator_id: AUTH_USER_ID,
        sport: 'Basketball',
        date: '2026-04-15',
      },
    } as never);

    const req = createMockRequest({
      session_id: SESSION_ID,
      recipient_user_id: RECIPIENT_USER_ID,
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already in the session/i);
  });

  // ── 4. Valid invite -> 200 with { success: true } ───────────────

  it('returns 200 with success true for a valid session invite', async () => {
    const mockClient = createAuthMock({
      recipientInSession: null,
      senderProfile: { name: 'Al Alisca' },
    });
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 'test@test.com' } },
      error: null,
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);

    vi.mocked(fetchSession).mockResolvedValue({
      success: true,
      data: {
        id: SESSION_ID,
        creator_id: AUTH_USER_ID,
        sport: 'Basketball',
        date: '2026-04-15',
      },
    } as never);

    // Recipient prefers Spanish — the notification must be composed in ES.
    const serviceSupabaseMock = createServiceMock('es');
    vi.mocked(createServiceClient).mockReturnValue(serviceSupabaseMock as never);
    vi.mocked(insertInviteToken).mockResolvedValue({ success: true } as never);

    // createNotification never returns a row (no RETURNING read) — success only.
    vi.mocked(createNotification).mockResolvedValue({ success: true, data: null } as never);

    const req = createMockRequest({
      session_id: SESSION_ID,
      recipient_user_id: RECIPIENT_USER_ID,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // T-INV1: an invite token is minted so the in-app invite is acceptable
    // via /invite/{token}. expires_at is left to the DB default.
    expect(insertInviteToken).toHaveBeenCalledWith(
      serviceSupabaseMock,
      expect.objectContaining({
        session_id: SESSION_ID,
        created_by: AUTH_USER_ID,
        token: expect.stringMatching(/^[0-9a-f]{32}$/),
      })
    );

    // Verify createNotification was called with correct args, composed in
    // the RECIPIENT's language (es), not the sender's.
    expect(createNotification).toHaveBeenCalledWith(
      serviceSupabaseMock,
      expect.objectContaining({
        recipient_id: RECIPIENT_USER_ID,
        actor_id: AUTH_USER_ID,
        type: 'session_invite',
        entity_type: 'session',
        entity_id: SESSION_ID,
        message: 'Al Alisca te invito a Basketball el 2026-04-15',
      })
    );
  });

  // ── 5. Token mint failure -> 500 (invite would be a dead end) ────

  it('returns 500 when the invite token cannot be created', async () => {
    const mockClient = createAuthMock({
      recipientInSession: null,
      senderProfile: { name: 'Al Alisca' },
    });
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 'test@test.com' } },
      error: null,
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);

    vi.mocked(fetchSession).mockResolvedValue({
      success: true,
      data: { id: SESSION_ID, creator_id: AUTH_USER_ID, sport: 'Basketball', date: '2026-04-15' },
    } as never);

    vi.mocked(createServiceClient).mockReturnValue(createServiceMock(null) as never);
    vi.mocked(insertInviteToken).mockResolvedValue({ success: false, error: 'rls' } as never);

    const res = await POST(createMockRequest({ session_id: SESSION_ID, recipient_user_id: RECIPIENT_USER_ID }));
    expect(res.status).toBe(500);
    expect(createNotification).not.toHaveBeenCalled();
  });

  // ── 6. The token must actually REACH the recipient ──────────────────

  /**
   * The token was minted, stored, and never delivered: entity_id is uuid and
   * cannot hold 32 hex characters, so nothing on the notification could carry
   * it. The recipient got a message pointing at the SESSION, and an
   * invite_only session refuses a tokenless join.
   *
   * Migration 182 added action_url. These assertions exist because removing
   * `action_url: inviteUrl` from the route broke NOTHING before they did.
   */
  it('puts the minted token on the notification as action_url', async () => {
    const mockClient = createAuthMock({ recipientInSession: null, senderProfile: { name: 'Al' } });
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 't@t.com' } },
      error: null,
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);
    vi.mocked(fetchSession).mockResolvedValue({
      success: true,
      data: { id: SESSION_ID, creator_id: AUTH_USER_ID, sport: 'Basketball', date: '2026-04-15' },
    } as never);
    const serviceSupabaseMock = createServiceMock('en');
    vi.mocked(createServiceClient).mockReturnValue(serviceSupabaseMock as never);
    vi.mocked(insertInviteToken).mockResolvedValue({ success: true } as never);
    vi.mocked(createNotification).mockResolvedValue({ success: true, data: null } as never);

    await POST(createMockRequest({ session_id: SESSION_ID, recipient_user_id: RECIPIENT_USER_ID }));

    const mintedToken = vi.mocked(insertInviteToken).mock.calls[0][1].token as string;
    expect(createNotification).toHaveBeenCalledWith(
      serviceSupabaseMock,
      expect.objectContaining({ action_url: `/invite/${mintedToken}/` })
    );
  });

  /** The SAME token, not merely some well-formed url. A route that minted one
   *  token and linked another would pass a shape check and still be broken. */
  it('the linked token is the one that was stored', async () => {
    const mockClient = createAuthMock({ recipientInSession: null, senderProfile: { name: 'Al' } });
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 't@t.com' } },
      error: null,
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);
    vi.mocked(fetchSession).mockResolvedValue({
      success: true,
      data: { id: SESSION_ID, creator_id: AUTH_USER_ID, sport: 'Yoga', date: '2026-05-01' },
    } as never);
    vi.mocked(createServiceClient).mockReturnValue(createServiceMock('en') as never);
    vi.mocked(insertInviteToken).mockResolvedValue({ success: true } as never);
    vi.mocked(createNotification).mockResolvedValue({ success: true, data: null } as never);

    await POST(createMockRequest({ session_id: SESSION_ID, recipient_user_id: RECIPIENT_USER_ID }));

    const stored = vi.mocked(insertInviteToken).mock.calls[0][1].token as string;
    const linked = vi.mocked(createNotification).mock.calls[0][1].action_url as string;
    expect(linked).toContain(stored);
  });

  // ── 7. A failed recipient lookup must not read as "not in the session" ──

  it('returns 503 when the already-in-session check FAILS, instead of inviting anyway', async () => {
    const mockClient = createAuthMock({
      recipientCheckError: { message: 'connection reset' },
      senderProfile: { name: 'Al' },
    });
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID, email: 't@t.com' } },
      error: null,
    } as never);
    vi.mocked(createClient).mockResolvedValue(mockClient as never);
    vi.mocked(fetchSession).mockResolvedValue({
      success: true,
      data: { id: SESSION_ID, creator_id: AUTH_USER_ID, sport: 'Yoga', date: '2026-05-01' },
    } as never);
    vi.mocked(createServiceClient).mockReturnValue(createServiceMock('en') as never);
    vi.mocked(insertInviteToken).mockResolvedValue({ success: true } as never);
    vi.mocked(createNotification).mockResolvedValue({ success: true, data: null } as never);

    const res = await POST(createMockRequest({ session_id: SESSION_ID, recipient_user_id: RECIPIENT_USER_ID }));

    expect(res.status).toBe(503);
    // and it must not have gone ahead and invited
    expect(createNotification).not.toHaveBeenCalled();
    expect(insertInviteToken).not.toHaveBeenCalled();
  });
});

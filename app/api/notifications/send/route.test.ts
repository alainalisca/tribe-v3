import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock('@/lib/dal', () => ({
  fetchUserProfileMaybe: vi.fn(),
  updateUser: vi.fn(),
  updateUsersByIds: vi.fn(),
}));
vi.mock('./notificationHelpers', () => ({
  sendFcmNotification: vi.fn(),
  sendWebPushNotification: vi.fn(),
  isFcmTokenInvalid: vi.fn().mockReturnValue(false),
}));

import { POST, PUT } from './route';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { fetchUserProfileMaybe, updateUser, updateUsersByIds } from '@/lib/dal';
import { sendFcmNotification, sendWebPushNotification } from './notificationHelpers';

// ── Helpers ────────────────────────────────────────────────────────

const VALID_USER_ID = '11111111-1111-4111-a111-111111111111';
const VALID_USER_ID_2 = '22222222-2222-4222-a222-222222222222';
const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

function createMockRequest(body: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/notifications/send', {
    method,
    body: JSON.stringify(body),
    headers: new Headers({
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    }),
  });
}

function createMockAuthClient(authenticated: boolean) {
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue(
          authenticated
            ? { data: { user: { id: AUTH_USER_ID, email: 'test@test.com' } }, error: null }
            : { data: { user: null }, error: { message: 'Unauthorized' } }
        ),
    },
  };
}

// ── Test suite ─────────────────────────────────────────────────────

describe('POST /api/notifications/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
  });

  // ── 1. Unauthenticated POST -> 401 ──────────────────────────────

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockAuthClient(false) as never);

    const req = createMockRequest({
      userId: VALID_USER_ID,
      title: 'Hello',
      body: 'World',
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── 2. Invalid userId (bad Zod) -> 400 ──────────────────────────

  it('returns 400 when userId is not a valid UUID', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockAuthClient(true) as never);

    const req = createMockRequest({
      userId: 'not-a-uuid',
      title: 'Hello',
      body: 'World',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // ── 3. Valid POST with FCM token -> 200 with method: 'fcm' ─────

  it('returns 200 with method fcm when user has a valid FCM token', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockAuthClient(true) as never);
    vi.mocked(createServiceClient).mockReturnValue({} as never);

    vi.mocked(fetchUserProfileMaybe).mockResolvedValue({
      success: true,
      data: {
        push_subscription: null,
        fcm_token: 'valid-fcm-token-123',
        fcm_platform: 'android',
      },
    } as never);

    vi.mocked(sendFcmNotification).mockResolvedValue({
      success: true,
    } as never);

    const req = createMockRequest({
      userId: VALID_USER_ID,
      title: 'New Session',
      body: 'A new training session is available',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.method).toBe('fcm');
    expect(json.platform).toBe('android');

    expect(sendFcmNotification).toHaveBeenCalledWith(
      'valid-fcm-token-123',
      'New Session',
      'A new training session is available',
      expect.objectContaining({ url: '/' })
    );
  });
});

describe('PUT /api/notifications/send (batch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
  });

  // ── 4. Valid PUT batch send -> 200 with results object ──────────
  //
  // Post AUDIT-P0-4 the batch handler fetches users with a single IN query
  // via the service client (not via fetchUserProfileMaybe-per-user). The
  // service client mock below returns the `.from(...).select(...).in(...)`
  // chain that the route now uses.

  it('returns 200 with results breakdown for batch send', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockAuthClient(true) as never);

    const serviceClientMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                id: VALID_USER_ID,
                push_subscription: null,
                fcm_token: 'fcm-token-user-1',
                fcm_platform: 'ios',
              },
              {
                id: VALID_USER_ID_2,
                push_subscription: null,
                fcm_token: null,
                fcm_platform: null,
              },
            ],
            error: null,
          }),
        }),
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(serviceClientMock as never);

    vi.mocked(sendFcmNotification).mockResolvedValue({
      success: true,
    } as never);

    vi.mocked(updateUsersByIds).mockResolvedValue({ success: true } as never);

    const req = createMockRequest(
      {
        userIds: [VALID_USER_ID, VALID_USER_ID_2],
        title: 'Batch Title',
        body: 'Batch notification body',
      },
      'PUT'
    );
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.results).toBeDefined();
    expect(json.results.total).toBe(2);
    expect(json.results.fcm.sent).toBe(1);
    expect(json.results.noSubscription).toBe(1);
  });
});

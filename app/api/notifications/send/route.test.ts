import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/notifications/send is INTERNAL-ONLY: it can push arbitrary
 * title/body to any user, so it must require a valid CRON_SECRET bearer
 * and must NOT be reachable with a logged-in user session (that was a
 * spoofing vector — see the notify-join route for the constrained path
 * the in-app join flow uses instead).
 */

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
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
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchUserProfileMaybe, updateUsersByIds } from '@/lib/dal';
import { sendFcmNotification } from './notificationHelpers';

// ── Helpers ────────────────────────────────────────────────────────

const VALID_USER_ID = '11111111-1111-4111-a111-111111111111';
const VALID_USER_ID_2 = '22222222-2222-4222-a222-222222222222';
const SECRET = 'test-cron-secret';

function createMockRequest(
  body: Record<string, unknown>,
  method: 'POST' | 'PUT' = 'POST',
  authHeader: string | null = `Bearer ${SECRET}`
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-forwarded-for': '127.0.0.1',
  };
  if (authHeader) headers.Authorization = authHeader;
  return new NextRequest('http://localhost/api/notifications/send', {
    method,
    body: JSON.stringify(body),
    headers: new Headers(headers),
  });
}

// ── Test suite ─────────────────────────────────────────────────────

describe('POST /api/notifications/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = SECRET;
  });

  it('returns 401 when no Authorization header is present', async () => {
    const res = await POST(createMockRequest({ userId: VALID_USER_ID, title: 'x', body: 'y' }, 'POST', null));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the bearer is not the internal secret', async () => {
    const res = await POST(
      createMockRequest({ userId: VALID_USER_ID, title: 'x', body: 'y' }, 'POST', 'Bearer wrong-secret')
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when userId is not a valid UUID (valid secret)', async () => {
    const res = await POST(createMockRequest({ userId: 'not-a-uuid', title: 'Hello', body: 'World' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it('accepts an app-relative url (regression: z.string().url() rejected "/x")', async () => {
    vi.mocked(createServiceClient).mockReturnValue({} as never);
    vi.mocked(fetchUserProfileMaybe).mockResolvedValue({
      success: true,
      data: { push_subscription: null, fcm_token: 'fcm-1', fcm_platform: 'android' },
    } as never);
    vi.mocked(sendFcmNotification).mockResolvedValue({ success: true } as never);

    const res = await POST(createMockRequest({ userId: VALID_USER_ID, title: 'T', body: 'B', url: '/session/abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.method).toBe('fcm');
  });
});

describe('PUT /api/notifications/send (batch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = SECRET;
  });

  it('returns 401 without the internal secret', async () => {
    const res = await PUT(createMockRequest({ userIds: [VALID_USER_ID], title: 'x', body: 'y' }, 'PUT', null));
    expect(res.status).toBe(401);
  });

  it('returns 200 with results breakdown for an internal batch send', async () => {
    const serviceClientMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { id: VALID_USER_ID, push_subscription: null, fcm_token: 'fcm-token-user-1', fcm_platform: 'ios' },
              { id: VALID_USER_ID_2, push_subscription: null, fcm_token: null, fcm_platform: null },
            ],
            error: null,
          }),
        }),
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(serviceClientMock as never);
    vi.mocked(sendFcmNotification).mockResolvedValue({ success: true } as never);
    vi.mocked(updateUsersByIds).mockResolvedValue({ success: true } as never);

    const res = await PUT(
      createMockRequest({ userIds: [VALID_USER_ID, VALID_USER_ID_2], title: 'Batch', body: 'Body' }, 'PUT')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.results.total).toBe(2);
    expect(json.results.fcm.sent).toBe(1);
    expect(json.results.noSubscription).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks -----------------------------------------------------------------
// vi.hoisted so these are initialized before the hoisted vi.mock factories run.
const {
  mockGetUser,
  mockRpc,
  mockSend,
  mockIsValidCronAuth,
  mockFetchSessionFields,
  mockFetchUserProfileMaybe,
  mockCheckExistingParticipation,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockSend: vi.fn(),
  mockIsValidCronAuth: vi.fn(),
  mockFetchSessionFields: vi.fn(),
  mockFetchUserProfileMaybe: vi.fn(),
  mockCheckExistingParticipation: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser }, rpc: mockRpc }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({ __service: true }),
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: (h: string | null) => mockIsValidCronAuth(h) }));
vi.mock('@/lib/dal', () => ({
  fetchSessionFields: (...a: unknown[]) => mockFetchSessionFields(...a),
  fetchUserProfileMaybe: (...a: unknown[]) => mockFetchUserProfileMaybe(...a),
  checkExistingParticipation: (...a: unknown[]) => mockCheckExistingParticipation(...a),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/sessionLocation', () => ({ formatSessionLocation: () => 'Somewhere' }));
vi.mock('@/lib/dal/notificationPreferences', () => ({ shouldSendNotification: vi.fn() }));
vi.mock('@/lib/dal/emailUnsubscribe', async () => ({
  isEmailSuppressed: vi.fn(),
  unsubUrlFor: vi.fn(),
  // The REAL header builder: mocking it would assert the mock's idea of
  // RFC 8058 rather than the headers that actually go out.
  unsubHeaders: (await vi.importActual<typeof import('@/lib/dal/emailUnsubscribe')>('@/lib/dal/emailUnsubscribe'))
    .unsubHeaders,
}));

import { POST } from './route';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { isEmailSuppressed, unsubUrlFor } from '@/lib/dal/emailUnsubscribe';

const SESSION = {
  id: 's1',
  sport: 'running',
  location: 'x',
  date: '2026-01-01',
  creator_id: 'creator-1',
  creator: { name: 'Host' },
};
const RECIPIENT = { name: 'Pat', email: 'pat@example.com', preferred_language: 'en' };

function req(body: unknown, authHeader = ''): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? authHeader : null) },
    json: async () => body,
  } as unknown as Request;
}

async function statusOf(res: Response): Promise<number> {
  return (res as unknown as { status: number }).status;
}

describe('send-attendance-notification — authorization gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x.test';
    mockIsValidCronAuth.mockReturnValue(false); // session path by default
    mockFetchSessionFields.mockResolvedValue({ success: true, data: SESSION });
    mockFetchUserProfileMaybe.mockResolvedValue({ success: true, data: RECIPIENT });
    mockCheckExistingParticipation.mockResolvedValue({ success: true, data: { status: 'confirmed' } });
    // Re-set implementations, not just call history: vi.clearAllMocks() leaves
    // mockResolvedValue in place, so a suppression case would leak forward.
    vi.mocked(isEmailSuppressed).mockResolvedValue(false);
    vi.mocked(shouldSendNotification).mockResolvedValue(true);
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: 'https://x.test/api/unsubscribe?token=tok' });
  });

  it('401 and NO email when the session-path caller is not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }));
    expect(await statusOf(res)).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('403 and NO email when the caller is neither the creator nor an admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'stranger' } }, error: null });
    mockRpc.mockResolvedValue({ data: false, error: null }); // not admin
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }));
    expect(await statusOf(res)).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockFetchUserProfileMaybe).not.toHaveBeenCalled(); // never reaches the email read
  });

  it('403 and NO email when userId is NOT a confirmed participant', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'creator-1' } }, error: null }); // is creator
    mockCheckExistingParticipation.mockResolvedValue({ success: true, data: { status: 'pending' } });
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }));
    expect(await statusOf(res)).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('403 and NO email when the participant check errors (fail closed)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'creator-1' } }, error: null });
    mockCheckExistingParticipation.mockResolvedValue({ success: false, error: 'boom' });
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }));
    expect(await statusOf(res)).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('403 and NO email when userId is not a participant at all (null row)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'creator-1' } }, error: null });
    mockCheckExistingParticipation.mockResolvedValue({ success: true, data: null });
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }));
    expect(await statusOf(res)).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('200 and sends when the caller is the session creator and userId is a confirmed participant', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'creator-1' } }, error: null });
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }));
    expect(await statusOf(res)).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ to: 'pat@example.com' });
  });

  it('200 and sends when the caller is an admin (not the creator) and userId is a confirmed participant', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'some-admin' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null }); // is_app_admin
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }));
    expect(await statusOf(res)).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('cron path: sends WITHOUT any getUser/participant check (trusted caller)', async () => {
    mockIsValidCronAuth.mockReturnValue(true);
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer cron-secret'));
    expect(await statusOf(res)).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCheckExistingParticipation).not.toHaveBeenCalled();
  });

  it('400 and NO email when the session does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'creator-1' } }, error: null });
    mockFetchSessionFields.mockResolvedValue({ success: true, data: null });
    const res = await POST(req({ sessionId: 'nope', userId: 'u1' }));
    expect(await statusOf(res)).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('400 and NO email when sessionId/userId are missing', async () => {
    const res = await POST(req({}));
    expect(await statusOf(res)).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

/**
 * AUTOMATED AND REPEATING, SO IT NEEDS AN EXIT.
 *
 * This reads as transactional -- it is about a session the recipient attended.
 * But the post-session-followups cron fires it after every session, so it
 * arrives without the recipient doing anything, and that is the property that
 * decides it. A receipt is something you asked for by acting; this is
 * something that keeps coming.
 */
describe('send-attendance-notification — the exit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x.test';
    mockIsValidCronAuth.mockReturnValue(true); // cron path: skip the auth gate
    mockFetchSessionFields.mockResolvedValue({ success: true, data: SESSION });
    mockFetchUserProfileMaybe.mockResolvedValue({ success: true, data: RECIPIENT });
    vi.mocked(isEmailSuppressed).mockResolvedValue(false);
    vi.mocked(shouldSendNotification).mockResolvedValue(true);
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: 'https://x.test/api/unsubscribe?token=tok' });
    mockSend.mockResolvedValue({ id: 'e1' });
  });

  it('NON-VACUITY: it does send when everything permits', async () => {
    // Without this, every "did not send" case below is satisfied by a route
    // that fails earlier for an unrelated reason.
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    expect(await statusOf(res)).toBe(200);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('sends nothing to somebody who unsubscribed, and says which gate', async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    expect(await statusOf(res)).toBe(200);
    expect(await res.json()).toEqual({ success: true, suppressed: 'unsubscribed' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('the opt-out is checked BEFORE the policy, because it outranks it', async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    expect(shouldSendNotification).not.toHaveBeenCalled();
  });

  it('honours the session_updates category on the EMAIL channel', async () => {
    await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    expect(shouldSendNotification).toHaveBeenCalledWith(expect.anything(), 'u1', 'session_update', 'email');
  });

  it('sends nothing when that preference is off', async () => {
    vi.mocked(shouldSendNotification).mockResolvedValue(false);
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    expect(await res.json()).toEqual({ success: true, suppressed: 'preference' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('NO LINK MEANS NO SEND, and it is an error rather than a quiet skip', async () => {
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: null });
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    // 500 so the cron's own logging surfaces it. A 200 would make a broken
    // backfill indistinguishable from a delivered email.
    expect(await statusOf(res)).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a FAILED token read does not send either', async () => {
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: false, error: 'db down' });
    const res = await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    expect(await statusOf(res)).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('what goes out carries a real unsubscribe anchor and the one-click headers', async () => {
    await POST(req({ sessionId: 's1', userId: 'u1' }, 'Bearer s'));
    const arg = mockSend.mock.calls[0][0];
    // An <a href>, not the URL appearing anywhere: a broken anchor still
    // contains the string.
    expect(arg.html).toMatch(/<a\s+href="https:\/\/x\.test\/api\/unsubscribe\?token=tok"/);
    expect(arg.headers['List-Unsubscribe']).toBe('<https://x.test/api/unsubscribe?token=tok>');
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

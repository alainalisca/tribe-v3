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
vi.mock('resend', () => ({ Resend: class { emails = { send: mockSend }; } }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: (h: string | null) => mockIsValidCronAuth(h) }));
vi.mock('@/lib/dal', () => ({
  fetchSessionFields: (...a: unknown[]) => mockFetchSessionFields(...a),
  fetchUserProfileMaybe: (...a: unknown[]) => mockFetchUserProfileMaybe(...a),
  checkExistingParticipation: (...a: unknown[]) => mockCheckExistingParticipation(...a),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/sessionLocation', () => ({ formatSessionLocation: () => 'Somewhere' }));

import { POST } from './route';

const SESSION = { id: 's1', sport: 'running', location: 'x', date: '2026-01-01', creator_id: 'creator-1', creator: { name: 'Host' } };
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

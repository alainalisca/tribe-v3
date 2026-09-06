import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/video/direct-upload.
 *
 * The three gates run in a fixed order and each one is load bearing:
 *   - configuration first, so a deployment without credentials never reaches
 *     Cloudflare or the database;
 *   - authentication next, because a minted URL is a write capability;
 *   - is_instructor last, because without it any signed in account could mint
 *     URLs against the account's Stream quota.
 *
 * The minted values are also pinned. maxDurationSeconds is the storage
 * Cloudflare reserves the moment the link exists, and the expiry is how long
 * an abandoned link keeps holding it, so a silent default change is billable.
 */

const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockLog = vi.fn();
const mockFetch = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mockSingle }) }) }),
  }),
}));
vi.mock('@/lib/logger', () => ({ log: mockLog, logError: vi.fn() }));

const ORIGINAL_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const ORIGINAL_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;

function cloudflareOk() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      errors: [],
      messages: [],
      result: { uid: 'vid_abc123', uploadURL: 'https://upload.videodelivery.net/one-time-token' },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal('fetch', mockFetch);
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_test';
  process.env.CLOUDFLARE_STREAM_TOKEN = 'token_test';
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockSingle.mockResolvedValue({ data: { id: 'u1', is_instructor: true }, error: null });
  mockFetch.mockResolvedValue(cloudflareOk());
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_ACCOUNT === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
  else process.env.CLOUDFLARE_ACCOUNT_ID = ORIGINAL_ACCOUNT;
  if (ORIGINAL_TOKEN === undefined) delete process.env.CLOUDFLARE_STREAM_TOKEN;
  else process.env.CLOUDFLARE_STREAM_TOKEN = ORIGINAL_TOKEN;
});

async function post() {
  const { POST } = await import('./route');
  return POST(new NextRequest('https://tribe-v3.vercel.app/api/video/direct-upload', { method: 'POST' }));
}

describe('configuration gate', () => {
  it('returns 503 and never calls Cloudflare when the account id is missing', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;

    const res = await post();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'stream_not_configured' });
    expect(mockFetch).not.toHaveBeenCalled();
    // It short circuits ahead of any auth or database work.
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it('returns 503 and never calls Cloudflare when the token is missing', async () => {
    delete process.env.CLOUDFLARE_STREAM_TOKEN;

    const res = await post();

    expect(res.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('logs a structured warning naming the route when configuration is absent', async () => {
    delete process.env.CLOUDFLARE_STREAM_TOKEN;

    await post();

    expect(mockLog).toHaveBeenCalledWith('warn', 'video_direct_upload_blocked', {
      route: 'POST /api/video/direct-upload',
      action: 'stream_not_configured',
    });
  });
});

describe('auth and instructor gates', () => {
  it('returns 401 when signed out, without calling Cloudflare', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });

    const res = await post();

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed in NON instructor, without calling Cloudflare', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'u1', is_instructor: false }, error: null });

    const res = await post();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Only instructors can upload video',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile row cannot be read', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const res = await post();

    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('instructor happy path', () => {
  it('returns the uploadURL and uid', async () => {
    const res = await post();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { uploadURL: 'https://upload.videodelivery.net/one-time-token', uid: 'vid_abc123' },
    });
  });

  it('sends maxDurationSeconds 120, which is the storage Cloudflare reserves', async () => {
    await post();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { maxDurationSeconds: number; expiry: string };
    expect(body.maxDurationSeconds).toBe(120);
  });

  it('sends an expiry 1800 seconds out, so an abandoned link stops reserving storage', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    await post();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { expiry: string };
    const seconds = Math.round((new Date(body.expiry).getTime() - now) / 1000);
    expect(seconds).toBe(1800);
  });

  it('posts to the account scoped direct_upload endpoint with the bearer token', async () => {
    await post();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct_test/stream/direct_upload');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token_test');
  });
});

describe('Cloudflare failure', () => {
  it('returns 502 and does not leak the token when Cloudflare refuses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }),
    });

    const res = await post();

    expect(res.status).toBe(502);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).not.toContain('token_test');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/video/delete.
 *
 * Same three gates as the mint route, plus the one that only matters here:
 * ownership. Without it any instructor could free another instructor's video
 * by guessing a uid.
 *
 * Ownership is deliberately not "is this uid in your row and nothing else".
 * The caller reaches this route after the new uid has already been written,
 * which is the correct order, so the old uid is nobody's current value by
 * then. A uid is deletable when it is the caller's own or unclaimed, and
 * refused when another user still points at it.
 */

const mockGetUser = vi.fn();
const mockProfileSingle = vi.fn();
const mockClaimantMaybeSingle = vi.fn();
const mockDeleteVideo = vi.fn();
const mockLog = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mockProfileSingle, maybeSingle: mockClaimantMaybeSingle }),
      }),
    }),
  }),
}));
vi.mock('@/lib/logger', () => ({ log: mockLog, logError: vi.fn() }));
vi.mock('@/lib/video/stream', () => ({ deleteVideo: mockDeleteVideo }));

const ORIGINAL_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const ORIGINAL_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;
const UID = 'b236bde30eb07b9d01318940e5fc3eda';

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_test';
  process.env.CLOUDFLARE_STREAM_TOKEN = 'token_test';
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  // Default: an instructor whose current video is something else, so the
  // requested uid is a just replaced orphan.
  mockProfileSingle.mockResolvedValue({
    data: { id: 'u1', is_instructor: true, storefront_video_url: 'newer_uid' },
    error: null,
  });
  mockClaimantMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockDeleteVideo.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_ACCOUNT === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
  else process.env.CLOUDFLARE_ACCOUNT_ID = ORIGINAL_ACCOUNT;
  if (ORIGINAL_TOKEN === undefined) delete process.env.CLOUDFLARE_STREAM_TOKEN;
  else process.env.CLOUDFLARE_STREAM_TOKEN = ORIGINAL_TOKEN;
});

async function post(body: unknown = { uid: UID }) {
  const { POST } = await import('./route');
  return POST(
    new NextRequest('https://tribe-v3.vercel.app/api/video/delete/', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: new Headers({ 'content-type': 'application/json' }),
    })
  );
}

describe('configuration gate', () => {
  it('returns 503 and never calls Cloudflare when credentials are absent', async () => {
    delete process.env.CLOUDFLARE_STREAM_TOKEN;

    const res = await post();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'stream_not_configured' });
    expect(mockDeleteVideo).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

describe('auth and instructor gates', () => {
  it('returns 401 when signed out', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });

    const res = await post();

    expect(res.status).toBe(401);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed in non instructor', async () => {
    mockProfileSingle.mockResolvedValue({
      data: { id: 'u1', is_instructor: false, storefront_video_url: null },
      error: null,
    });

    const res = await post();

    expect(res.status).toBe(403);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile row cannot be read', async () => {
    mockProfileSingle.mockResolvedValue({ data: null, error: { message: 'nope' } });

    const res = await post();

    expect(res.status).toBe(404);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });
});

describe('input validation', () => {
  it.each([{}, { uid: '' }, { uid: '   ' }, null])('returns 400 for body %p', async (body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('refuses a legacy Supabase URL rather than passing it to Stream', async () => {
    const res = await post({ uid: 'https://x.supabase.co/storage/v1/object/public/media/a.mp4' });

    expect(res.status).toBe(400);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });
});

describe('ownership', () => {
  it('deletes the uid when it is the callers own current video', async () => {
    mockProfileSingle.mockResolvedValue({
      data: { id: 'u1', is_instructor: true, storefront_video_url: UID },
      error: null,
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockDeleteVideo).toHaveBeenCalledWith(UID);
    // No claimant lookup needed: it is already theirs.
    expect(mockClaimantMaybeSingle).not.toHaveBeenCalled();
  });

  it('deletes a just replaced uid that no user claims any more', async () => {
    mockClaimantMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockDeleteVideo).toHaveBeenCalledWith(UID);
  });

  it('REFUSES a uid another user still points at', async () => {
    mockClaimantMaybeSingle.mockResolvedValue({ data: { id: 'someone-else' }, error: null });

    const res = await post();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Not your video' });
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('does not trust the body: ownership comes from the database, not the request', async () => {
    mockClaimantMaybeSingle.mockResolvedValue({ data: { id: 'someone-else' }, error: null });

    const res = await post({ uid: UID, userId: 'someone-else', owner: 'u1' });

    expect(res.status).toBe(403);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('fails closed when the ownership lookup itself errors', async () => {
    mockClaimantMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const res = await post();

    expect(res.status).toBe(500);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });
});

describe('Cloudflare failure', () => {
  it('returns 502 when the Stream delete throws', async () => {
    mockDeleteVideo.mockRejectedValue(new Error('cloudflare down'));

    const res = await post();

    expect(res.status).toBe(502);
  });
});

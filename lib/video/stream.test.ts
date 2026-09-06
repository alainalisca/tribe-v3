import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDirectUpload, deleteVideo, CloudflareStreamError } from './stream';

/**
 * Tests for the Cloudflare Stream helper.
 *
 * The values asserted here are cost controls, not cosmetics. Cloudflare
 * reserves storage for maxDurationSeconds the moment a link is minted and
 * holds it until the upload lands or the link expires, and Stream never
 * overwrites, so a replacement without deleteVideo bills the old video forever.
 */

const mockFetch = vi.fn();
const ORIGINAL_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const ORIGINAL_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_test';
  process.env.CLOUDFLARE_STREAM_TOKEN = 'token_test';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (ORIGINAL_ACCOUNT === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
  else process.env.CLOUDFLARE_ACCOUNT_ID = ORIGINAL_ACCOUNT;
  if (ORIGINAL_TOKEN === undefined) delete process.env.CLOUDFLARE_STREAM_TOKEN;
  else process.env.CLOUDFLARE_STREAM_TOKEN = ORIGINAL_TOKEN;
});

function ok() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      errors: [],
      messages: [],
      result: { uid: 'vid_1', uploadURL: 'https://upload.videodelivery.net/t' },
    }),
  };
}

describe('createDirectUpload', () => {
  it('returns the uploadURL and uid', async () => {
    mockFetch.mockResolvedValue(ok());

    await expect(createDirectUpload()).resolves.toEqual({
      uploadURL: 'https://upload.videodelivery.net/t',
      uid: 'vid_1',
    });
  });

  it('defaults to maxDurationSeconds 120 and an expiry 1800 seconds out', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockFetch.mockResolvedValue(ok());

    await createDirectUpload();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { maxDurationSeconds: number; expiry: string };
    expect(body.maxDurationSeconds).toBe(120);
    expect(Math.round((new Date(body.expiry).getTime() - now) / 1000)).toBe(1800);
  });

  it('honors explicit overrides', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockFetch.mockResolvedValue(ok());

    await createDirectUpload({ maxDurationSeconds: 45, expirySeconds: 300 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { maxDurationSeconds: number; expiry: string };
    expect(body.maxDurationSeconds).toBe(45);
    expect(Math.round((new Date(body.expiry).getTime() - now) / 1000)).toBe(300);
  });

  it('surfaces Cloudflare error detail on a non 2xx response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }),
    });

    await expect(createDirectUpload()).rejects.toThrow(/10000: Authentication error/);
  });

  it('carries the status and the Cloudflare errors on the thrown error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ success: false, errors: [{ code: 971, message: 'Rate limited' }] }),
    });

    await expect(createDirectUpload()).rejects.toMatchObject({
      name: 'CloudflareStreamError',
      status: 429,
      cloudflareErrors: [{ code: 971, message: 'Rate limited' }],
    });
  });

  it('throws when Cloudflare returns 200 with no upload URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false, errors: [{ code: 1, message: 'nope' }], messages: [], result: {} }),
    });

    await expect(createDirectUpload()).rejects.toBeInstanceOf(CloudflareStreamError);
  });

  it('throws without calling Cloudflare when credentials are absent', async () => {
    delete process.env.CLOUDFLARE_STREAM_TOKEN;

    await expect(createDirectUpload()).rejects.toThrow(/not configured/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('deleteVideo', () => {
  it('calls the account scoped delete endpoint for the uid', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });

    await deleteVideo('vid_1');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct_test/stream/vid_1');
    expect(init.method).toBe('DELETE');
  });

  it('treats an already deleted video as done', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ success: false, errors: [] }) });

    await expect(deleteVideo('gone')).resolves.toBeUndefined();
  });

  it('throws with Cloudflare detail on a real failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, errors: [{ code: 10, message: 'boom' }] }),
    });

    await expect(deleteVideo('vid_1')).rejects.toThrow(/10: boom/);
  });
});

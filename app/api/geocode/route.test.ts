/**
 * Google's Geocoding Web Service answers HTTP 200 for its OWN failures.
 * A rejected key comes back as 200 with {"status":"REQUEST_DENIED"}, so a
 * handler that only checks `response.ok` cannot tell a misconfiguration from
 * "there is no address at these coordinates".
 *
 * The previous handler did exactly that, and then sent the result to the edge
 * cache for 24 hours. One wrong key became a day-long outage in which every
 * caller was told, successfully, that the place has no name.
 *
 * These tests exist for that path specifically. The happy path was never the
 * risk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above these declarations, and `logError: mockLogError`
// is evaluated when the factory runs -- unlike the lazy createClient factory,
// which is why only one of the two needs this.
const { mockGetUser, mockLogError } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: mockLogError }));

import { GET } from './route';

const req = (lat = '6.24', lon = '-75.58') => new Request(`http://localhost/api/geocode?lat=${lat}&lon=${lon}`);

/** Every Google reply below is HTTP 200. That is the whole point. */
const googleSays = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY = 'test-key';
});

describe('/api/geocode reports Google failures instead of caching them', () => {
  it('REQUEST_DENIED is a 502, is logged, and is NOT cached', async () => {
    vi.stubGlobal(
      'fetch',
      googleSays({ status: 'REQUEST_DENIED', error_message: 'referer restrictions', results: [] })
    );

    const res = await GET(req());

    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockLogError).toHaveBeenCalled();
    // The reason must survive into the log, or the outage is still invisible.
    expect(JSON.stringify(mockLogError.mock.calls)).toContain('REQUEST_DENIED');
  });

  it('OVER_QUERY_LIMIT is a 502, is logged, and is NOT cached', async () => {
    vi.stubGlobal('fetch', googleSays({ status: 'OVER_QUERY_LIMIT', results: [] }));

    const res = await GET(req());

    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(mockLogError.mock.calls)).toContain('OVER_QUERY_LIMIT');
  });

  it('a failure never returns display_name, which is what made it look successful', async () => {
    vi.stubGlobal('fetch', googleSays({ status: 'REQUEST_DENIED', results: [] }));
    const body = await (await GET(req())).json();
    expect(body).not.toHaveProperty('display_name');
  });

  /** ZERO_RESULTS is a real answer -- Google looked, and there is nothing
   *  there. It is the only empty result worth caching, and it must NOT be
   *  logged as an error or the logs fill with non-problems. */
  it('ZERO_RESULTS is a cached 200 with a null name, and is not an error', async () => {
    vi.stubGlobal('fetch', googleSays({ status: 'ZERO_RESULTS', results: [] }));

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.display_name).toBeNull();
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400');
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('OK returns the formatted address and is cached', async () => {
    vi.stubGlobal('fetch', googleSays({ status: 'OK', results: [{ formatted_address: 'El Poblado, Medellín' }] }));

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.display_name).toBe('El Poblado, Medellín');
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400');
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('a missing status field is treated as a failure, not as an empty success', async () => {
    vi.stubGlobal('fetch', googleSays({ results: [] }));
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('a non-200 from Google is a 500 and is not cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('still refuses unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.stubGlobal('fetch', googleSays({ status: 'OK', results: [] }));
    expect((await GET(req())).status).toBe(401);
  });
});

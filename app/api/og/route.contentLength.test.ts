import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/og must return a BUFFERED response with an explicit Content-Length.
 *
 * THE REGRESSION THIS GUARDS. next/og's ImageResponse wraps its body in a
 * ReadableStream unconditionally, so the response carried no Content-Length,
 * advertised no Accept-Ranges, and answered a Range request with a full 200
 * rather than a 206. Meta's fetcher read that as "Corrupted Image" and WhatsApp
 * rendered bare link text on every share route -- every instructor bio link,
 * every gym page, every session share.
 *
 * The bytes were never malformed: the live responses CRC-validated chunk by
 * chunk and inflated to exactly 1200*630*4 + 630 filter bytes. Proved by
 * experiment rather than inference -- a byte-identical PNG served as a static
 * file from public/ scraped clean and rendered a full card on the same route,
 * same domain, same headers, with the serving path as the only variable.
 *
 * So the assertion here is on the FRAMING, not the pixels: does the response
 * declare its own length, and does it still carry the content-type and
 * cache-control the ImageResponse set.
 */

/** Byte payload the fake ImageResponse streams, so the length is known exactly. */
const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

const CACHE_CONTROL = 'public, no-transform, max-age=3600, s-maxage=31536000, stale-while-revalidate=604800';

/**
 * Stand-in for next/og's ImageResponse: a Response whose body is a
 * ReadableStream and which therefore declares NO Content-Length -- the exact
 * shape the real one produces. If the route stops buffering, this is what
 * reaches the caller and the assertions below fail.
 */
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(_element: unknown, options?: { headers?: Record<string, string> }) {
      const stream = new ReadableStream({
        start(controller) {
          // Two chunks on purpose: a single-chunk stream could be buffered by
          // accident, two cannot.
          controller.enqueue(FAKE_PNG.subarray(0, 8));
          controller.enqueue(FAKE_PNG.subarray(8));
          controller.close();
        },
      });
      super(stream, {
        headers: { 'content-type': 'image/png', ...(options?.headers ?? {}) },
      });
    }
  },
}));

import { GET } from './route';

function req(query: string): NextRequest {
  return new NextRequest(`https://tribe-v3.vercel.app/api/og/?${query}`);
}

describe('GET /api/og — buffered response with Content-Length', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declares a Content-Length header', async () => {
    const res = await GET(req('type=default'));
    expect(res.headers.get('content-length')).not.toBeNull();
  });

  it('Content-Length equals the actual byte length of the body', async () => {
    const res = await GET(req('type=default'));
    const declared = Number(res.headers.get('content-length'));
    const actual = (await res.arrayBuffer()).byteLength;

    expect(actual).toBe(FAKE_PNG.byteLength);
    expect(declared).toBe(actual);
  });

  it('preserves the content-type from the ImageResponse', async () => {
    const res = await GET(req('type=default'));
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('preserves the Cache-Control the route sets', async () => {
    const res = await GET(req('type=achievement&title=Streak&emoji=%F0%9F%8F%86'));
    expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL);
  });

  it('buffers every card type, not just the default one', async () => {
    // achievement and default are the two branches that take no network path,
    // so they exercise the wrapper without needing a fetch mock. Both must be
    // buffered -- the wrapper sits on GET, so a branch that bypassed it would
    // show up here as a missing header.
    for (const q of ['type=default', 'type=achievement&title=x', 'type=nonsense-falls-through']) {
      const res = await GET(req(q));
      expect(res.headers.get('content-length'), q).toBe(String(FAKE_PNG.byteLength));
    }
  });
});

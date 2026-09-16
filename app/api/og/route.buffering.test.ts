import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/og buffers the ImageResponse body before returning.
 *
 * ⚠ THIS FILE PREVIOUSLY ASSERTED SOMETHING FALSE. It checked that the response
 * carries a Content-Length header, and it went green — because Node's undici
 * lets Headers.set('Content-Length', …) through in-process. In production it
 * does not happen: Content-Length is a FORBIDDEN HEADER NAME in the Fetch API,
 * Headers.set on it is silently ignored, and Vercel's edge frames the body as
 * Transfer-Encoding: chunked regardless.
 *
 * Measured on the deployed fix, on a fresh cache MISS, forced to HTTP/1.1, on
 * the smallest card (type=default, 10,988 bytes): Transfer-Encoding: chunked,
 * no Content-Length. So the old test asked a fair question about a scenario
 * that cannot occur where it matters — a green test guarding nothing.
 *
 * WHAT IS ACTUALLY TRUE, and what this file now asserts: the route drains the
 * ImageResponse stream to completion before returning, so the response body is
 * a fully-realised buffer rather than a pass-through of the renderer's stream.
 * That changes delivery TIMING — bytes leave only once the render has finished
 * — and nothing else observable.
 *
 * WHETHER THAT MATTERS IS UNESTABLISHED. It is not known to fix link previews
 * and must not be described as doing so. The measured defect is elsewhere: the
 * session card is 1,413,383 bytes and takes 5.3–11.2s to generate cold, against
 * 0.59s for a warm hit, and a scraper's first fetch is always cold.
 */

/** Payload the fake ImageResponse streams, in two chunks. */
const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

const CACHE_CONTROL = 'public, no-transform, max-age=3600, s-maxage=31536000, stale-while-revalidate=604800';

/** Set by the mock when the upstream stream has been read to completion. */
let streamFullyRead = false;

/**
 * Stand-in for next/og's ImageResponse: a Response whose body is a
 * ReadableStream, which is what the real one always produces (the wrapping in
 * next/dist/server/og/image-response.js sits outside the runtime branch).
 *
 * Two chunks on purpose: a single-chunk stream could be drained by accident.
 * The close() callback records that the consumer pulled everything, which is
 * the property under test.
 */
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(_element: unknown, options?: { headers?: Record<string, string> }) {
      const stream = new ReadableStream({
        async pull(controller) {
          // Emit both chunks then close, marking the stream fully consumed.
          controller.enqueue(FAKE_PNG.subarray(0, 8));
          controller.enqueue(FAKE_PNG.subarray(8));
          streamFullyRead = true;
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

describe('GET /api/og — buffers before returning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamFullyRead = false;
  });

  it('drains the renderer stream BEFORE the response is returned', async () => {
    expect(streamFullyRead).toBe(false);
    await GET(req('type=default'));
    // If the route passed the ImageResponse straight through, nothing would
    // have read the stream yet at this point.
    expect(streamFullyRead).toBe(true);
  });

  it('returns a different Response object, not the ImageResponse itself', async () => {
    const res = await GET(req('type=default'));
    // A pass-through would still be an ImageResponse with an unread body.
    expect(res.bodyUsed).toBe(false);
    expect(res.constructor.name).toBe('Response');
  });

  it('delivers the complete payload', async () => {
    const res = await GET(req('type=default'));
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(FAKE_PNG.byteLength);
    expect(Array.from(body)).toEqual(Array.from(FAKE_PNG));
  });

  it('preserves the content-type from the ImageResponse', async () => {
    const res = await GET(req('type=default'));
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('preserves the Cache-Control the route sets', async () => {
    const res = await GET(req('type=achievement&title=Streak&emoji=%F0%9F%8F%86'));
    expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL);
  });

  it('buffers every card branch, not just the default one', async () => {
    // achievement, default and the fall-through are the branches that take no
    // network path, so they exercise the wrapper without a fetch mock. The
    // wrapper sits on GET, so a branch bypassing it would show up here.
    for (const q of ['type=default', 'type=achievement&title=x', 'type=nonsense-falls-through']) {
      streamFullyRead = false;
      await GET(req(q));
      expect(streamFullyRead, q).toBe(true);
    }
  });

  // DELIBERATELY NOT TESTED: that the response carries a Content-Length.
  // That is the assertion this file used to make and it was false in
  // production — see the header comment. Node's undici may surface the header
  // in-process, so such a test would pass while proving nothing about what a
  // scraper receives. If you find yourself adding it back, read the header
  // comment first.
});

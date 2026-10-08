import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/admin/qr (T-GROW1 part G).
 *
 * THE ARM THIS FILE EXISTS FOR IS THE FOREIGN ORIGIN.
 *
 * A QR is the one medium where nobody can read the destination before acting on
 * it. An endpoint on Tribe's own domain that encodes any string a caller sends is
 * a tool for printing a Tribe-branded code that opens somewhere else, and the
 * person scanning it has no way to tell. That is a much bigger problem than the
 * CPU cost the admin gate is protecting, and it is why the URL is parsed,
 * compared against this deployment's own origin, and then REBUILT from its parts
 * rather than echoed.
 *
 * The gate matters for a smaller reason, stated plainly: the output is not
 * secret, it encodes a public URL. The gate stops an unauthenticated caller from
 * making a Vercel function do QR encoding on demand.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/adminApi', () => ({ requireApiAdmin: vi.fn() }));
vi.mock('@/lib/qr/renderQrSvg', () => ({ renderQrSvg: vi.fn(() => '<svg>stub</svg>') }));

import { GET } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { renderQrSvg } from '@/lib/qr/renderQrSvg';

const ORIGIN = 'https://tribe-v3.vercel.app';

function request(url: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/admin/qr?url=${encodeURIComponent(url)}`);
}

/** What was actually handed to the encoder. */
function encoded(): string {
  return vi.mocked(renderQrSvg).mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: {} } as never);
});

describe('GET /api/admin/qr', () => {
  it('returns an SVG for a link on this origin', async () => {
    const res = await GET(request(`${ORIGIN}/pase/bullbox/?src=ig&code=IG-REEL-01`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(await res.text()).toBe('<svg>stub</svg>');
    expect(encoded()).toBe(`${ORIGIN}/pase/bullbox/?src=ig&code=IG-REEL-01`);
  });

  it('NEVER REACHES the encoder when the caller is not an admin', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const res = await GET(request(`${ORIGIN}/pase/bullbox/`));
    expect(res.status).toBe(403);
    // The gate exists to stop the CPU work, so "refused after encoding" would
    // defeat the point of it.
    expect(renderQrSvg).not.toHaveBeenCalled();
  });

  it('REFUSES a URL on another origin', async () => {
    for (const url of [
      'https://evil.example.com/phish',
      'http://tribe-v3.vercel.app.evil.com/',
      'https://tribe-v3.vercel.app.evil.com/pase/bullbox/',
      // A different scheme on the same host is a different origin, and
      // downgrading to http on a printed code is not something to help with.
      'http://tribe-v3.vercel.app/pase/bullbox/',
    ]) {
      vi.clearAllMocks();
      vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: {} } as never);
      const res = await GET(request(url));
      expect(res.status, url).toBe(400);
      expect(renderQrSvg, url).not.toHaveBeenCalled();
    }
  });

  it('refuses a non-URL, an empty url and an absurdly long one', async () => {
    for (const url of ['', 'not a url', '/pase/bullbox/', 'javascript:alert(1)', `${ORIGIN}/${'x'.repeat(600)}`]) {
      vi.clearAllMocks();
      vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: {} } as never);
      const res = await GET(request(url));
      expect(res.status, url).toBe(400);
      expect(renderQrSvg, url).not.toHaveBeenCalled();
    }
  });

  it('REBUILDS the url from its parts, so a fragment or credentials cannot ride along', async () => {
    await GET(request(`${ORIGIN}/pase/bullbox/?src=ig#fragment`));
    // What is encoded is what was validated. A fragment is never sent to a
    // server, so a QR carrying one encodes something the attribution path will
    // never see -- and credentials in a URL are worse.
    expect(encoded()).toBe(`${ORIGIN}/pase/bullbox/?src=ig`);
    expect(encoded()).not.toContain('#');
  });

  it('is cacheable but PRIVATE, because it sits behind an admin gate', async () => {
    const res = await GET(request(`${ORIGIN}/pase/bullbox/`));
    const cc = res.headers.get('cache-control') ?? '';
    // The QR for a URL never changes, so immutable is right -- but a shared cache
    // must not hold a response that required an admin session to obtain.
    expect(cc).toContain('private');
    expect(cc).toContain('immutable');
    expect(cc).not.toContain('public');
  });

  it('serves the SVG with the headers that stop it being an XSS surface', async () => {
    const res = await GET(request(`${ORIGIN}/pase/bullbox/`));
    // An SVG is a document, and a browser rendering one inline will run script
    // in it. renderQrSvg emits only a rect and a path today; these headers mean a
    // future change to it cannot quietly turn this endpoint into a vector.
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers 500 and logs when the encoder throws', async () => {
    vi.mocked(renderQrSvg).mockImplementation(() => {
      throw new Error('qr exploded');
    });
    const res = await GET(request(`${ORIGIN}/pase/bullbox/`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('exploded');
  });
});

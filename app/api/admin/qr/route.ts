/**
 * GET /api/admin/qr?url=...
 *
 * T-GROW1 part G. Returns an SVG QR for a tracked link. Admin only.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THERE IS A ROUTE AT ALL, RATHER THAN RENDERING IN THE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * lib/qr/renderQrSvg.ts carries `import 'server-only'`, so importing it from a
 * client component is a BUILD error, not a runtime surprise. That is deliberate
 * (T-AV23 D9): the bundle check in supabase/recon/t-av23-proof.LOCAL.sh greps
 * .next/static for the library's own string literals and expects zero, with
 * .next/server as the positive control. Pulling qrcode-generator into the client
 * bundle to save a round trip would break a guard that exists for a reason, and
 * the reason is bundle size on a phone in a gym.
 *
 * So the server renders the SVG and the browser turns it into a PNG. The spec's
 * part G asks for "a QR as a downloadable PNG" and also says, explicitly, not to
 * add an npm dependency for it: the conversion is canvas plus a data URL, which
 * every browser this app supports already has.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY ADMIN-GATED, WHEN A QR OF A PUBLIC URL IS NOT A SECRET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The output is not sensitive -- it encodes a URL anybody could type. The gate is
 * not protecting the output, it is protecting the SERVER: QR encoding is real CPU
 * work on a Vercel function, and an ungated endpoint that does CPU work on a
 * caller-supplied string is a free amplifier. requireApiAdmin() is the cheapest
 * correct answer and this endpoint has exactly one caller, the Origen tab.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT WILL ENCODE, AND WHAT IT REFUSES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Only a URL on THIS origin. Not a convenience check -- a QR generator that
 * encodes any string a caller sends is a tool for making Tribe's own domain
 * print a code that opens somewhere else, and a QR is precisely the medium where
 * nobody can read the destination before scanning it. The URL is rebuilt from
 * its parsed parts rather than echoed, so what gets encoded is what was
 * validated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { logError } from '@/lib/logger';
import { renderQrSvg } from '@/lib/qr/renderQrSvg';
import { publicOrigin } from '@/lib/http/publicOrigin';

/** Long enough for any link the builder emits, short enough to bound the work. */
const MAX_URL_LEN = 512;

export async function GET(request: NextRequest) {
  // GATE FIRST. Nothing is parsed and no CPU is spent until the caller is a
  // confirmed admin.
  const gate = await requireApiAdmin();
  if (!gate.ok) return gate.response;

  try {
    const raw = request.nextUrl.searchParams.get('url') ?? '';
    if (raw.length === 0 || raw.length > MAX_URL_LEN) {
      return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
    }

    /**
     * SAME ORIGIN ONLY.
     *
     * publicOrigin(request) is the origin a phone can actually reach, which on a
     * LAN during device testing is not request.url's localhost -- the same reason
     * T-AV29 introduced it for the voucher QR. Comparing against it rather than
     * against a hardcoded host means this works on the preview, on production and
     * on a Mac serving a phone over wifi, without an allowlist to keep current.
     */
    const origin = publicOrigin(request);
    if (parsed.origin !== new URL(origin).origin) {
      return NextResponse.json({ error: 'foreign_origin' }, { status: 400 });
    }

    // Rebuilt from the parsed parts, never echoed. What is encoded is what was
    // validated, so a fragment or credentials in the input cannot ride along.
    const encoded = `${parsed.origin}${parsed.pathname}${parsed.search}`;
    const svg = renderQrSvg(encoded, `Código QR de ${parsed.pathname}`);

    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        // The QR for a given URL is the same forever, so it is immutable -- but
        // PRIVATE, because the response sits behind an admin gate and must not be
        // held by a shared cache that does not know that.
        'Cache-Control': 'private, max-age=86400, immutable',
        // Belt and braces on an endpoint that returns markup: an SVG is a
        // document, and a browser that renders it inline would run script in it.
        // This one contains only a rect and a path, and this header means a
        // future change to renderQrSvg cannot turn that into an XSS surface.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logError(error, { route: '/api/admin/qr', action: 'GET' });
    return NextResponse.json({ error: 'qr_failed' }, { status: 500 });
  }
}

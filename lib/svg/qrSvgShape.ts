/**
 * The one rule for "may this QR string be injected as markup".
 *
 * lib/qr/renderQrSvg.ts (server-only) builds QR codes as SVG strings; they
 * reach client components as plain strings (the /api/pase response and
 * sessionStorage for the voucher, T-AV23; server props for the athlete link,
 * T-AV24). A client component injects one ONLY when it has exactly the shape
 * the renderer produces: an svg of one rect and one path of M/h/v/z commands,
 * nothing else. Anything else renders nothing.
 *
 * Lives outside lib/qr on purpose: lib/qr/renderQrSvg.test.ts fails if any
 * "use client" file imports from lib/qr, and this check is what client
 * components are meant to import.
 */
const RENDERED_QR_SVG_SHAPE =
  /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+" role="img" aria-label="[^"<>]*" shape-rendering="crispEdges"><rect width="\d+" height="\d+" fill="#ffffff"\/><path d="[Mhvz0-9 -]*" fill="#000000"\/><\/svg>$/;

export function isRenderedQrSvg(svg: string): boolean {
  return RENDERED_QR_SVG_SHAPE.test(svg);
}

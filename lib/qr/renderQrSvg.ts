import 'server-only';
import qrcode from 'qrcode-generator';

/**
 * T-AV23 (D9). A QR code as an SVG string, rendered on the SERVER only.
 *
 * `server-only` makes a client import a build error, and the bundle check in
 * supabase/recon/t-av23-proof.LOCAL.sh greps .next/static for the library's
 * own string literals (0 expected) with .next/server as the positive control.
 * The client receives a finished SVG string and never this module.
 *
 * The markup is built here from the library's module matrix rather than with
 * its createSvgTag(): that emits a non-SVG <description> element with a fixed
 * id (two QRs on a page would collide) and inserts the label unescaped. The
 * library does the encoding; the markup is ours.
 */

/** Quiet zone, in modules. The QR spec asks for four. */
export const QR_QUIET_ZONE = 4;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * @param data  what the code encodes (here, the absolute /pase/verificar URL)
 * @param label the accessible name, e.g. "Código QR del pase BU-4F7K"
 */
export function renderQrSvg(data: string, label: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + QR_QUIET_ZONE * 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" ` +
    `aria-label="${escapeXml(label)}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/></svg>`
  );
}

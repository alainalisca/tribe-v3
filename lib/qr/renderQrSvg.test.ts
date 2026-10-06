/**
 * T-AV23 (D9): the voucher QR renderer, and the guarantee that it stays on
 * the server.
 *
 * No QR decoder is installed, so, as the ticket allows, this asserts the
 * module count and dimensions for a known input plus the three finder
 * patterns, rather than decoding. The runtime proof that it never reaches a
 * browser is the build check in supabase/recon/t-av23-proof.LOCAL.sh.
 */
import { describe, it, expect, vi } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

vi.mock('server-only', () => ({})); // the real module throws outside a server bundle, by design

import { renderQrSvg, QR_QUIET_ZONE } from './renderQrSvg';
import { isVoucherSvg } from '@/app/pase/[slug]/VoucherQr';
import { sourceWithoutComments } from '@/lib/testing/sourceWithoutComments';

const URL_IN = 'https://tribe-v3.vercel.app/pase/verificar/BU-4F7K/';

function darkSquares(svg: string): Set<string> {
  const d = /<path d="([^"]*)"/.exec(svg)?.[1] ?? '';
  return new Set([...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => `${m[1]},${m[2]}`));
}

describe('renderQrSvg', () => {
  const svg = renderQrSvg(URL_IN, 'Código QR del pase BU-4F7K');
  const q = QR_QUIET_ZONE;

  it('this URL is a version 4 code: 33 modules, plus a 4-module quiet zone each side', () => {
    expect(svg).toContain('viewBox="0 0 41 41"');
  });

  it('draws the three finder patterns and no fourth', () => {
    const dark = darkSquares(svg);
    const at = (col: number, row: number) => dark.has(`${col + q},${row + q}`);
    // A finder: a dark 7x7 border, a light ring inside it, a dark 3x3 core.
    const isFinder = (c: number, r: number) => {
      for (let i = 0; i < 7; i++) {
        if (!at(c + i, r) || !at(c + i, r + 6) || !at(c, r + i) || !at(c + 6, r + i)) return false;
      }
      for (let i = 1; i < 6; i++) {
        if (at(c + i, r + 1) || at(c + i, r + 5) || at(c + 1, r + i) || at(c + 5, r + i)) return false;
      }
      for (let i = 2; i < 5; i++) for (let j = 2; j < 5; j++) if (!at(c + i, r + j)) return false;
      return true;
    };
    expect(dark.size).toBeGreaterThan(300);
    expect([isFinder(0, 0), isFinder(26, 0), isFinder(0, 26)]).toEqual([true, true, true]);
    expect(isFinder(26, 26)).toBe(false);
  });

  it('is labelled for a screen reader, with the label escaped', () => {
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Código QR del pase BU-4F7K"');
    expect(renderQrSvg('x', 'a "b" <c> & d')).toContain('aria-label="a &quot;b&quot; &lt;c&gt; &amp; d"');
  });

  it('is exactly the shape the client will agree to inject', () => {
    expect(isVoucherSvg(svg)).toBe(true);
  });
});

describe('the client refuses anything that is not a renderQrSvg SVG', () => {
  it('rejects script, event handlers, foreign elements and extra markup', () => {
    const good = renderQrSvg(URL_IN, 'Código QR del pase BU-4F7K');
    expect(isVoucherSvg(good.replace('<path', '<path onload="alert(1)"'))).toBe(false);
    expect(isVoucherSvg(good.replace('</svg>', '<script>alert(1)</script></svg>'))).toBe(false);
    expect(isVoucherSvg(good.replace('fill="#000000"/>', 'fill="#000000"/><image href="x"/>'))).toBe(false);
    expect(isVoucherSvg('<img src=x onerror=alert(1)>')).toBe(false);
    expect(isVoucherSvg('')).toBe(false);
  });
});

describe('renderQrSvg never reaches a client component', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (name === 'node_modules' || name.startsWith('.')) return [];
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });
  }
  const files = ['app', 'components', 'lib', 'contexts', 'hooks'].flatMap((d) => {
    try {
      return sourceFiles(d);
    } catch {
      return []; // a directory this repo does not have
    }
  });
  const clientFiles = files.filter((f) => /^\s*['"]use client['"]/.test(sourceWithoutComments(f)));

  it('NON-VACUITY: the scan sees client components, including the pass form', () => {
    expect(clientFiles.length).toBeGreaterThan(50);
    expect(clientFiles).toContain(path.join('app', 'pase', '[slug]', 'PaseForm.tsx'));
  });

  it('no "use client" file imports lib/qr or qrcode-generator', () => {
    const offenders = clientFiles.filter((f) =>
      /from ['"](@\/lib\/qr|\.\.?\/[^'"]*qr\/|qrcode-generator)/.test(sourceWithoutComments(f))
    );
    expect(offenders).toEqual([]);
  });

  it('the renderer is marked server-only as its first statement', () => {
    expect(sourceWithoutComments('lib/qr/renderQrSvg.ts').trimStart()).toMatch(/^import ['"]server-only['"];/);
  });
});

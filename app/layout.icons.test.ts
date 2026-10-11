/**
 * The favicon set must be real files at the sizes the page head claims.
 *
 * WHY. Until this test, the head declared only 16px and 32px icons and
 * /favicon.ico returned 404 in production. Google Search shows a site's icon
 * only when one is a multiple of 48px, so every tribelatam.com result showed a
 * generic globe instead of the Tribe mark, and nothing reported it: a missing
 * or mis-sized icon is not a build error, not a type error and not a failing
 * request any user sees.
 *
 * HOW. Reads app/layout.tsx as text and takes every `{ url, sizes }` icon entry.
 * For each it asserts the file exists under public/ and that the PNG header's
 * width and height equal the declared size, so a declaration cannot drift from
 * the file it points at. Then it asserts at least one icon is a multiple of 48,
 * and that public/favicon.ico exists and contains a 48px image.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const LAYOUT = fs.readFileSync(path.join(ROOT, 'app', 'layout.tsx'), 'utf-8');

interface DeclaredIcon {
  url: string;
  size: number;
}

/** Every `{ url: '/x.png', sizes: 'NxN' ... }` entry in `src`. */
export function declaredIcons(src: string): DeclaredIcon[] {
  const out: DeclaredIcon[] = [];
  const re = /\{\s*url:\s*'([^']+)',\s*sizes:\s*'(\d+)x(\d+)'/g;
  for (const m of src.matchAll(re)) {
    if (m[2] !== m[3]) throw new Error(`non-square icon declared: ${m[0]}`);
    out.push({ url: m[1], size: Number(m[2]) });
  }
  return out;
}

/** Width and height from a PNG's IHDR chunk, which always starts at byte 16. */
function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(1, 4).toString('ascii'), 'not a PNG').toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Image sizes inside an .ico (ICONDIR, then 16-byte entries; 0 means 256). */
function icoSizes(buf: Buffer): number[] {
  expect(buf.readUInt16LE(2), 'not an .ico').toBe(1);
  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => buf[6 + i * 16] || 256);
}

describe('favicon set (layout icons point at real files of the declared size)', () => {
  const icons = declaredIcons(LAYOUT);

  it('read the declarations, not an empty list', () => {
    // A parser that finds nothing passes every assertion below.
    expect(icons.length).toBeGreaterThanOrEqual(3);
  });

  it('every declared icon exists at exactly its declared size', () => {
    for (const { url, size } of icons) {
      const file = path.join(ROOT, 'public', url);
      expect(fs.existsSync(file), `${url} is declared in app/layout.tsx but missing from public/`).toBe(true);
      const { w, h } = pngSize(fs.readFileSync(file));
      expect({ url, w, h }).toEqual({ url, w: size, h: size });
    }
  });

  it('declares at least one icon Google Search will use (a multiple of 48px)', () => {
    expect(icons.some(({ size }) => size % 48 === 0)).toBe(true);
  });

  it('serves /favicon.ico with a 48px image for crawlers that fetch it directly', () => {
    const file = path.join(ROOT, 'public', 'favicon.ico');
    expect(fs.existsSync(file), 'public/favicon.ico is missing; /favicon.ico would 404').toBe(true);
    expect(icoSizes(fs.readFileSync(file))).toContain(48);
  });

  describe('the parser reads the shape layout.tsx uses', () => {
    it('finds entries across lines and ignores non-icon objects', () => {
      const src = [
        'icon: [',
        "  { url: '/a-16.png', sizes: '16x16', type: 'image/png' },",
        "  {\n    url: '/a-48.png',\n    sizes: '48x48' },",
        '],',
        "images: [{ url: '/api/og', width: 1200, height: 630 }],",
      ].join('\n');
      expect(declaredIcons(src)).toEqual([
        { url: '/a-16.png', size: 16 },
        { url: '/a-48.png', size: 48 },
      ]);
    });
  });
});

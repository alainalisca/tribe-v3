/**
 * T-OG2, the call-site guard.
 *
 * The route returns a PNG, so no behaviour test can read back which letters it
 * drew. The defect lived in one expression, `initials(p.headline, 2)` in the
 * split card's hero, so the instrument that can see it is a source assertion,
 * the same shape as components/dashboard/StorefrontEditor.callsite.test.ts.
 * splitMonogram's own rule is covered in lib/og/monogram.test.ts.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = fs.readFileSync(path.join(__dirname, 'route.tsx'), 'utf-8');

/** The renderSplit function's body, as written. */
function renderSplitBody(): string {
  const start = SRC.indexOf('async function renderSplit(');
  expect(start, 'renderSplit is gone; re-aim this guard').toBeGreaterThan(-1);
  const next = SRC.indexOf('\nasync function ', start + 1);
  const nextFn = SRC.indexOf('\nfunction ', start + 1);
  const ends = [next, nextFn].filter((i) => i > start);
  return SRC.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('/api/og split card initials (T-OG2)', () => {
  it('draws the hero initials from the monogram, not from the headline', () => {
    const body = renderSplitBody();
    expect(body).toContain('splitMonogram(p.monogram, p.headline)');
    // The exact original expression, so restoring it is the failing mutation.
    expect(body).not.toMatch(/initials\w*\(\s*p\.headline/);
  });

  it('passes the monogram query param through to renderSplit', () => {
    expect(SRC).toMatch(/const monogram = searchParams\.get\('monogram'\)/);
    const call = SRC.slice(SRC.indexOf('return renderSplit({'), SRC.indexOf('return renderSplit({') + 400);
    expect(call).toMatch(/\bmonogram\b/);
  });

  it('carries no private copy of the initials rule', () => {
    // The local helper took each word's first CHARACTER ("B(" for "BullBox
    // (Prueba)"). lib/text/initials.ts is the one rule.
    expect(SRC).not.toMatch(/function initials\s*\(/);
  });
});

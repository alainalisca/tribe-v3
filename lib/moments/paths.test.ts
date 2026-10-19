import { describe, it, expect } from 'vitest';
import { momentAllPaths, momentOriginalPath, momentVariantPath } from './paths';

const S = 'CFCAFAD0-80EC-43EA-A018-EAFCF99C8648';
const M = '11111111-2222-4333-8444-555555555555';

describe('moment paths (T-MOM1)', () => {
  it('original at <session>/<media>.jpg, variants beside it', () => {
    const p = momentOriginalPath(S, M);
    expect(p).toBe(`${S.toLowerCase()}/${M}.jpg`);
    expect(momentVariantPath(p, 'viewer')).toBe(`${p}.1200.webp`);
    expect(momentVariantPath(p, 'grid')).toBe(`${p}.400.webp`);
    expect(momentVariantPath(p, 'original')).toBe(p);
    expect(momentAllPaths(p)).toHaveLength(3);
  });

  it('refuses anything but two UUIDs (no path tricks)', () => {
    expect(() => momentOriginalPath('../x', M)).toThrow();
    expect(() => momentOriginalPath(S, 'a/b')).toThrow();
  });
});

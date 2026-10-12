import { describe, it, expect } from 'vitest';
import { generateLeadRefCode, LEAD_REF_CODE_ALPHABET, LEAD_REF_CODE_RE } from './leadRefCode';
import { PASS_CODE_ALPHABET } from '@/lib/pase/passCode';

describe('generateLeadRefCode', () => {
  it('uses exactly the pass-code alphabet (declared separately, so pinned here)', () => {
    expect(LEAD_REF_CODE_ALPHABET).toBe(PASS_CODE_ALPHABET);
  });

  it('always matches migration 215 CHECK, at both ends of the random range', () => {
    for (const r of [0, 0.5, 0.999999]) expect(generateLeadRefCode(() => r)).toMatch(LEAD_REF_CODE_RE);
    for (let i = 0; i < 500; i++) expect(generateLeadRefCode()).toMatch(LEAD_REF_CODE_RE);
  });

  it('the shape regex refuses 0, O, 1, I and the wrong length', () => {
    for (const bad of ['KQ7M20', 'KQ7M2O', 'KQ7M21', 'KQ7M2I', 'KQ7M2', 'KQ7M2ZZ', 'kq7m2z']) {
      expect(bad).not.toMatch(LEAD_REF_CODE_RE);
    }
  });
});

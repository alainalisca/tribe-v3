import { describe, it, expect } from 'vitest';
import { partnerMonogram, partnerTypeLabelKey, partnerCtaLabelKey } from './partnerIdentity';

describe('partnerMonogram', () => {
  it('takes the first letter of the first two words', () => {
    expect(partnerMonogram('CrossFit BullBox')).toBe('CB');
    expect(partnerMonogram('Entrenamiento Cross Training funcional')).toBe('EC');
  });

  it('handles a one-word name and stray whitespace', () => {
    expect(partnerMonogram('BullBox')).toBe('B');
    expect(partnerMonogram('  Marce   Anahata  ')).toBe('MA');
  });

  it('is empty for an empty name rather than throwing', () => {
    expect(partnerMonogram('')).toBe('');
  });
});

describe('partnerTypeLabelKey', () => {
  it('labels gyms and studios', () => {
    expect(partnerTypeLabelKey('gym')).toBe('typeGym');
    expect(partnerTypeLabelKey('studio')).toBe('typeStudio');
  });

  it('gives an independent partner NO type line', () => {
    // An 'independent' partner is a person. Calling them a Gimnasio is wrong,
    // which is why this returns null rather than defaulting to typeGym.
    expect(partnerTypeLabelKey('independent')).toBeNull();
    expect(partnerTypeLabelKey(null)).toBeNull();
    expect(partnerTypeLabelKey(undefined)).toBeNull();
  });
});

describe('partnerCtaLabelKey', () => {
  it('says "view studio" only for a studio, and "view gym" otherwise', () => {
    // Preserves exactly the inline ternary this replaced in the feed banner.
    expect(partnerCtaLabelKey('studio')).toBe('viewStudio');
    expect(partnerCtaLabelKey('gym')).toBe('viewGym');
    expect(partnerCtaLabelKey('independent')).toBe('viewGym');
    expect(partnerCtaLabelKey(null)).toBe('viewGym');
  });
});

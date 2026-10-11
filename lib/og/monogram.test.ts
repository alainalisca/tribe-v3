import { describe, it, expect } from 'vitest';
import { splitMonogram } from './monogram';

describe('splitMonogram', () => {
  it("draws the partner's letters, not the headline's (the T-OG2 case)", () => {
    // Measured 2026-10-10 on the TEST partner: page "TT", WhatsApp card "TP".
    expect(splitMonogram('TEST Tribe pass (not a real gym)', 'Tu primera clase gratis')).toBe('TT');
    expect(splitMonogram('CrossFit BullBox', 'Tu primera clase gratis')).toBe('CB');
  });

  it('falls back to the headline for an old URL without the param', () => {
    expect(splitMonogram('', 'Tu primera clase gratis')).toBe('TP');
    expect(splitMonogram('   ', 'Zona de Combate')).toBe('ZD');
  });

  it('skips words with no letter, which the route\'s old copy did not ("B(")', () => {
    expect(splitMonogram('BullBox (Prueba)', 'x')).toBe('BP');
    expect(splitMonogram('24/7 Fitness', 'x')).toBe('F');
  });
});

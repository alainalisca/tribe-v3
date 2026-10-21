import { describe, it, expect } from 'vitest';
import { isSportOnlyTitle, publicSessionTitle } from './sessionPublic';

/** A title that only repeats the sport, folded like hostFirstName (T-POLISH1). */
describe('isSportOnlyTitle', () => {
  it('matches the sport key and its Spanish and English names, ignoring case and accents', () => {
    expect(isSportOnlyTitle('HYROX', 'HYROX')).toBe(true);
    expect(isSportOnlyTitle('hyrox', 'HYROX')).toBe(true);
    expect(isSportOnlyTitle('Boxeo', 'Boxing')).toBe(true);
    expect(isSportOnlyTitle('BOXING', 'Boxing')).toBe(true);
    expect(isSportOnlyTitle('  correr ', 'Running')).toBe(true);
  });

  it('a real title, no title, no sport or "Other" is not sport-only', () => {
    expect(isSportOnlyTitle('Boxeo funcional', 'Boxing')).toBe(false);
    expect(isSportOnlyTitle(null, 'Boxing')).toBe(false);
    expect(isSportOnlyTitle('', 'Boxing')).toBe(false);
    expect(isSportOnlyTitle('Boxeo', null)).toBe(false);
    expect(isSportOnlyTitle('Other', 'Other')).toBe(false);
  });

  it('feeds the "<Deporte> con <Nombre>" fallback', () => {
    const title = 'Hyrox';
    expect(
      publicSessionTitle(
        { title: isSportOnlyTitle(title, 'HYROX') ? null : title, sport: 'HYROX', creatorName: 'Neera Rao' },
        'es'
      )
    ).toBe('HYROX con Neera');
  });
});

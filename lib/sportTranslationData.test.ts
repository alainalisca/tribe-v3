import { describe, it, expect } from 'vitest';
import { sportTranslations, translateSport } from './sportTranslationData';
import { SPORTS_LIST } from './sports';

describe('translateSport', () => {
  it('translates a known sport to Spanish', () => {
    expect(translateSport('Running', 'es')).toBe('Correr');
  });

  it('returns the English label for English', () => {
    expect(translateSport('Running', 'en')).toBe('Running');
  });

  it('falls back to the raw value for an unknown sport', () => {
    expect(translateSport('Quidditch', 'es')).toBe('Quidditch');
  });

  it('handles null/undefined/empty as empty string', () => {
    expect(translateSport(null, 'es')).toBe('');
    expect(translateSport(undefined, 'en')).toBe('');
    expect(translateSport('', 'es')).toBe('');
  });

  it('translates HYROX to itself in both languages', () => {
    expect(translateSport('HYROX', 'es')).toBe('HYROX');
    expect(translateSport('HYROX', 'en')).toBe('HYROX');
  });
});

// SPORTS_LIST (lib/sports.ts) and sportTranslations (lib/sportTranslationData.ts)
// are separate modules and neither imports the other, so adding a sport to one
// and forgetting the other is the easy mistake. These two assertions fail the
// moment either list drifts.
describe('sport list sync', () => {
  // `All` is a filter-UI pseudo-sport that only sportTranslations carries.
  const translationKeys = Object.keys(sportTranslations).filter((key) => key !== 'All');

  it('has a translation for every sport in SPORTS_LIST', () => {
    const missing = SPORTS_LIST.filter((sport) => !(sport in sportTranslations));
    expect(missing).toEqual([]);
  });

  it('has no translation key that is absent from SPORTS_LIST', () => {
    const extra = translationKeys.filter((key) => !(SPORTS_LIST as readonly string[]).includes(key));
    expect(extra).toEqual([]);
  });
});

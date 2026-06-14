import { describe, it, expect } from 'vitest';
import { translateSport } from './sportTranslationData';

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
});

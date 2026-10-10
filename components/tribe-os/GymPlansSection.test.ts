import { describe, it, expect } from 'vitest';
import {
  inferDurationFromName,
  durationMismatchWarning,
  parsePriceInput,
  formatPriceForInput,
} from './GymPlansSection';

describe('inferDurationFromName', () => {
  it.each([
    ['Mensual', 1],
    ['Plan Bimestral', 2],
    ['Trimestral VIP', 3],
    ['Semestral', 6],
    ['Anual', 12],
    ['ANUAL PREMIUM', 12],
  ])('infers %s → %i months', (name, expected) => {
    expect(inferDurationFromName(name)).toBe(expected);
  });

  it('handles accented keywords (anüal-style diacritics)', () => {
    expect(inferDurationFromName('Plán Anuál')).toBe(12);
  });

  it('defaults to 1 for unknown names', () => {
    expect(inferDurationFromName('Especial')).toBe(1);
    expect(inferDurationFromName('Gold')).toBe(1);
  });
});

describe('durationMismatchWarning', () => {
  it('returns null when name implies 1 (no keyword)', () => {
    expect(durationMismatchWarning('Gold', 3)).toBeNull();
  });

  it('returns null when chosen matches implied', () => {
    expect(durationMismatchWarning('Semestral', 6)).toBeNull();
  });

  it('warns when chosen differs from implied', () => {
    const msg = durationMismatchWarning('Semestral', 3);
    expect(msg).toContain('Semestral');
    expect(msg).toContain('3 meses');
    expect(msg).toContain('6');
  });

  it('singular "mes" for 1 month mismatch', () => {
    const msg = durationMismatchWarning('Trimestral', 1);
    expect(msg).toContain('1 mes?');
    expect(msg).not.toContain('1 meses');
  });
});

describe('parsePriceInput', () => {
  it('converts plain number string to cents', () => {
    expect(parsePriceInput('120000')).toBe(12000000);
  });

  it('strips thousands separators (es-CO dots)', () => {
    expect(parsePriceInput('120.000')).toBe(12000000);
  });

  it('returns 0 for empty string', () => {
    expect(parsePriceInput('')).toBe(0);
  });
});

describe('formatPriceForInput', () => {
  it('formats COP cents to whole with locale separators', () => {
    const result = formatPriceForInput(12000000, 'COP');
    expect(result.replace(/\./g, '').replace(/,/g, '')).toBe('120000');
  });

  it('formats USD cents', () => {
    const result = formatPriceForInput(9999, 'USD');
    expect(result.replace(/,/g, '')).toBe('99');
  });
});

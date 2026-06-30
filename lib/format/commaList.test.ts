import { describe, it, expect } from 'vitest';
import { parseCommaList, formatCommaList } from './commaList';

describe('parseCommaList', () => {
  it('splits a simple comma-separated string', () => {
    expect(parseCommaList('Yoga, HIIT, Boxing')).toEqual(['Yoga', 'HIIT', 'Boxing']);
  });

  it('trims whitespace around items', () => {
    expect(parseCommaList('  Yoga ,  HIIT  ,Boxing ')).toEqual(['Yoga', 'HIIT', 'Boxing']);
  });

  it('filters out empty items (trailing comma, double-comma)', () => {
    expect(parseCommaList('Yoga,')).toEqual(['Yoga']);
    expect(parseCommaList('Yoga,,HIIT')).toEqual(['Yoga', 'HIIT']);
  });

  it('returns empty array for blank input', () => {
    expect(parseCommaList('')).toEqual([]);
    expect(parseCommaList('   ')).toEqual([]);
  });

  it('handles a single item with no comma', () => {
    expect(parseCommaList('NASM-CPT')).toEqual(['NASM-CPT']);
  });
});

describe('formatCommaList', () => {
  it('joins an array with comma-space', () => {
    expect(formatCommaList(['Yoga', 'HIIT', 'Boxing'])).toBe('Yoga, HIIT, Boxing');
  });

  it('returns empty string for empty array', () => {
    expect(formatCommaList([])).toBe('');
  });

  it('round-trips through parseCommaList', () => {
    const items = ['NASM-CPT', 'Yoga RYT-200', 'CrossFit L1'];
    expect(parseCommaList(formatCommaList(items))).toEqual(items);
  });
});

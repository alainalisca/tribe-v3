import { describe, it, expect } from 'vitest';
import { firstName } from './firstName';

describe('firstName (T-UI-SD1)', () => {
  it('is the first word as written', () => {
    expect(firstName('Salomon Tabares Adarve')).toBe('Salomon');
    expect(firstName('  Darian ')).toBe('Darian');
    expect(firstName('María José Pérez')).toBe('María');
  });
  it('is empty when there is no name', () => {
    expect(firstName(null)).toBe('');
    expect(firstName('   ')).toBe('');
  });
});

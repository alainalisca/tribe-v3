import { describe, it, expect } from 'vitest';
import { cancelDate, cancelLang } from './copy';

describe('cancelLang', () => {
  it('English only when the person chose it; everything else is Spanish', () => {
    expect(cancelLang('en')).toBe('en');
    expect(cancelLang('es')).toBe('es');
    expect(cancelLang(null)).toBe('es');
    expect(cancelLang(undefined)).toBe('es');
    expect(cancelLang('pt')).toBe('es');
  });
});

describe('cancelDate', () => {
  it('Spanish: "martes 20 de octubre"; English: "Tuesday, October 20"', () => {
    expect(cancelDate('2026-10-20', 'es')).toBe('martes 20 de octubre');
    expect(cancelDate('2026-10-20', 'en')).toBe('Tuesday, October 20');
  });

  it('an unparseable date comes back as given', () => {
    expect(cancelDate('not-a-date', 'es')).toBe('not-a-date');
  });
});

import { describe, it, expect } from 'vitest';
import { cancelDate } from './copy';

describe('cancelDate', () => {
  it('Spanish: "martes 20 de octubre"; English: "Tuesday, October 20"', () => {
    expect(cancelDate('2026-10-20', 'es')).toBe('martes 20 de octubre');
    expect(cancelDate('2026-10-20', 'en')).toBe('Tuesday, October 20');
  });

  it('an unparseable date comes back as given', () => {
    expect(cancelDate('not-a-date', 'es')).toBe('not-a-date');
  });
});

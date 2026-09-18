import { describe, it, expect } from 'vitest';
import { generatePassCode, prefixForSlug, PASS_CODE_ALPHABET } from './passCode';

describe('prefixForSlug', () => {
  it('takes the first two letters by default', () => {
    expect(prefixForSlug('salomon')).toBe('SA');
    expect(prefixForSlug('marce-anahata')).toBe('MA');
  });

  /**
   * BB is not derivable from "bullbox" -- first-two-letters gives BU. It is
   * the brand's own initials, BullBox, and 163 lowercased away the capital B
   * that would have shown the word boundary. Pinned so the override cannot be
   * removed as dead code.
   */
  it('honours the stated prefix for bullbox', () => {
    expect(prefixForSlug('bullbox')).toBe('BB');
    expect(prefixForSlug('BULLBOX')).toBe('BB');
  });

  it('skips non-letters, so a slug with digits cannot break the CHECK', () => {
    expect(prefixForSlug('90-minutos')).toBe('MI');
    expect(prefixForSlug('crossfit-bullbox')).toBe('CR');
  });

  it('falls back when a slug has fewer than two letters', () => {
    // 163's slugify permits digits and hyphens and guarantees no letters at all.
    expect(prefixForSlug('90')).toBe('TB');
    expect(prefixForSlug('')).toBe('TB');
    expect(prefixForSlug('a')).toBe('TB');
  });
});

describe('generatePassCode', () => {
  it('matches the shape migration 173 enforces', () => {
    const dbCheck = /^[A-Z]{2}-[A-Z2-9]{4}$/;
    for (let i = 0; i < 500; i++) {
      expect(generatePassCode('bullbox')).toMatch(dbCheck);
    }
  });

  /**
   * The reason the alphabet exists. The code is read aloud across a gym floor
   * and typed from memory, so the pairs that get confused are absent.
   */
  it('never emits 0, O, 1 or I', () => {
    const banned = /[01OI]/;
    for (let i = 0; i < 2000; i++) {
      expect(generatePassCode('bullbox').slice(3)).not.toMatch(banned);
    }
    expect(PASS_CODE_ALPHABET).not.toMatch(banned);
    expect(PASS_CODE_ALPHABET).toHaveLength(32);
  });

  it('reaches both ends of the alphabet', () => {
    expect(generatePassCode('bullbox', () => 0)).toBe('BB-AAAA');
    expect(generatePassCode('bullbox', () => 0.999999)).toBe('BB-9999');
  });

  it('varies, so two claims in a row do not collide by construction', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generatePassCode('bullbox')));
    expect(codes.size).toBeGreaterThan(150);
  });
});

import { describe, it, expect } from 'vitest';
import { normalizeCallLink } from './callLink';

describe('normalizeCallLink (mirrors the 8002 CHECK)', () => {
  it('empty means no link', () => {
    expect(normalizeCallLink('  ')).toBeNull();
    expect(normalizeCallLink(null)).toBeNull();
  });
  it('adds https:// to a bare address', () => {
    expect(normalizeCallLink('calendly.com/salomon')).toBe('https://calendly.com/salomon');
  });
  it('keeps an https link, lower-casing only the scheme', () => {
    expect(normalizeCallLink('HTTPS://Calendly.com/Salomon')).toBe('https://Calendly.com/Salomon');
  });
  it('refuses http and every other scheme', () => {
    expect(normalizeCallLink('http://calendly.com/x')).toBe('invalid');
    expect(normalizeCallLink('javascript:alert(1)')).toBe('invalid');
    expect(normalizeCallLink('mailto:a@b.co')).toBe('invalid');
  });
  it('refuses spaces, quotes, a host without a dot, and more than 500 characters', () => {
    expect(normalizeCallLink('https://x.co/a b')).toBe('invalid');
    expect(normalizeCallLink('https://x.co/"x')).toBe('invalid');
    expect(normalizeCallLink('calendly')).toBe('invalid');
    expect(normalizeCallLink('https://x.co/' + 'a'.repeat(500))).toBe('invalid');
  });
});

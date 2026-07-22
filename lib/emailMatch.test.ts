/**
 * Tests for the LIKE-pattern escaping used by identity-scoping email lookups.
 *
 * The bug these guard against: `.ilike('email', rawAddress)` treats the address
 * as a PATTERN, so `_` (any single char) and `%` (any sequence) in a local-part
 * match other people's rows. Because the pattern is the caller's own signup
 * email, it is deliberately exploitable — `_____@example.com` matches every
 * five-character local-part at that domain.
 */

import { describe, it, expect } from 'vitest';
import { escapeLikePattern, normalizeEmail } from './emailMatch';

describe('escapeLikePattern', () => {
  it('escapes the underscore wildcard so it matches literally', () => {
    expect(escapeLikePattern('a_b@example.com')).toBe('a\\_b@example.com');
  });

  it('escapes the percent wildcard', () => {
    expect(escapeLikePattern('a%b@example.com')).toBe('a\\%b@example.com');
  });

  it('escapes a backslash, and does not re-escape the ones it inserts', () => {
    // Single pass matters: chained replaces would turn `a_b` into `a\\_b`
    // (escaped backslash + literal underscore), which matches nothing.
    expect(escapeLikePattern('a\\b@example.com')).toBe('a\\\\b@example.com');
    expect(escapeLikePattern('a\\_b@example.com')).toBe('a\\\\\\_b@example.com');
  });

  it('escapes an all-wildcard local-part — the mass-match attack', () => {
    expect(escapeLikePattern('_____@example.com')).toBe('\\_\\_\\_\\_\\_@example.com');
  });

  it('leaves an ordinary address untouched', () => {
    expect(escapeLikePattern('john.doe+tag@example.com')).toBe('john.doe+tag@example.com');
  });

  it('handles an empty string', () => {
    expect(escapeLikePattern('')).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims, matching how Supabase Auth stores addresses', () => {
    expect(normalizeEmail('  John@Gym.COM  ')).toBe('john@gym.com');
  });

  it('is a no-op on an already-normalized address', () => {
    expect(normalizeEmail('john@gym.com')).toBe('john@gym.com');
  });
});

describe('normalize + escape compose correctly', () => {
  it('preserves case-insensitivity while neutralising wildcards', () => {
    // The two properties that must hold together: `.eq()` would have given the
    // second but broken the first.
    expect(escapeLikePattern(normalizeEmail('A_B@Example.COM'))).toBe('a\\_b@example.com');
  });
});

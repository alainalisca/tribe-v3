/** T-C1 Gate 2: pending returnTo store — validation, single-use, fallbacks. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { sanitizeReturnTo, decodeReturnToParam, storePendingReturnTo, consumePendingReturnTo } from './pendingReturnTo';

const KEY = 'tribe_pending_return_to';

describe('sanitizeReturnTo', () => {
  it('accepts app-relative paths', () => {
    expect(sanitizeReturnTo('/invite/abc123')).toBe('/invite/abc123');
    expect(sanitizeReturnTo('/')).toBe('/');
  });

  it('rejects protocol-relative, absolute, and junk values', () => {
    expect(sanitizeReturnTo('//evil.com/phish')).toBeNull();
    expect(sanitizeReturnTo('https://evil.com')).toBeNull();
    expect(sanitizeReturnTo('javascript:alert(1)')).toBeNull();
    expect(sanitizeReturnTo('invite/abc')).toBeNull();
    expect(sanitizeReturnTo('')).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });
});

describe('decodeReturnToParam', () => {
  it('decodes an encoded path', () => {
    expect(decodeReturnToParam('%2Finvite%2Fabc')).toBe('/invite/abc');
  });

  it('returns the raw string instead of throwing on malformed input', () => {
    expect(decodeReturnToParam('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('passes null through', () => {
    expect(decodeReturnToParam(null)).toBeNull();
  });
});

describe('storePendingReturnTo / consumePendingReturnTo', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips a safe path and clears it on consume (single-use)', () => {
    storePendingReturnTo('/invite/abc123');
    expect(consumePendingReturnTo()).toBe('/invite/abc123');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(consumePendingReturnTo()).toBeNull();
  });

  it('does not store unsafe or default destinations', () => {
    storePendingReturnTo('//evil.com');
    storePendingReturnTo('https://evil.com');
    storePendingReturnTo('/');
    storePendingReturnTo(null);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(consumePendingReturnTo()).toBeNull();
  });

  it('re-validates on consume: a tampered stored value collapses to null and is removed', () => {
    // Simulate another script (or a stale build) writing garbage directly.
    sessionStorage.setItem(KEY, '//evil.com/phish');
    expect(consumePendingReturnTo()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

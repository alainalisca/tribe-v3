import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}));

import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    // Reset the internal store by using unique IPs per test
  });

  it('allows requests within limit', () => {
    const ip = `test-allow-${Date.now()}`;
    const result = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('decrements remaining on each request', () => {
    const ip = `test-decrement-${Date.now()}`;

    const r1 = rateLimit(ip, { maxRequests: 3, windowMs: 60_000 });
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit(ip, { maxRequests: 3, windowMs: 60_000 });
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit(ip, { maxRequests: 3, windowMs: 60_000 });
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests over limit', () => {
    const ip = `test-block-${Date.now()}`;
    const opts = { maxRequests: 2, windowMs: 60_000 };

    rateLimit(ip, opts); // 1
    rateLimit(ip, opts); // 2
    const result = rateLimit(ip, opts); // 3 — over limit

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets after window expires', () => {
    const ip = `test-reset-${Date.now()}`;
    const opts = { maxRequests: 1, windowMs: 1 }; // 1ms window

    rateLimit(ip, opts); // Use up the limit

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = rateLimit(ip, opts);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(0);
        resolve();
      }, 10);
    });
  });

  it('uses default options when none provided', () => {
    const ip = `test-defaults-${Date.now()}`;
    const result = rateLimit(ip);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // default maxRequests is 10
  });

  it('tracks different IPs independently', () => {
    const ip1 = `test-ip1-${Date.now()}`;
    const ip2 = `test-ip2-${Date.now()}`;
    const opts = { maxRequests: 1, windowMs: 60_000 };

    rateLimit(ip1, opts); // Use up ip1's limit
    const blocked = rateLimit(ip1, opts);
    expect(blocked.allowed).toBe(false);

    // ip2 should still be allowed
    const result = rateLimit(ip2, opts);
    expect(result.allowed).toBe(true);
  });
});

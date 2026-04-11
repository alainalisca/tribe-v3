import { describe, it, expect } from 'vitest';
import { calculateFees, getPaymentGateway, isSupportedCurrency, PLATFORM_FEE_PERCENT } from './config';

describe('calculateFees', () => {
  it('calculates 15% fee on 10000 cents', () => {
    const result = calculateFees(10000);
    expect(result.platformFeeCents).toBe(1500);
    expect(result.instructorPayoutCents).toBe(8500);
  });

  it('handles 1 cent edge case with rounding', () => {
    const result = calculateFees(1);
    // Math.round((1 * 15) / 100) = Math.round(0.15) = 0
    expect(result.platformFeeCents).toBe(0);
    expect(result.instructorPayoutCents).toBe(1);
  });

  it('handles 0 cents', () => {
    const result = calculateFees(0);
    expect(result.platformFeeCents).toBe(0);
    expect(result.instructorPayoutCents).toBe(0);
  });

  it('accepts a custom fee percent', () => {
    const result = calculateFees(10000, 10);
    expect(result.platformFeeCents).toBe(1000);
    expect(result.instructorPayoutCents).toBe(9000);
  });

  it('uses PLATFORM_FEE_PERCENT (15) as default', () => {
    expect(PLATFORM_FEE_PERCENT).toBe(15);
    const withDefault = calculateFees(10000);
    const withExplicit = calculateFees(10000, 15);
    expect(withDefault).toEqual(withExplicit);
  });
});

describe('getPaymentGateway', () => {
  it('returns wompi for COP', () => {
    expect(getPaymentGateway('COP')).toBe('wompi');
  });

  it('returns stripe for USD', () => {
    expect(getPaymentGateway('USD')).toBe('stripe');
  });

  it('throws for unsupported currency', () => {
    expect(() => getPaymentGateway('EUR' as never)).toThrow('Unsupported currency: EUR');
  });
});

describe('isSupportedCurrency', () => {
  it('returns true for COP', () => {
    expect(isSupportedCurrency('COP')).toBe(true);
  });

  it('returns true for USD', () => {
    expect(isSupportedCurrency('USD')).toBe(true);
  });

  it('returns false for EUR', () => {
    expect(isSupportedCurrency('EUR')).toBe(false);
  });

  it('returns false for GBP', () => {
    expect(isSupportedCurrency('GBP')).toBe(false);
  });
});

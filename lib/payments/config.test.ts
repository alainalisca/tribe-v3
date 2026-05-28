import { describe, it, expect, afterEach } from 'vitest';
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
  const originalOverride = process.env.PAYMENT_GATEWAY_OVERRIDE;
  afterEach(() => {
    if (originalOverride === undefined) delete process.env.PAYMENT_GATEWAY_OVERRIDE;
    else process.env.PAYMENT_GATEWAY_OVERRIDE = originalOverride;
  });

  it('returns wompi for COP', () => {
    delete process.env.PAYMENT_GATEWAY_OVERRIDE;
    expect(getPaymentGateway('COP')).toBe('wompi');
  });

  it('returns stripe for USD', () => {
    delete process.env.PAYMENT_GATEWAY_OVERRIDE;
    expect(getPaymentGateway('USD')).toBe('stripe');
  });

  it('throws for unsupported currency', () => {
    delete process.env.PAYMENT_GATEWAY_OVERRIDE;
    expect(() => getPaymentGateway('EUR' as never)).toThrow('Unsupported currency: EUR');
  });

  it('PAYMENT_GATEWAY_OVERRIDE=stripe forces stripe for COP', () => {
    process.env.PAYMENT_GATEWAY_OVERRIDE = 'stripe';
    expect(getPaymentGateway('COP')).toBe('stripe');
  });

  it('PAYMENT_GATEWAY_OVERRIDE=wompi forces wompi for USD', () => {
    process.env.PAYMENT_GATEWAY_OVERRIDE = 'wompi';
    expect(getPaymentGateway('USD')).toBe('wompi');
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

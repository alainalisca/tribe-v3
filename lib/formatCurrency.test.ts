import { describe, it, expect } from 'vitest';
import { formatPrice, formatDisplayAmount } from './formatCurrency';

// Note: es-CO locale uses '.' for thousands separator (e.g., $150.000)
// This is correct for Colombian Peso formatting

describe('formatPrice', () => {
  it('formats COP cents correctly with Colombian separators', () => {
    const result = formatPrice(15000000, 'COP');
    // es-CO uses '.' as thousands separator: $150.000
    expect(result).toMatch(/^\$150[.,]000$/);
  });

  it('formats USD cents correctly', () => {
    expect(formatPrice(3500, 'USD')).toBe('$35.00');
  });

  it('formats COP with 0 cents', () => {
    expect(formatPrice(0, 'COP')).toBe('$0');
  });

  it('formats USD with 1 cent', () => {
    expect(formatPrice(1, 'USD')).toBe('$0.01');
  });

  it('formats large COP amounts with thousand separators', () => {
    const result = formatPrice(50000000, 'COP');
    expect(result).toMatch(/^\$500[.,]000$/);
  });

  it('formats USD with exact dollars', () => {
    expect(formatPrice(10000, 'USD')).toBe('$100.00');
  });

  it('returns correct value for 15% fee calculation', () => {
    // 100,000 COP session, 15% fee = 15,000 COP
    const result = formatPrice(1500000, 'COP');
    expect(result).toMatch(/^\$15[.,]000$/);
  });
});

describe('formatDisplayAmount', () => {
  it('formats COP display amount correctly', () => {
    const result = formatDisplayAmount(150000, 'COP');
    expect(result).toMatch(/^\$150[.,]000$/);
  });

  it('formats USD display amount correctly', () => {
    expect(formatDisplayAmount(35, 'USD')).toBe('$35.00');
  });

  it('formats COP zero amount', () => {
    expect(formatDisplayAmount(0, 'COP')).toBe('$0');
  });

  it('formats USD fractional amount', () => {
    expect(formatDisplayAmount(0.99, 'USD')).toBe('$0.99');
  });
});

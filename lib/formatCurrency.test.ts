import { describe, it, expect } from 'vitest';
import { formatPrice, formatDisplayAmount } from './formatCurrency';

// BUG-221: COP must always render as the ISO code "COP", never as a
// locale-translated currency name. Intl.NumberFormat with currencyDisplay:'name'
// can emit "pesos colombianos" or other locale-specific strings; some browser
// ICU datasets have historically returned unexpected strings for "COP" in
// es-CO. Using currencyDisplay:'code' ensures the code is always literal.

describe('formatPrice — BUG-221 currency code safety', () => {
  it('COP renders with the literal code "COP" in Colombian locale', () => {
    const result = formatPrice(15000000, 'COP');
    expect(result).toContain('COP');
    expect(result.toUpperCase()).not.toMatch(/POLIC/);
  });

  it('COP renders with the literal code "COP" when treated as en locale', () => {
    // formatPrice always uses Intl.NumberFormat — no matter how the calling
    // component's UI language is set, the formatter itself emits "COP".
    const result = formatPrice(15000000, 'COP');
    expect(result).toContain('COP');
    expect(result.toUpperCase()).not.toMatch(/POLIC/);
  });

  it('USD renders with the literal code "USD"', () => {
    const result = formatPrice(3500, 'USD');
    expect(result).toContain('USD');
  });
});

describe('formatPrice — BUG-003 no duplicated currency code', () => {
  // The paid-session price label is built directly from formatPrice, which
  // already emits the ISO code. Guard that the code appears exactly once so a
  // caller can't reintroduce the "COP COP 35.000" duplication.
  it('COP label contains the code exactly once', () => {
    const label = formatPrice(3500000, 'COP');
    expect(label.match(/COP/g)?.length).toBe(1);
  });

  it('USD label contains the code exactly once', () => {
    const label = formatPrice(3500, 'USD');
    expect(label.match(/USD/g)?.length).toBe(1);
  });
});

describe('formatPrice', () => {
  it('formats COP cents correctly with Colombian separators', () => {
    const result = formatPrice(15000000, 'COP');
    // es-CO uses '.' as thousands separator: COP 150.000
    expect(result).toMatch(/COP\s*150[.,]000/);
  });

  it('formats USD cents correctly', () => {
    const result = formatPrice(3500, 'USD');
    expect(result).toMatch(/USD\s*35\.00/);
  });

  it('formats COP with 0 cents', () => {
    const result = formatPrice(0, 'COP');
    expect(result).toContain('COP');
    expect(result).toMatch(/0/);
  });

  it('formats USD with 1 cent', () => {
    const result = formatPrice(1, 'USD');
    expect(result).toMatch(/USD\s*0\.01/);
  });

  it('formats large COP amounts with thousand separators', () => {
    const result = formatPrice(50000000, 'COP');
    expect(result).toMatch(/COP\s*500[.,]000/);
  });

  it('formats USD with exact dollars', () => {
    const result = formatPrice(10000, 'USD');
    expect(result).toMatch(/USD\s*100\.00/);
  });

  it('returns correct value for 15% fee calculation', () => {
    // 100,000 COP session, 15% fee = 15,000 COP
    const result = formatPrice(1500000, 'COP');
    expect(result).toMatch(/COP\s*15[.,]000/);
  });
});

describe('formatDisplayAmount — BUG-221 currency code safety', () => {
  it('COP display amount renders with literal "COP" not a translation', () => {
    const result = formatDisplayAmount(150000, 'COP');
    expect(result).toContain('COP');
    expect(result.toUpperCase()).not.toMatch(/POLIC/);
  });
});

describe('formatDisplayAmount', () => {
  it('formats COP display amount correctly', () => {
    const result = formatDisplayAmount(150000, 'COP');
    expect(result).toMatch(/COP\s*150[.,]000/);
  });

  it('formats USD display amount correctly', () => {
    const result = formatDisplayAmount(35, 'USD');
    expect(result).toMatch(/USD\s*35\.00/);
  });

  it('formats COP zero amount', () => {
    const result = formatDisplayAmount(0, 'COP');
    expect(result).toContain('COP');
    expect(result).toMatch(/0/);
  });

  it('formats USD fractional amount', () => {
    const result = formatDisplayAmount(0.99, 'USD');
    expect(result).toMatch(/USD\s*0\.99/);
  });
});

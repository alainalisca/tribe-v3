import { describe, it, expect } from 'vitest';
import {
  isEditLocked,
  isSeriesChild,
  needsPriceChangeConfirmation,
  buildPriceFields,
  validatePriceInput,
} from './editGuards';

const NOW = new Date('2026-08-06T12:00:00');

describe('isSeriesChild', () => {
  it('is false for a true recurring parent (no parent link)', () => {
    expect(isSeriesChild({ recurring_parent_id: null })).toBe(false);
  });

  it('is true for a child occurrence (parent link set)', () => {
    expect(isSeriesChild({ recurring_parent_id: 'parent-1' })).toBe(true);
  });

  it('is false for a plain non-recurring one-off', () => {
    expect(isSeriesChild({ recurring_parent_id: null })).toBe(false);
  });

  it('is true for the nonsense state (is_recurring true but parent set)', () => {
    // isSeriesChild keys only on the parent link, so it flags the nonsense row
    // that the guard exists to prevent.
    expect(isSeriesChild({ recurring_parent_id: 'parent-1' })).toBe(true);
  });
});

describe('isEditLocked', () => {
  it('locks a past non-recurring session', () => {
    expect(isEditLocked({ date: '2026-08-01', start_time: '19:00:00', is_recurring: false }, NOW)).toBe(true);
  });

  it('does not lock a future session', () => {
    expect(isEditLocked({ date: '2026-08-10', start_time: '19:00:00', is_recurring: false }, NOW)).toBe(false);
  });

  it('does not lock a past recurring parent (it defines future occurrences)', () => {
    expect(isEditLocked({ date: '2026-06-04', start_time: '17:30:00', is_recurring: true }, NOW)).toBe(false);
  });

  it('treats null is_recurring as non-recurring', () => {
    expect(isEditLocked({ date: '2026-08-01', start_time: '19:00:00', is_recurring: null }, NOW)).toBe(true);
  });

  it('locks a session earlier today whose start time has passed', () => {
    expect(isEditLocked({ date: '2026-08-06', start_time: '08:00:00', is_recurring: false }, NOW)).toBe(true);
  });

  it('does not lock a session later today', () => {
    expect(isEditLocked({ date: '2026-08-06', start_time: '19:00:00', is_recurring: false }, NOW)).toBe(false);
  });
});

describe('needsPriceChangeConfirmation', () => {
  it('requires confirmation when a free session with joined participants becomes paid', () => {
    expect(needsPriceChangeConfirmation({ is_paid: false, price_cents: null }, true, 2)).toBe(true);
  });

  it('does not require confirmation when nobody has joined', () => {
    expect(needsPriceChangeConfirmation({ is_paid: false, price_cents: null }, true, 0)).toBe(false);
  });

  it('does not require confirmation when the session was already paid', () => {
    expect(needsPriceChangeConfirmation({ is_paid: true, price_cents: 3500000 }, true, 2)).toBe(false);
  });

  it('does not require confirmation when the session stays free', () => {
    expect(needsPriceChangeConfirmation({ is_paid: false, price_cents: null }, false, 2)).toBe(false);
  });

  it('treats is_paid=true with zero price as free (matches the feed card display)', () => {
    expect(needsPriceChangeConfirmation({ is_paid: true, price_cents: 0 }, true, 1)).toBe(true);
  });
});

describe('buildPriceFields', () => {
  it('converts a paid price to cents with rounding', () => {
    expect(
      buildPriceFields({ is_paid: true, price_display: '35000', currency: 'COP', payment_instructions: 'Nequi 300' })
    ).toEqual({ is_paid: true, price_cents: 3500000, currency: 'COP', payment_instructions: 'Nequi 300' });
  });

  it('rounds fractional USD amounts to whole cents', () => {
    expect(
      buildPriceFields({ is_paid: true, price_display: '15.005', currency: 'USD', payment_instructions: 'Venmo' })
    ).toEqual({ is_paid: true, price_cents: 1501, currency: 'USD', payment_instructions: 'Venmo' });
  });

  it('explicitly nulls price_cents when the session is free', () => {
    expect(
      buildPriceFields({ is_paid: false, price_display: '35000', currency: 'COP', payment_instructions: '' })
    ).toEqual({ is_paid: false, price_cents: null });
  });
});

describe('validatePriceInput', () => {
  it('passes a free session with no price', () => {
    expect(validatePriceInput({ is_paid: false, price_display: '', currency: 'COP', payment_instructions: '' })).toBe(
      null
    );
  });

  it('requires a price for paid sessions', () => {
    expect(validatePriceInput({ is_paid: true, price_display: '', currency: 'COP', payment_instructions: 'x' })).toBe(
      'price_required'
    );
  });

  it('rejects a non-numeric price', () => {
    expect(
      validatePriceInput({ is_paid: true, price_display: 'abc', currency: 'COP', payment_instructions: 'x' })
    ).toBe('price_required');
  });

  it('enforces the USD minimum', () => {
    expect(
      validatePriceInput({ is_paid: true, price_display: '4.99', currency: 'USD', payment_instructions: 'x' })
    ).toBe('min_usd');
  });

  it('enforces the COP minimum', () => {
    expect(
      validatePriceInput({ is_paid: true, price_display: '19999', currency: 'COP', payment_instructions: 'x' })
    ).toBe('min_cop');
  });

  it('requires payment instructions for paid sessions', () => {
    expect(
      validatePriceInput({ is_paid: true, price_display: '35000', currency: 'COP', payment_instructions: '  ' })
    ).toBe('instructions_required');
  });

  it('passes a valid paid session', () => {
    expect(
      validatePriceInput({ is_paid: true, price_display: '35000', currency: 'COP', payment_instructions: 'Nequi 300' })
    ).toBe(null);
  });
});

/**
 * Unit tests for the recurrence-edit logic in useEditSession.
 *
 * These test the payload-building logic in isolation (no React, no Supabase)
 * so they are fast and stable.  The key invariants:
 *   1. When is_recurring is true  → payload carries is_recurring:true,
 *      recurrence_pattern, and an ISO recurrence_end_date.
 *   2. When is_recurring is false → payload carries is_recurring:false and
 *      nulls out recurrence_pattern / recurrence_end_date so stale values
 *      are cleared on the DB row.
 */

import { describe, it, expect } from 'vitest';
import type { EditRecurringValue } from './useEditSession';

/** Mirrors the payload-building block from useEditSession.handleSubmit */
function buildRecurringFields(recurringValue: EditRecurringValue) {
  if (recurringValue.is_recurring) {
    return {
      is_recurring: true,
      recurrence_pattern: recurringValue.recurrence_pattern || null,
      recurrence_end_date: recurringValue.recurrence_end_date
        ? new Date(recurringValue.recurrence_end_date + 'T00:00:00').toISOString()
        : null,
    };
  }
  return {
    is_recurring: false,
    recurrence_pattern: null,
    recurrence_end_date: null,
  };
}

describe('edit-session recurrence payload', () => {
  it('includes recurrence fields when is_recurring is true with a pattern', () => {
    const value: EditRecurringValue = {
      is_recurring: true,
      recurrence_pattern: 'weekly_1_3',
      recurrence_end_date: '2026-12-31',
    };
    const payload = buildRecurringFields(value);

    expect(payload.is_recurring).toBe(true);
    expect(payload.recurrence_pattern).toBe('weekly_1_3');
    // ISO timestamp should start with the provided date
    expect(payload.recurrence_end_date).toMatch(/^2026-12-31/);
  });

  it('sets recurrence_end_date to null when no end date is provided', () => {
    const value: EditRecurringValue = {
      is_recurring: true,
      recurrence_pattern: 'monthly',
      recurrence_end_date: '',
    };
    const payload = buildRecurringFields(value);

    expect(payload.is_recurring).toBe(true);
    expect(payload.recurrence_pattern).toBe('monthly');
    expect(payload.recurrence_end_date).toBeNull();
  });

  it('turns off recurrence and nulls out pattern and end_date', () => {
    const value: EditRecurringValue = {
      is_recurring: false,
      recurrence_pattern: 'weekly_0',
      recurrence_end_date: '2026-06-30',
    };
    const payload = buildRecurringFields(value);

    expect(payload.is_recurring).toBe(false);
    expect(payload.recurrence_pattern).toBeNull();
    expect(payload.recurrence_end_date).toBeNull();
  });

  it('sets recurrence_pattern to null when pattern string is empty', () => {
    const value: EditRecurringValue = {
      is_recurring: true,
      recurrence_pattern: '',
      recurrence_end_date: '',
    };
    const payload = buildRecurringFields(value);

    expect(payload.is_recurring).toBe(true);
    expect(payload.recurrence_pattern).toBeNull();
  });
});

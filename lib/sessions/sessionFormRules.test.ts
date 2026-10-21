import { describe, it, expect } from 'vitest';
import {
  MAX_ATHLETES,
  MIN_ATHLETES,
  bogotaDateOf,
  firstErrorField,
  serverFieldError,
  startsAhead,
  validatePriceInput,
  validateSessionForm,
  validateStep,
  type SessionFormValues,
} from './sessionFormRules';
import { validatePriceInput as editValidatePriceInput } from '@/app/session/[id]/edit/editGuards';

// 10:00 in Bogotá on Tuesday 21 October 2026 (15:00 UTC).
const NOW = new Date('2026-10-21T15:00:00Z');

const ok: SessionFormValues = {
  sport: 'Boxing',
  date: '2026-10-25',
  start_time: '07:00',
  location: 'BullBox CrossFit, Laureles',
  max_participants: 12,
  skill_level: 'all_levels',
  gender_preference: 'all',
  join_policy: 'open',
};

const run = (patch: Partial<SessionFormValues>, now = NOW, opts = {}) =>
  validateSessionForm({ ...ok, ...patch }, null, now, opts);

describe('a complete form passes', () => {
  it('has no errors', () => {
    expect(run({})).toEqual({});
  });
});

describe('max athletes: 2 to 500', () => {
  it('accepts both bounds', () => {
    expect(run({ max_participants: MIN_ATHLETES }).max_participants).toBeUndefined();
    expect(run({ max_participants: MAX_ATHLETES }).max_participants).toBeUndefined();
    expect(MAX_ATHLETES).toBe(500);
    expect(MIN_ATHLETES).toBe(2);
  });

  it('refuses one past either bound', () => {
    expect(run({ max_participants: 501 }).max_participants).toBe('max_participants_range');
    expect(run({ max_participants: 1 }).max_participants).toBe('max_participants_range');
  });

  it('refuses the old 100,000 ceiling, an empty box and a fraction', () => {
    expect(run({ max_participants: 100000 }).max_participants).toBe('max_participants_range');
    expect(run({ max_participants: '' }).max_participants).toBe('max_participants_range');
    expect(run({ max_participants: 12.5 }).max_participants).toBe('max_participants_range');
  });
});

describe('a time today must still be ahead, in Bogotá', () => {
  it('refuses a time today that has passed', () => {
    expect(run({ date: '2026-10-21', start_time: '09:59' }).start_time).toBe('start_time_past');
  });

  it('refuses the current minute (the session would already have started)', () => {
    expect(run({ date: '2026-10-21', start_time: '10:00' }).start_time).toBe('start_time_past');
  });

  it('accepts a time later today', () => {
    expect(run({ date: '2026-10-21', start_time: '10:01' })).toEqual({});
  });

  it('reads the evening in Bogotá, not UTC, which has already rolled to tomorrow', () => {
    // 22:00 Bogotá on the 21st is 03:00 UTC on the 22nd.
    const evening = new Date('2026-10-22T03:00:00Z');
    expect(bogotaDateOf(evening)).toBe('2026-10-21');
    expect(run({ date: '2026-10-21', start_time: '23:00' }, evening)).toEqual({});
    expect(run({ date: '2026-10-21', start_time: '21:30' }, evening).start_time).toBe('start_time_past');
  });

  it('reads the early morning in Bogotá, which is still yesterday until 05:00 UTC', () => {
    // 23:30 Bogotá on the 20th is 04:30 UTC on the 21st.
    const lateNight = new Date('2026-10-21T04:30:00Z');
    expect(bogotaDateOf(lateNight)).toBe('2026-10-20');
    expect(run({ date: '2026-10-20', start_time: '23:45' }, lateNight)).toEqual({});
  });

  it('refuses a past date outright, without a second error on the time', () => {
    const errors = run({ date: '2026-10-20', start_time: '23:00' });
    expect(errors.date).toBe('date_past');
    expect(errors.start_time).toBeUndefined();
  });

  it('startsAhead accepts HH:MM:SS as the database returns it', () => {
    expect(startsAhead('2026-10-21', '10:00:01', NOW)).toBe(true);
    expect(startsAhead('2026-10-21', '10:00:00', NOW)).toBe(false);
    expect(startsAhead('2026-10-21', 'not a time', NOW)).toBe(false);
  });
});

describe('edit: the rule is about a NEW start', () => {
  const original = { date: '2026-10-21', start_time: '09:30:00' };

  it('leaves an unchanged start alone, even once it has passed', () => {
    expect(run({ date: '2026-10-21', start_time: '09:30' }, NOW, { original })).toEqual({});
  });

  it('checks a changed start', () => {
    expect(run({ date: '2026-10-21', start_time: '09:45' }, NOW, { original }).start_time).toBe('start_time_past');
  });

  it('never checks a recurring parent against now', () => {
    expect(run({ date: '2026-09-01', start_time: '06:00' }, NOW, { isSeriesParent: true })).toEqual({});
  });
});

describe('required and allowed values', () => {
  it('names each missing field', () => {
    const errors = run({ sport: ' ', date: '', start_time: '', location: '' });
    expect(errors).toMatchObject({
      sport: 'sport_required',
      date: 'date_required',
      start_time: 'start_time_required',
      location: 'location_required',
    });
  });

  it('refuses values the database CHECKs would refuse', () => {
    expect(run({ skill_level: 'pro' }).skill_level).toBe('skill_level_invalid');
    expect(run({ gender_preference: 'mixed' }).gender_preference).toBe('gender_invalid');
    expect(run({ join_policy: 'secret' }).join_policy).toBe('join_policy_invalid');
  });

  it('scrolls to the first field in form order', () => {
    expect(firstErrorField(run({ location: '', sport: '' }))).toBe('sport');
    expect(firstErrorField({})).toBeNull();
  });
});

describe('recurrence', () => {
  const on = (pattern: string, end = '') => ({
    is_recurring: true,
    recurrence_pattern: pattern,
    recurrence_end_date: end,
  });

  it('needs at least one day', () => {
    expect(validateSessionForm(ok, on('weekly'), NOW).recurrence).toBe('recurrence_days_required');
    expect(validateSessionForm(ok, on('weekly_2'), NOW).recurrence).toBeUndefined();
  });

  it('cannot end before the first date', () => {
    expect(validateSessionForm(ok, on('weekly_2', '2026-10-24'), NOW).recurrence).toBe('recurrence_end_before_start');
    expect(validateSessionForm(ok, on('weekly_2', '2026-12-31'), NOW).recurrence).toBeUndefined();
  });

  it('is ignored when the toggle is off', () => {
    expect(
      validateSessionForm(ok, { is_recurring: false, recurrence_pattern: '', recurrence_end_date: '' }, NOW)
    ).toEqual({});
  });
});

describe('steps', () => {
  it('reports only the fields of the step asked for', () => {
    const bad = { ...ok, sport: '', location: '', max_participants: 900 as const };
    expect(Object.keys(validateStep('what', bad, null, NOW))).toEqual(['sport']);
    expect(Object.keys(validateStep('when_where', bad, null, NOW))).toEqual(['location']);
    expect(Object.keys(validateStep('capacity', bad, null, NOW))).toEqual(['max_participants']);
  });
});

describe("the database's refusals map back onto a field (migration 227)", () => {
  it('reads the trigger and the CHECK', () => {
    expect(serverFieldError('session_start_in_past')).toEqual({ field: 'start_time', error: 'start_time_past' });
    expect(
      serverFieldError('new row for relation "sessions" violates check constraint "sessions_max_participants_range"')
    ).toEqual({ field: 'max_participants', error: 'max_participants_range' });
  });

  it('leaves anything else to the generic message', () => {
    expect(serverFieldError('permission denied for table sessions')).toBeNull();
    expect(serverFieldError(undefined)).toBeNull();
  });
});

describe('paid rules (moved from editGuards, unchanged)', () => {
  it('editGuards re-exports the same function', () => {
    expect(editValidatePriceInput).toBe(validatePriceInput);
  });

  it('keeps the floors and the order of checks', () => {
    const paid = { is_paid: true, price_display: '20000', currency: 'COP' as const, payment_instructions: 'Nequi' };
    expect(validatePriceInput(paid)).toBeNull();
    expect(validatePriceInput({ ...paid, price_display: '19999' })).toBe('min_cop');
    expect(validatePriceInput({ ...paid, currency: 'USD', price_display: '4.99' })).toBe('min_usd');
    expect(validatePriceInput({ ...paid, price_display: '' })).toBe('price_required');
    expect(validatePriceInput({ ...paid, payment_instructions: ' ' })).toBe('instructions_required');
    expect(validatePriceInput({ ...paid, is_paid: false, price_display: '' })).toBeNull();
  });
});

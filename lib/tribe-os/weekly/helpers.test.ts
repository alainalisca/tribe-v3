import { describe, it, expect } from 'vitest';
import {
  lastCompletedWeek,
  isInWeek,
  pctChange,
  weekLabel,
  toBogotaDate,
  findReturnVisitDate,
  formatClassSlot,
} from './helpers';

describe('lastCompletedWeek', () => {
  it('on Sunday, last completed week is the one before (current week still in progress)', () => {
    const week = lastCompletedWeek('2026-10-11');
    expect(week.monday).toBe('2026-09-28');
    expect(week.sunday).toBe('2026-10-04');
  });

  it('on a Monday, last completed week is the one before', () => {
    const week = lastCompletedWeek('2026-10-12');
    expect(week.monday).toBe('2026-10-05');
    expect(week.sunday).toBe('2026-10-11');
  });

  it('on a Sunday, last completed is the prior full week', () => {
    const week = lastCompletedWeek('2026-10-18');
    expect(week.monday).toBe('2026-10-05');
    expect(week.sunday).toBe('2026-10-11');
  });
});

describe('isInWeek (Bogota timezone)', () => {
  const week = { monday: '2026-10-05', sunday: '2026-10-11' };

  it('Sunday 11 p.m. Bogota stays in the week', () => {
    const sundayNightBogota = '2026-10-12T04:00:00Z';
    expect(toBogotaDate(sundayNightBogota)).toBe('2026-10-11');
    expect(isInWeek(sundayNightBogota, week)).toBe(true);
  });

  it('Monday 12:30 a.m. Bogota starts the next week', () => {
    const mondayMorningBogota = '2026-10-12T05:30:00Z';
    expect(toBogotaDate(mondayMorningBogota)).toBe('2026-10-12');
    expect(isInWeek(mondayMorningBogota, week)).toBe(false);
  });

  it('Friday mid-day is in the week', () => {
    expect(isInWeek('2026-10-09T17:00:00Z', week)).toBe(true);
  });

  it('Saturday before the week is not in the week', () => {
    expect(isInWeek('2026-10-04T12:00:00Z', week)).toBe(false);
  });
});

describe('pctChange', () => {
  it('returns null when both are 0', () => {
    expect(pctChange(0, 0)).toBeNull();
  });

  it('returns 100 when previous is 0 and current > 0', () => {
    expect(pctChange(5, 0)).toBe(100);
  });

  it('calculates correct percentage', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
  });
});

describe('weekLabel', () => {
  it('generates Spanish label within same month', () => {
    const label = weekLabel({ monday: '2026-10-05', sunday: '2026-10-11' }, 'es');
    expect(label).toBe('Semana del 5 al 11 de oct');
  });

  it('generates Spanish label across months', () => {
    const label = weekLabel({ monday: '2026-09-28', sunday: '2026-10-04' }, 'es');
    expect(label).toBe('Semana del 28 de sep al 4 de oct');
  });

  it('generates English label', () => {
    const label = weekLabel({ monday: '2026-10-05', sunday: '2026-10-11' }, 'en');
    expect(label).toBe('Week of Oct 5 to 11');
  });
});

describe('findReturnVisitDate (came-back attribution)', () => {
  const visits = [
    { client_id: 'natalia', visited_at: '2026-10-05T14:00:00Z' },
    { client_id: 'natalia', visited_at: '2026-10-01T10:00:00Z' },
    { client_id: 'carlos', visited_at: '2026-10-06T10:00:00Z' },
  ];

  it('touch Sat Oct 3, return Mon Oct 5: return date is Oct 5 (in week Oct 5-11)', () => {
    const touch = { client_id: 'natalia', created_at: '2026-10-03T18:00:00Z' };
    const returnDate = findReturnVisitDate(touch, visits);
    expect(returnDate).toBe('2026-10-05T14:00:00Z');
    expect(isInWeek(returnDate!, { monday: '2026-10-05', sunday: '2026-10-11' })).toBe(true);
    expect(isInWeek(returnDate!, { monday: '2026-09-28', sunday: '2026-10-04' })).toBe(false);
  });

  it('touch and return in the same week', () => {
    const touch = { client_id: 'carlos', created_at: '2026-10-05T08:00:00Z' };
    const returnDate = findReturnVisitDate(touch, visits);
    expect(returnDate).toBe('2026-10-06T10:00:00Z');
    expect(isInWeek(returnDate!, { monday: '2026-10-05', sunday: '2026-10-11' })).toBe(true);
  });

  it('a return can never be counted in two weeks (return date is deterministic)', () => {
    const touch = { client_id: 'natalia', created_at: '2026-10-03T18:00:00Z' };
    const returnDate = findReturnVisitDate(touch, visits);
    const weekA = { monday: '2026-09-28', sunday: '2026-10-04' };
    const weekB = { monday: '2026-10-05', sunday: '2026-10-11' };
    const inA = isInWeek(returnDate!, weekA);
    const inB = isInWeek(returnDate!, weekB);
    expect(inA).toBe(false);
    expect(inB).toBe(true);
    expect(inA && inB).toBe(false);
  });

  it('visit before the touch is ignored', () => {
    const touch = { client_id: 'natalia', created_at: '2026-10-02T00:00:00Z' };
    const onlyBefore = [
      { client_id: 'natalia', visited_at: '2026-10-01T10:00:00Z' },
    ];
    expect(findReturnVisitDate(touch, onlyBefore)).toBeNull();
  });

  it('visit more than 14 days after touch is ignored', () => {
    const touch = { client_id: 'natalia', created_at: '2026-10-01T00:00:00Z' };
    const farVisit = [
      { client_id: 'natalia', visited_at: '2026-10-20T10:00:00Z' },
    ];
    expect(findReturnVisitDate(touch, farVisit)).toBeNull();
  });
});

describe('formatClassSlot', () => {
  it('formats Spanish slot', () => {
    const slot = { className: 'CrossFit', weekday: 2, hour: 6, weekdayName: '', visits: 24 };
    expect(formatClassSlot(slot, 'es')).toBe('CrossFit, martes 6:00 a. m. (24 visitas)');
  });

  it('formats English slot', () => {
    const slot = { className: 'Yoga', weekday: 4, hour: 18, weekdayName: '', visits: 4 };
    expect(formatClassSlot(slot, 'en')).toBe('Yoga, Thursday 6:00 PM (4 visits)');
  });

  it('formats noon correctly', () => {
    const slot = { className: 'Spinning', weekday: 1, hour: 12, weekdayName: '', visits: 15 };
    expect(formatClassSlot(slot, 'es')).toBe('Spinning, lunes 12:00 p. m. (15 visitas)');
  });
});

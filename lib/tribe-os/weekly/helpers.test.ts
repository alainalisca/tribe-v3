import { describe, it, expect } from 'vitest';
import { lastCompletedWeek, isInWeek, pctChange, weekLabel, toBogotaDate } from './helpers';

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

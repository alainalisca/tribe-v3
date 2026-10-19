import { describe, it, expect } from 'vitest';
import {
  collapseSeries,
  feedSports,
  groupFeed,
  groupKeyFor,
  groupTitle,
  isBookable,
  limitGroups,
  seriesDaysLabel,
} from './feedGroups';

/** T-UI-FD1: day headers, each series once, bookable sessions only. */
// Sunday 18 October 2026, 17:00 local.
const NOW = new Date('2026-10-18T17:00:00');
let n = 0;
const s = (date: string, start = '18:00:00', over: Record<string, unknown> = {}) => ({
  id: `s${++n}`,
  date,
  start_time: start,
  duration: 60,
  status: 'active',
  is_test: false,
  is_recurring: false,
  recurring_parent_id: null as string | null,
  sport: 'Yoga',
  ...over,
});

describe('isBookable', () => {
  it('drops test, cancelled and ended sessions; keeps the rest', () => {
    expect(isBookable(s('2026-10-18', '18:00:00'), NOW)).toBe(true);
    expect(isBookable(s('2026-10-18', '16:30:00'), NOW)).toBe(true); // on now, ends 17:30
    expect(isBookable(s('2026-10-18', '15:00:00'), NOW)).toBe(false); // ended at 16:00
    expect(isBookable(s('2026-10-19', '07:00:00', { is_test: true }), NOW)).toBe(false);
    expect(isBookable(s('2026-10-19', '07:00:00', { status: 'cancelled' }), NOW)).toBe(false);
  });
});

describe('collapseSeries', () => {
  it('shows a series once, at its next occurrence, with its weekdays Monday first', () => {
    const parent = 'p1';
    const items = collapseSeries([
      s('2026-10-23', '06:00:00', { recurring_parent_id: parent }), // vie
      s('2026-10-19', '06:00:00', { recurring_parent_id: parent }), // lun
      s('2026-10-21', '06:00:00', { recurring_parent_id: parent }), // mié
      s('2026-10-20', '08:00:00'), // one-off
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].session.date).toBe('2026-10-19');
    expect(items[0].seriesDays).toEqual([0, 2, 4]);
    expect(seriesDaysLabel(items[0].seriesDays!, 'es')).toBe('lun · mié · vie');
    expect(seriesDaysLabel(items[0].seriesDays!, 'en')).toBe('Mon · Wed · Fri');
    expect(items[1].seriesDays).toBeNull();
  });

  it('a series parent (is_recurring) groups with its occurrences', () => {
    const items = collapseSeries([
      s('2026-10-19', '06:00:00', { id: 'p2', is_recurring: true }),
      s('2026-10-26', '06:00:00', { recurring_parent_id: 'p2' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].session.id).toBe('p2');
    expect(items[0].seriesDays).toEqual([0]);
  });
});

describe('groupFeed', () => {
  it('Hoy, Mañana, weekday names for the coming week, then Más adelante', () => {
    expect(groupKeyFor('2026-10-18', NOW)).toBe('today');
    expect(groupKeyFor('2026-10-19', NOW)).toBe('tomorrow');
    expect(groupKeyFor('2026-10-20', NOW)).toBe('weekday');
    expect(groupKeyFor('2026-10-24', NOW)).toBe('weekday');
    expect(groupKeyFor('2026-10-25', NOW)).toBe('later');

    const groups = groupFeed(
      [
        s('2026-10-27'),
        s('2026-10-18'),
        s('2026-10-21'),
        s('2026-10-19'),
        s('2026-11-02'),
        s('2026-10-21', '07:00:00'),
      ],
      NOW
    );
    expect(groups.map((g) => groupTitle(g, 'es'))).toEqual(['Hoy', 'Mañana', 'Miércoles', 'Más adelante']);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 2, 2]);
    expect(groups[2].items.map((i) => i.session.start_time)).toEqual(['07:00:00', '18:00:00']);
    expect(groupTitle(groups[3], 'en')).toBe('Later');
  });

  it('never shows test, cancelled or ended sessions, and a series only once', () => {
    const groups = groupFeed(
      [
        s('2026-10-18', '15:00:00'),
        s('2026-10-19', '07:00:00', { is_test: true }),
        s('2026-10-19', '08:00:00', { status: 'cancelled' }),
        s('2026-10-19', '06:00:00', { recurring_parent_id: 'p' }),
        s('2026-10-20', '06:00:00', { recurring_parent_id: 'p' }),
      ],
      NOW
    );
    const all = groups.flatMap((g) => g.items);
    expect(all).toHaveLength(1);
    expect(all[0].seriesDays).toEqual([0, 1]);
  });

  it('is empty with nothing bookable', () => {
    expect(groupFeed([s('2026-10-18', '10:00:00')], NOW)).toEqual([]);
  });
});

describe('limitGroups and feedSports', () => {
  it('keeps the first N cards with their headers', () => {
    const groups = groupFeed([s('2026-10-18'), s('2026-10-19'), s('2026-10-19', '19:00:00'), s('2026-10-20')], NOW);
    const limited = limitGroups(groups, 2);
    expect(limited.map((g) => g.items.length)).toEqual([1, 1]);
    expect(limitGroups(groups, 10).flatMap((g) => g.items)).toHaveLength(4);
  });

  it('lists the sports on the feed, most sessions first', () => {
    expect(feedSports([{ sport: 'Yoga' }, { sport: 'CrossFit' }, { sport: 'Yoga' }, { sport: null }])).toEqual([
      'Yoga',
      'CrossFit',
    ]);
  });
});

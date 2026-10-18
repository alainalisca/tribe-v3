import { describe, it, expect } from 'vitest';
import { formatRelative } from './formatRelative';

/** T-JOIN1 Part C: correct plurals in both languages, one helper. */
const NOW = new Date('2026-10-18T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelative', () => {
  it.each([
    [10_000, 'ahora', 'now'],
    [1 * MIN, 'hace 1 minuto', '1 minute ago'],
    [5 * MIN, 'hace 5 minutos', '5 minutes ago'],
    [1 * HOUR, 'hace 1 hora', '1 hour ago'],
    [3 * HOUR, 'hace 3 horas', '3 hours ago'],
    [1 * DAY, 'ayer', 'yesterday'],
    [3 * DAY, 'hace 3 días', '3 days ago'],
    [7 * DAY, 'la semana pasada', 'last week'],
    [14 * DAY, 'hace 2 semanas', '2 weeks ago'],
    [31 * DAY, 'el mes pasado', 'last month'],
    [90 * DAY, 'hace 3 meses', '3 months ago'],
    [400 * DAY, 'el año pasado', 'last year'],
    [800 * DAY, 'hace 2 años', '2 years ago'],
  ])('%i ms ago: "%s" / "%s"', (ms, es, en) => {
    expect(formatRelative(ago(ms), 'es', NOW)).toBe(es);
    expect(formatRelative(ago(ms), 'en', NOW)).toBe(en);
  });

  it('never "hace 3 mes"', () => {
    expect(formatRelative(ago(90 * DAY), 'es', NOW)).not.toMatch(/\bmes$/);
  });

  it('reads the future too', () => {
    expect(formatRelative(new Date(NOW.getTime() + 2 * DAY), 'es', NOW)).toBe('pasado mañana');
    expect(formatRelative(new Date(NOW.getTime() + 3 * DAY), 'en', NOW)).toBe('in 3 days');
  });

  it('accepts ISO strings and epoch ms, and is empty for nothing or garbage', () => {
    expect(formatRelative(ago(5 * MIN).toISOString(), 'es', NOW)).toBe('hace 5 minutos');
    expect(formatRelative(ago(5 * MIN).getTime(), 'en', NOW)).toBe('5 minutes ago');
    expect(formatRelative(null, 'es', NOW)).toBe('');
    expect(formatRelative('not a date', 'es', NOW)).toBe('');
  });
});

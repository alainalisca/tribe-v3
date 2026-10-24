import { describe, expect, it } from 'vitest';
import { selectCoachesDestacados, DESTACADOS_MAX } from './coachesDestacados';

// 2026-10-20 12:00 in Bogotá (UTC-5).
const NOW = new Date('2026-10-20T17:00:00Z');

function s(id: string, date: string, plan: string | null, start = '07:00', status = 'active') {
  return { id, date, start_time: start, status, creator: { coach_plan: plan } };
}

describe('selectCoachesDestacados', () => {
  it('keeps only paid and ambassador coaches', () => {
    const out = selectCoachesDestacados(
      [
        s('a', '2026-10-21', 'pro'),
        s('b', '2026-10-21', 'basico'),
        s('c', '2026-10-21', 'embajador'),
        s('d', '2026-10-21', 'crecimiento'),
        s('e', '2026-10-21', null),
      ],
      NOW
    );
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });

  it('covers today through the next 7 days, Bogotá dates', () => {
    const out = selectCoachesDestacados(
      [
        s('past', '2026-10-19', 'pro'),
        s('today', '2026-10-20', 'pro'),
        s('day7', '2026-10-27', 'pro'),
        s('day8', '2026-10-28', 'pro'),
      ],
      NOW
    );
    expect(out.map((x) => x.id)).toEqual(['today', 'day7']);
  });

  it('soonest first, by date then start time', () => {
    const out = selectCoachesDestacados(
      [
        s('late', '2026-10-22', 'pro', '18:00'),
        s('early', '2026-10-22', 'pro', '06:00'),
        s('first', '2026-10-21', 'pro', '20:00'),
      ],
      NOW
    );
    expect(out.map((x) => x.id)).toEqual(['first', 'early', 'late']);
  });

  it('caps at 10 and skips inactive sessions', () => {
    const many = Array.from({ length: 14 }, (_, i) => s(`s${i}`, '2026-10-21', 'pro', `0${i % 10}:00`));
    expect(selectCoachesDestacados(many, NOW)).toHaveLength(DESTACADOS_MAX);
    expect(selectCoachesDestacados([s('x', '2026-10-21', 'pro', '07:00', 'cancelled')], NOW)).toEqual([]);
  });

  it('is empty when nobody qualifies (the row hides)', () => {
    expect(selectCoachesDestacados([s('a', '2026-10-21', 'basico')], NOW)).toEqual([]);
  });
});

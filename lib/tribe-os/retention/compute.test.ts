import { describe, it, expect } from 'vitest';
import { scoreRetention } from './compute';

const GYM = 'd585af30-5ed5-448b-bd9c-ab82b2e99970';
const NOW = new Date('2026-09-24T12:00:00-05:00');

function makeActivities(
  pattern: { startDaysAgo: number; endDaysAgo: number; perWeek: number },
  now: Date = NOW
): { activity_at: string }[] {
  const acts: { activity_at: string }[] = [];
  const start = new Date(now);
  start.setDate(start.getDate() - pattern.startDaysAgo);
  const end = new Date(now);
  end.setDate(end.getDate() - pattern.endDaysAgo);

  const totalDays = pattern.startDaysAgo - pattern.endDaysAgo;
  const totalWeeks = Math.max(totalDays / 7, 1);
  const total = Math.round(totalWeeks * pattern.perWeek);
  const step = totalDays / Math.max(total, 1);

  for (let i = 0; i < total; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.round(i * step));
    d.setHours(7, 0, 0, 0);
    if (d <= now) acts.push({ activity_at: d.toISOString() });
  }
  return acts;
}

describe('retention scoring', () => {
  it('steady regular → low', () => {
    const activities = makeActivities({ startDaysAgo: 180, endDaysAgo: 1, perWeek: 4 });
    const result = scoreRetention({
      client_id: 'c-steady',
      gym_id: GYM,
      joined_on: '2026-01-01',
      plan_ends_on: '2027-03-01',
      activities,
      now: NOW,
    });
    expect(result.level).toBe('low');
    expect(result.reasons).toContain('Asistencia estable / Stable attendance');
  });

  it('slow fader → high or medium with trend reason', () => {
    const baseline = makeActivities({ startDaysAgo: 180, endDaysAgo: 56, perWeek: 4 });
    const fading = makeActivities({ startDaysAgo: 56, endDaysAgo: 28, perWeek: 2 });
    const recent = makeActivities({ startDaysAgo: 28, endDaysAgo: 14, perWeek: 1 });
    const result = scoreRetention({
      client_id: 'c-fader',
      gym_id: GYM,
      joined_on: '2025-12-01',
      plan_ends_on: '2026-10-15',
      activities: [...baseline, ...fading, ...recent],
      now: NOW,
    });
    expect(['high', 'medium']).toContain(result.level);
    expect(result.reasons.some((r) => r.includes('menos que su promedio'))).toBe(true);
  });

  it('sudden stop → high with days-absent reason', () => {
    const active = makeActivities({ startDaysAgo: 180, endDaysAgo: 20, perWeek: 4 });
    const result = scoreRetention({
      client_id: 'c-sudden',
      gym_id: GYM,
      joined_on: '2025-09-01',
      plan_ends_on: '2026-10-30',
      activities: active,
      now: NOW,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some((r) => r.includes('días sin venir'))).toBe(true);
  });

  it('new member → "new" level', () => {
    const activities = makeActivities({ startDaysAgo: 10, endDaysAgo: 1, perWeek: 3 });
    const result = scoreRetention({
      client_id: 'c-new',
      gym_id: GYM,
      joined_on: '2026-09-14',
      plan_ends_on: '2027-01-14',
      activities,
      now: NOW,
    });
    expect(result.level).toBe('new');
    expect(result.reasons.some((r) => r.includes('Miembro nuevo'))).toBe(true);
  });

  it('sparse irregular → not all flagged high', () => {
    const activities = makeActivities({ startDaysAgo: 180, endDaysAgo: 5, perWeek: 1 });
    const result = scoreRetention({
      client_id: 'c-sparse',
      gym_id: GYM,
      joined_on: '2025-06-01',
      plan_ends_on: '2026-12-01',
      activities,
      now: NOW,
    });
    expect(result.level).not.toBe('high');
  });

  it('plan expiring soon adds reason', () => {
    const activities = makeActivities({ startDaysAgo: 90, endDaysAgo: 1, perWeek: 3 });
    const result = scoreRetention({
      client_id: 'c-expiry',
      gym_id: GYM,
      joined_on: '2026-04-01',
      plan_ends_on: '2026-09-28',
      activities,
      now: NOW,
    });
    expect(result.reasons.some((r) => r.includes('plan vence'))).toBe(true);
  });

  it('no activity → insufficient_data', () => {
    const result = scoreRetention({
      client_id: 'c-ghost',
      gym_id: GYM,
      joined_on: '2025-06-01',
      plan_ends_on: '2026-12-01',
      activities: [],
      now: NOW,
    });
    expect(result.level).toBe('insufficient_data');
  });

  it('score is between 0 and 1', () => {
    const activities = makeActivities({ startDaysAgo: 180, endDaysAgo: 30, perWeek: 4 });
    const result = scoreRetention({
      client_id: 'c-bounds',
      gym_id: GYM,
      joined_on: '2025-01-01',
      plan_ends_on: '2026-09-25',
      activities,
      now: NOW,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

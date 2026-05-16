/**
 * Tests for computeCountersFromTimestamps — the pure function that
 * computes total/last-30/current-streak/longest from a list of
 * attended_at timestamps.
 *
 * The DB write side (reconcileGymCounters) is integration-level
 * coverage; we test the math here because that's where regressions
 * silently lie.
 *
 * Streak rules tested (must match the SQL trigger from migration 079):
 *   - Latest island ending today → streak is the run length
 *   - Latest island NOT ending today → streak is 0
 *   - Multiple sessions same day → counts as ONE day
 *   - Gap of one day breaks the streak
 *   - longest_streak_days only ratchets up
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeCountersFromTimestamps } from './clients.reconcile';

const NOW = new Date('2026-05-14T15:00:00.000Z');
function daysAgo(n: number, hourUtc = 15): string {
  const d = new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

describe('computeCountersFromTimestamps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('returns zero counters for empty input', () => {
    const r = computeCountersFromTimestamps([], 0);
    expect(r).toEqual({
      total_sessions: 0,
      sessions_last_30_days: 0,
      current_streak_days: 0,
      longest_streak_days: 0,
    });
  });

  it('counts total_sessions across the full history', () => {
    const isos = [daysAgo(0), daysAgo(40), daysAgo(120)];
    const r = computeCountersFromTimestamps(isos, 0);
    expect(r.total_sessions).toBe(3);
  });

  it('counts sessions_last_30_days only within the 30-day window', () => {
    const isos = [daysAgo(0), daysAgo(29), daysAgo(31), daysAgo(60)];
    const r = computeCountersFromTimestamps(isos, 0);
    // 0d and 29d are inside; 31d and 60d are outside.
    expect(r.sessions_last_30_days).toBe(2);
  });

  it('detects an active 3-day streak ending today', () => {
    const isos = [daysAgo(0), daysAgo(1), daysAgo(2)];
    const r = computeCountersFromTimestamps(isos, 0);
    expect(r.current_streak_days).toBe(3);
    expect(r.longest_streak_days).toBe(3);
  });

  it('returns 0 streak when the most recent attendance was yesterday (not today)', () => {
    // Latest is yesterday → streak ended. This matches the trigger's
    // 'max_d = v_today' check. Coaches see "your streak ended"
    // *the day after* the broken day, not on the same day.
    const isos = [daysAgo(1), daysAgo(2), daysAgo(3)];
    const r = computeCountersFromTimestamps(isos, 0);
    expect(r.current_streak_days).toBe(0);
  });

  it('treats multiple sessions on the same day as one streak day', () => {
    // Two sessions today + yesterday = 2-day streak, not 3.
    const isos = [
      daysAgo(0, 8),
      daysAgo(0, 18), // same UTC day, different hour
      daysAgo(1),
    ];
    const r = computeCountersFromTimestamps(isos, 0);
    expect(r.current_streak_days).toBe(2);
  });

  it('breaks the streak on a single missed day', () => {
    // today + day-1 attended, day-2 missed, day-3 attended.
    // Streak should be only 2 (today + day-1), not 3.
    const isos = [daysAgo(0), daysAgo(1), daysAgo(3)];
    const r = computeCountersFromTimestamps(isos, 0);
    expect(r.current_streak_days).toBe(2);
  });

  it('preserves longest_streak_days when current is shorter (ratchet)', () => {
    // Current streak is 2 days, but historical longest was 47.
    // The reconciliation should NOT regress the longest counter.
    const isos = [daysAgo(0), daysAgo(1)];
    const r = computeCountersFromTimestamps(isos, 47);
    expect(r.current_streak_days).toBe(2);
    expect(r.longest_streak_days).toBe(47);
  });

  it('ratchets longest_streak_days UP when current exceeds prior longest', () => {
    // Current streak is 10 days, historical longest was 5. New
    // longest should be 10. This matches the trigger's
    // GREATEST(existing, computed) rule.
    const isos = Array.from({ length: 10 }, (_, i) => daysAgo(i));
    const r = computeCountersFromTimestamps(isos, 5);
    expect(r.current_streak_days).toBe(10);
    expect(r.longest_streak_days).toBe(10);
  });
});

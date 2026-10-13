import { describe, it, expect } from 'vitest';
import { computeMemberProgress, progressLabel } from './progress';

describe('computeMemberProgress', () => {
  it('returns null when startsAt is missing', () => {
    expect(computeMemberProgress(null, null, 3, 5, '2026-07-20')).toBeNull();
  });

  it('returns null when targetPerWeek is missing', () => {
    expect(computeMemberProgress('2026-07-01', null, null, 5, '2026-07-20')).toBeNull();
  });

  it('returns null when targetPerWeek is 0', () => {
    expect(computeMemberProgress('2026-07-01', null, 0, 5, '2026-07-20')).toBeNull();
  });

  it('returns on track before program starts', () => {
    const p = computeMemberProgress('2026-08-01', null, 3, 0, '2026-07-20');
    expect(p).toEqual({ visitCount: 0, expectedVisits: 0, onTrack: true, weeksElapsed: 0 });
  });

  it('computes expected visits for first partial week', () => {
    const p = computeMemberProgress('2026-07-14', null, 3, 2, '2026-07-17');
    expect(p).not.toBeNull();
    expect(p!.weeksElapsed).toBe(1);
    expect(p!.expectedVisits).toBe(3);
    expect(p!.onTrack).toBe(false);
  });

  it('on track when visits meet or exceed expected', () => {
    const p = computeMemberProgress('2026-07-01', null, 3, 9, '2026-07-21');
    expect(p).not.toBeNull();
    expect(p!.weeksElapsed).toBe(3);
    expect(p!.expectedVisits).toBe(9);
    expect(p!.onTrack).toBe(true);
  });

  it('behind when visits are below expected', () => {
    const p = computeMemberProgress('2026-07-01', null, 3, 4, '2026-07-21');
    expect(p).not.toBeNull();
    expect(p!.onTrack).toBe(false);
  });

  it('caps at ends_at when ends_at is before today', () => {
    const p = computeMemberProgress('2026-07-01', '2026-07-14', 3, 6, '2026-08-01');
    expect(p).not.toBeNull();
    expect(p!.weeksElapsed).toBe(2);
    expect(p!.expectedVisits).toBe(6);
    expect(p!.onTrack).toBe(true);
  });

  it('uses today when ends_at is in the future', () => {
    const p = computeMemberProgress('2026-07-01', '2026-08-30', 3, 6, '2026-07-14');
    expect(p).not.toBeNull();
    expect(p!.weeksElapsed).toBe(2);
    expect(p!.expectedVisits).toBe(6);
    expect(p!.onTrack).toBe(true);
  });

  it('single day = 1 week elapsed', () => {
    const p = computeMemberProgress('2026-07-01', null, 5, 5, '2026-07-01');
    expect(p).not.toBeNull();
    expect(p!.weeksElapsed).toBe(1);
    expect(p!.expectedVisits).toBe(5);
    expect(p!.onTrack).toBe(true);
  });

  it('exactly 7 days = 1 week', () => {
    const p = computeMemberProgress('2026-07-01', null, 4, 4, '2026-07-07');
    expect(p).not.toBeNull();
    expect(p!.weeksElapsed).toBe(1);
    expect(p!.expectedVisits).toBe(4);
    expect(p!.onTrack).toBe(true);
  });

  it('8 days = 2 weeks elapsed', () => {
    const p = computeMemberProgress('2026-07-01', null, 4, 4, '2026-07-08');
    expect(p).not.toBeNull();
    expect(p!.weeksElapsed).toBe(2);
    expect(p!.expectedVisits).toBe(8);
    expect(p!.onTrack).toBe(false);
  });
});

describe('progressLabel', () => {
  it('returns empty string for null', () => {
    expect(progressLabel(null, 'es')).toBe('');
  });

  it('returns "Al día" in Spanish when on track', () => {
    expect(progressLabel({ visitCount: 5, expectedVisits: 3, onTrack: true, weeksElapsed: 1 }, 'es')).toBe('Al día');
  });

  it('returns "Atrasado" in Spanish when behind', () => {
    expect(progressLabel({ visitCount: 1, expectedVisits: 3, onTrack: false, weeksElapsed: 1 }, 'es')).toBe('Atrasado');
  });

  it('returns "On track" in English when on track', () => {
    expect(progressLabel({ visitCount: 5, expectedVisits: 3, onTrack: true, weeksElapsed: 1 }, 'en')).toBe('On track');
  });

  it('returns "Behind" in English when behind', () => {
    expect(progressLabel({ visitCount: 1, expectedVisits: 3, onTrack: false, weeksElapsed: 1 }, 'en')).toBe('Behind');
  });
});

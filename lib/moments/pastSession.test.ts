import { describe, it, expect } from 'vitest';
import { checkPastSession } from './pastSession';

const NOW = new Date('2026-10-19T15:00:00Z'); // 10:00 in Bogotá
const coach = { id: 'c', isAdmin: false, isInstructor: true };
const admin = { id: 'a', isAdmin: true, isInstructor: false };
const base = { sport: 'Boxing', date: '2026-10-18', startTime: '18:30', duration: 90 };
const listed = (id: string) => id === 'salomon';

describe('Registrar sesión pasada (T-MOM1)', () => {
  it('a coach registers their own; quiet: invite_only, active, not a test', () => {
    const r = checkPastSession(base, coach, listed, NOW);
    expect(r.ok && r.row).toMatchObject({
      creator_id: 'c',
      join_policy: 'invite_only',
      status: 'active',
      is_test: false,
      start_time: '18:30:00',
    });
  });

  it('an admin may register one for a listed coach; a coach may not register for someone else', () => {
    expect(checkPastSession({ ...base, hostId: 'salomon' }, admin, listed, NOW)).toMatchObject({
      ok: true,
      hostId: 'salomon',
    });
    expect(checkPastSession({ ...base, hostId: 'nobody' }, admin, listed, NOW)).toEqual({
      ok: false,
      error: 'invalid_host',
    });
    expect(checkPastSession({ ...base, hostId: 'salomon' }, coach, listed, NOW)).toEqual({
      ok: false,
      error: 'not_allowed',
    });
    expect(checkPastSession(base, { id: 'u', isAdmin: false, isInstructor: false }, listed, NOW)).toEqual({
      ok: false,
      error: 'not_allowed',
    });
  });

  it('today or up to a year back; never the future', () => {
    expect(checkPastSession({ ...base, date: '2026-10-19' }, coach, listed, NOW).ok).toBe(true);
    expect(checkPastSession({ ...base, date: '2026-10-20' }, coach, listed, NOW)).toEqual({
      ok: false,
      error: 'future_date',
    });
    expect(checkPastSession({ ...base, date: '2025-10-01' }, coach, listed, NOW)).toEqual({
      ok: false,
      error: 'too_old',
    });
  });

  it('validates sport, time and duration', () => {
    expect(checkPastSession({ ...base, sport: ' ' }, coach, listed, NOW)).toEqual({
      ok: false,
      error: 'sport_required',
    });
    expect(checkPastSession({ ...base, startTime: '25:00' }, coach, listed, NOW)).toEqual({
      ok: false,
      error: 'invalid_time',
    });
    expect(checkPastSession({ ...base, duration: 5 }, coach, listed, NOW)).toEqual({
      ok: false,
      error: 'invalid_duration',
    });
  });
});

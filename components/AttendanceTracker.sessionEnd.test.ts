import { describe, it, expect, afterAll } from 'vitest';
import { sessionHasEnded } from './AttendanceTracker';

/**
 * "Passed" means the session END has come and gone, evaluated in Medellin local
 * time. Tests run under TZ=America/Bogota (so `date + time` parses as Medellin
 * local, as it would on a user's device) and pass an explicit-offset `now`.
 */
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('sessionHasEnded (Medellin local, end_time based)', () => {
  it('is false before the end and true after', () => {
    process.env.TZ = 'America/Bogota';
    const date = '2026-08-23';
    const start = '17:00:00';
    const end = '18:00:00'; // ends 6pm Bogota

    expect(sessionHasEnded(date, start, end, new Date('2026-08-23T17:30:00-05:00'))).toBe(false);
    expect(sessionHasEnded(date, start, end, new Date('2026-08-23T18:30:00-05:00'))).toBe(true);
    // Exactly at the end instant is not yet "ended" (strictly after).
    expect(sessionHasEnded(date, start, end, new Date('2026-08-23T18:00:00-05:00'))).toBe(false);
  });

  it('falls back to start_time when end_time is null, so attendance is never blocked forever', () => {
    process.env.TZ = 'America/Bogota';
    const date = '2026-08-23';
    const start = '17:00:00';

    // Judged against the START (5pm) when end is missing.
    expect(sessionHasEnded(date, start, null, new Date('2026-08-23T16:30:00-05:00'))).toBe(false);
    expect(sessionHasEnded(date, start, null, new Date('2026-08-23T17:30:00-05:00'))).toBe(true);
  });

  it('witness: the local date+time parse really depends on the zone', () => {
    process.env.TZ = 'America/Bogota';
    const bogota = new Date('2026-08-23T18:00:00').getTime();
    process.env.TZ = 'Asia/Tokyo';
    const tokyo = new Date('2026-08-23T18:00:00').getTime();
    expect(bogota).not.toBe(tokyo);
  });
});

import { describe, it, expect } from 'vitest';
import { FEED_ENDED_GRACE_MINUTES, getSessionEndsAt, isPastFeedGrace } from './SessionCardHelpers';

// Sessions are wall-clock Bogota values, so these build local Dates too.
function sessionAt(date: string, start_time: string | null, duration: number | null) {
  return { date, start_time, duration } as Parameters<typeof isPastFeedGrace>[0];
}

function localIso(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe('getSessionEndsAt', () => {
  it('adds the duration to the start time', () => {
    const endsAt = getSessionEndsAt(sessionAt('2026-09-07', '18:30', 90));
    expect(endsAt.getHours()).toBe(20);
    expect(endsAt.getMinutes()).toBe(0);
  });

  it('defaults to 60 minutes when duration is missing', () => {
    expect(getSessionEndsAt(sessionAt('2026-09-07', '18:30', null)).getHours()).toBe(19);
  });

  it('runs to end of day when there is no start time', () => {
    const endsAt = getSessionEndsAt(sessionAt('2026-09-07', null, null));
    expect(endsAt.getHours()).toBe(23);
    expect(endsAt.getMinutes()).toBe(59);
  });
});

describe('isPastFeedGrace', () => {
  const now = new Date('2026-09-07T21:21:00');

  it('hides the session from the audit: 6:30pm + 90min, seen at 9:21pm', () => {
    expect(isPastFeedGrace(sessionAt('2026-09-07', '18:30', 90), now)).toBe(true);
  });

  it('keeps a session that is still running', () => {
    expect(isPastFeedGrace(sessionAt('2026-09-07', '21:00', 60), now)).toBe(false);
  });

  it('keeps a session inside the grace window and drops it just after', () => {
    // Ends at 21:00, so 21 minutes ago at "now" — inside a 30 minute grace.
    expect(isPastFeedGrace(sessionAt('2026-09-07', '20:00', 60), now)).toBe(false);
    // Ends at 20:45, 36 minutes ago — past it.
    expect(isPastFeedGrace(sessionAt('2026-09-07', '19:45', 60), now)).toBe(true);
  });

  it('uses a 30 minute grace period', () => {
    expect(FEED_ENDED_GRACE_MINUTES).toBe(30);
  });

  it('keeps tomorrow, drops yesterday, without stubbing the clock', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    expect(isPastFeedGrace(sessionAt(localIso(tomorrow), '09:00', 60))).toBe(false);
    expect(isPastFeedGrace(sessionAt(localIso(yesterday), '09:00', 60))).toBe(true);
  });
});

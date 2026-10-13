/**
 * Prove the 5-hour timezone bug: server code uses
 *   new Date(`${session.date}T${session.start_time}`)
 * which on Vercel (TZ=UTC) interprets Bogotá wall-clock as UTC — 5 hours too
 * early. These tests run the SAME arithmetic the bug sites use and show the
 * result is wrong, then verify sessionStartUtc gives the correct UTC instant.
 *
 * Bug sites:
 *   1. app/api/cron/reminders/route.ts:87
 *   2. app/api/cron/session-reminders/route.ts:87
 *   3. app/api/cron/post-session-followups/route.ts:63
 *   4. lib/dal/sessions.ts:724
 *   5. app/api/generate-calendar/route.ts:66-70
 *
 * NOT a bug:
 *   6. lib/reminders.ts:47 — client-side, runs in the user's browser (Bogotá
 *      TZ), so new Date(naiveString) accidentally uses the correct offset.
 */
import { describe, it, expect } from 'vitest';
import { sessionStartUtc } from './bogotaDate';

const DATE = '2026-06-15';
const TIME = '18:00:00';

describe('the bug: new Date(`${date}T${time}`) under TZ=UTC', () => {
  it('treats 18:00 Bogotá as 18:00 UTC — 5 hours too early', () => {
    const buggy = new Date(`${DATE}T${TIME}`);
    // The buggy code produces 18:00 UTC
    expect(buggy.toISOString()).toBe('2026-06-15T18:00:00.000Z');
    // But 18:00 Bogotá is actually 23:00 UTC
    const correct = sessionStartUtc(DATE, TIME)!;
    expect(correct.toISOString()).toBe('2026-06-15T23:00:00.000Z');
    // The difference is exactly 5 hours
    expect(correct.getTime() - buggy.getTime()).toBe(5 * 60 * 60 * 1000);
  });

  it('21:00 Bogotá crosses to the next UTC day — the bug gets the day wrong', () => {
    const buggy = new Date(`${DATE}T21:00:00`);
    expect(buggy.toISOString()).toBe('2026-06-15T21:00:00.000Z');
    const correct = sessionStartUtc(DATE, '21:00:00')!;
    expect(correct.toISOString()).toBe('2026-06-16T02:00:00.000Z');
    // Bug: same day. Correct: next day.
    expect(buggy.getUTCDate()).toBe(15);
    expect(correct.getUTCDate()).toBe(16);
  });
});

describe('sessionStartUtc correctness for each bug site', () => {
  it('cron/reminders: session at 18:00 Bogotá → 23:00 UTC for window check', () => {
    const result = sessionStartUtc('2026-06-15', '18:00:00')!;
    expect(result.toISOString()).toBe('2026-06-15T23:00:00.000Z');
  });

  it('cron/session-reminders: same pattern, same fix', () => {
    const result = sessionStartUtc('2026-06-15', '11:02:00')!;
    expect(result.toISOString()).toBe('2026-06-15T16:02:00.000Z');
  });

  it('cron/post-session-followups: session end = start + duration', () => {
    const start = sessionStartUtc('2026-06-15', '18:00:00')!;
    const duration = 60;
    const end = new Date(start.getTime() + duration * 60 * 1000);
    expect(end.toISOString()).toBe('2026-06-16T00:00:00.000Z');
  });

  it('dal/sessions: past-session guard at 18:00 Bogotá', () => {
    const start = sessionStartUtc('2026-06-15', '18:00:00')!;
    // At 22:00 UTC (17:00 Bogotá), the session hasn't started yet
    const now22utc = new Date('2026-06-15T22:00:00Z');
    expect(start.getTime() > now22utc.getTime()).toBe(true);
    // The buggy code would say 18:00 UTC < 22:00 UTC → "past session"
    const buggy = new Date('2026-06-15T18:00:00');
    expect(buggy.getTime() < now22utc.getTime()).toBe(true);
  });

  it('generate-calendar: setHours under TZ=UTC gives wrong ICS fields', () => {
    // The buggy code: new Date(date+'T00:00:00') then setHours(18, 0, 0)
    const buggyDate = new Date('2026-06-15T00:00:00');
    buggyDate.setHours(18, 0, 0);
    // Under TZ=UTC, getHours() returns 18 — but that's 18:00 UTC, not Bogotá
    expect(buggyDate.getHours()).toBe(18);
    // The correct UTC instant for 18:00 Bogotá:
    const correct = sessionStartUtc('2026-06-15', '18:00:00')!;
    expect(correct.getUTCHours()).toBe(23);
  });
});

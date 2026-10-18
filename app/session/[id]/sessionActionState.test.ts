import { describe, it, expect } from 'vitest';
import { athleteBarState, doorListOpen } from './sessionActionState';

/** T-UI-SD1: the bar's one action per athlete state, and when "Quién llegó" is open. */
const base = { hasJoined: false, isPending: false, isPast: false, isFull: false, isPaid: false, joinPolicy: 'open' };

describe('athleteBarState', () => {
  it('upcoming, not booked: Reservar, or Solicitar unirse on a paid session', () => {
    expect(athleteBarState(base)).toBe('book');
    expect(athleteBarState({ ...base, isPaid: true })).toBe('request');
  });

  it('booked: Ya estás dentro (Cancelar mi cupo); afterwards: Terminó', () => {
    expect(athleteBarState({ ...base, hasJoined: true })).toBe('joined');
    expect(athleteBarState({ ...base, hasJoined: true, isPast: true })).toBe('ended');
  });

  it('a pending request wins over everything else', () => {
    expect(athleteBarState({ ...base, isPending: true, isFull: true, isPaid: true })).toBe('pending');
  });

  it('full, ended and invite-only say why there is nothing to press', () => {
    expect(athleteBarState({ ...base, isFull: true })).toBe('full');
    expect(athleteBarState({ ...base, isPast: true, isFull: true })).toBe('ended');
    expect(athleteBarState({ ...base, joinPolicy: 'invite_only' })).toBe('invite_only');
  });
});

describe('doorListOpen', () => {
  const s = { date: '2026-11-19', start_time: '11:30:00', end_time: '13:00:00', duration: 90 };
  const at = (clock: string) => new Date(`2026-11-19T${clock}`);

  it('is closed before the start, open from the start to the end, closed after', () => {
    expect(doorListOpen(s, at('11:29:59'))).toBe(false);
    expect(doorListOpen(s, at('11:30:00'))).toBe(true);
    expect(doorListOpen(s, at('12:59:00'))).toBe(true);
    expect(doorListOpen(s, at('13:00:00'))).toBe(false);
  });

  it('is never open days ahead (the bug: it showed from the moment the session was created)', () => {
    expect(doorListOpen(s, new Date('2026-10-18T12:00:00'))).toBe(false);
  });

  it('without an end time, closes at start plus duration (60 min when unknown)', () => {
    expect(doorListOpen({ ...s, end_time: null }, at('12:59:00'))).toBe(true);
    expect(doorListOpen({ ...s, end_time: null }, at('13:00:01'))).toBe(false);
    expect(doorListOpen({ ...s, end_time: null, duration: null }, at('12:29:00'))).toBe(true);
    expect(doorListOpen({ ...s, end_time: null, duration: null }, at('12:31:00'))).toBe(false);
  });
});

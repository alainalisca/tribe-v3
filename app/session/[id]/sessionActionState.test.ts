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
  const s = { date: '2026-11-19', start_time: '11:30:00' };
  const at = (when: string) => new Date(`2026-11-19T${when}`);

  it('is closed before the start and open from the start onward, after the end too', () => {
    expect(doorListOpen(s, at('11:29:59'))).toBe(false);
    expect(doorListOpen(s, at('11:30:00'))).toBe(true);
    expect(doorListOpen(s, at('23:00:00'))).toBe(true);
    expect(doorListOpen(s, new Date('2027-01-05T09:00:00'))).toBe(true);
  });

  it('is never open days ahead (the bug: it showed from the moment the session was created)', () => {
    expect(doorListOpen(s, new Date('2026-10-18T12:00:00'))).toBe(false);
  });

  it('is closed for a session with no usable start', () => {
    expect(doorListOpen({ date: '2026-11-19', start_time: '' }, at('12:00:00'))).toBe(false);
  });
});

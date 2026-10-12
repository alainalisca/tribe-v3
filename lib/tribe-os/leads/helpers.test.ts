import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidPhone, nextStatusOptions, computeFollowUp } from './helpers';

describe('normalizePhone', () => {
  it('strips spaces, dashes, dots, parens', () => {
    expect(normalizePhone('+57 300 123 4567')).toBe('+573001234567');
  });

  it('adds +57 to 10-digit Colombian mobile starting with 3', () => {
    expect(normalizePhone('300-123-4567')).toBe('+573001234567');
  });

  it('adds +57 to 10-digit with parens', () => {
    expect(normalizePhone('(300) 1234567')).toBe('+573001234567');
  });

  it('does not add +57 to numbers not starting with 3', () => {
    expect(normalizePhone('1234567890')).toBe('1234567890');
  });

  it('preserves leading + and removes duplicates', () => {
    expect(normalizePhone('+1 555 123 4567')).toBe('+15551234567');
  });

  it('handles already clean number', () => {
    expect(normalizePhone('+573001234567')).toBe('+573001234567');
  });
});

describe('isValidPhone', () => {
  it('accepts valid phone with +', () => {
    expect(isValidPhone('+573001234567')).toBe(true);
  });

  it('accepts valid phone without +', () => {
    expect(isValidPhone('3001234567')).toBe(true);
  });

  it('rejects too short', () => {
    expect(isValidPhone('12345')).toBe(false);
  });

  it('rejects with letters', () => {
    expect(isValidPhone('+57abc1234567')).toBe(false);
  });
});

describe('nextStatusOptions', () => {
  it('new -> contacted, trial_booked, joined, lost', () => {
    expect(nextStatusOptions('new')).toEqual(['contacted', 'trial_booked', 'joined', 'lost']);
  });

  it('contacted -> trial_booked, joined, lost', () => {
    expect(nextStatusOptions('contacted')).toEqual(['trial_booked', 'joined', 'lost']);
  });

  it('trial_booked -> trial_done, joined, lost', () => {
    expect(nextStatusOptions('trial_booked')).toEqual(['trial_done', 'joined', 'lost']);
  });

  it('trial_done -> joined, lost', () => {
    expect(nextStatusOptions('trial_done')).toEqual(['joined', 'lost']);
  });

  it('joined -> empty', () => {
    expect(nextStatusOptions('joined')).toEqual([]);
  });

  it('lost -> empty', () => {
    expect(nextStatusOptions('lost')).toEqual([]);
  });
});

describe('computeFollowUp', () => {
  const now = new Date('2026-10-12T15:00:00Z');

  it('new -> now', () => {
    const result = computeFollowUp('new', now, null);
    expect(result).toBe(now.toISOString());
  });

  it('contacted -> +2 days', () => {
    const result = computeFollowUp('contacted', now, null);
    expect(new Date(result!).getDate()).toBe(14);
  });

  it('trial_booked -> trial_at + 1 day', () => {
    const result = computeFollowUp('trial_booked', now, '2026-10-15T10:00:00Z');
    expect(new Date(result!).getDate()).toBe(16);
  });

  it('trial_booked without trial_at -> null', () => {
    expect(computeFollowUp('trial_booked', now, null)).toBeNull();
  });

  it('trial_done -> +1 day', () => {
    const result = computeFollowUp('trial_done', now, null);
    expect(new Date(result!).getDate()).toBe(13);
  });

  it('joined -> null', () => {
    expect(computeFollowUp('joined', now, null)).toBeNull();
  });

  it('lost -> null', () => {
    expect(computeFollowUp('lost', now, null)).toBeNull();
  });
});

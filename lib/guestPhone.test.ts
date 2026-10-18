import { describe, it, expect } from 'vitest';
import { normalizeGuestPhone } from './guestPhone';

/** T-JOIN1 Part B: a guest's WhatsApp, Colombian mobile or international with country code, stored as E.164. */
describe('normalizeGuestPhone', () => {
  it.each([
    ['3001234567', '+573001234567'],
    ['300 123 4567', '+573001234567'],
    ['(300) 123-4567', '+573001234567'],
    ['+57 300 123 4567', '+573001234567'],
    ['573001234567', '+573001234567'],
    ['0057 300 123 4567', '+573001234567'],
    ['+1 415 555 0100', '+14155550100'],
    ['14155550100', '+14155550100'],
    ['0044 20 7946 0958', '+442079460958'],
    ['+34 612 34 56 78', '+34612345678'],
  ])('%s -> %s', (raw, e164) => {
    expect(normalizeGuestPhone(raw)).toBe(e164);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['6041234567', 'a Colombian landline'],
    ['+57 604 123 4567', 'a Colombian landline with code'],
    ['300123456', 'nine digits'],
    ['30012345678', 'eleven digits'],
    ['4155550100', 'a local number from elsewhere, no code'],
    ['+0 123 456 7890', 'a code starting with 0'],
    ['+1 23', 'too short'],
    ['abc', 'letters'],
    ['+1234567890123456', 'too long'],
  ])('%s is refused (%s)', (raw) => {
    expect(normalizeGuestPhone(raw)).toBeNull();
  });
});

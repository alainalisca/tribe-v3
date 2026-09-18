import { describe, it, expect } from 'vitest';
import { normalizeWhatsApp, waMeDigits } from './phone';

/** Migration 173's pass_leads_whatsapp_e164 CHECK, verbatim. */
const DB_CHECK = /^\+[1-9][0-9]{7,14}$/;

describe('normalizeWhatsApp', () => {
  /**
   * The point of the whole module: one person, typing the same number several
   * ways, must produce one row value. The partner dedupes by eye and cannot
   * tell that "300 111 2233" and "+573001112233" are the same lead.
   */
  it('collapses every way a Colombian number gets typed to one E.164 value', () => {
    const forms = [
      '3001112233',
      '300 111 2233',
      '300-111-2233',
      '300.111.2233',
      '+573001112233',
      '+57 300 111 2233',
      '+57 300-111-2233',
      '573001112233',
      '57 300 111 2233',
      '(300) 111 2233',
      '00573001112233',
      ' 3001112233 ',
    ];
    expect(new Set(forms.map(normalizeWhatsApp))).toEqual(new Set(['+573001112233']));
  });

  /**
   * THE LIVE FAILURE. The first real test of the preview typed a US mobile
   * with its country code and no plus, and the form rejected it: the only bare
   * form accepted was a 10 digit Colombian one, so an 11 digit US number fell
   * straight through to reject. Both spellings are pinned.
   */
  it('accepts a US number typed bare with its country code', () => {
    expect(normalizeWhatsApp('13472132947')).toBe('+13472132947');
    expect(normalizeWhatsApp('+1 347 213 2947')).toBe('+13472132947');
    expect(normalizeWhatsApp('1 347 213 2947')).toBe('+13472132947');
    expect(normalizeWhatsApp('+1 (347) 213-2947')).toBe('+13472132947');
    expect(normalizeWhatsApp('0013472132947')).toBe('+13472132947');
  });

  it('honours any explicit country code, not only the two we infer', () => {
    expect(normalizeWhatsApp('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizeWhatsApp('+34 600 123 456')).toBe('+34600123456');
    expect(normalizeWhatsApp('+52 55 1234 5678')).toBe('+525512345678');
    expect(normalizeWhatsApp('+61 2 9374 4000')).toBe('+61293744000');
  });

  it('handles the non-breaking space a number pasted out of WhatsApp carries', () => {
    expect(normalizeWhatsApp('300 111 2233')).toBe('+573001112233');
    expect(normalizeWhatsApp('+1 347 213 2947')).toBe('+13472132947');
  });

  it('reads a bare 10 digit number as Colombian', () => {
    expect(normalizeWhatsApp('3001112233')).toBe('+573001112233');
    // and does NOT quietly turn a 10 digit US number into a different country's
    // number by adding a second country code
    expect(normalizeWhatsApp('3472132947')).toBe('+573472132947');
  });

  it('rejects what cannot be a phone number', () => {
    for (const bad of [
      '',
      '   ',
      'abc',
      '123',
      '30011122', // 8 bare digits, no country code to infer
      '+',
      '+0123456789', // E.164 forbids a leading zero after the plus
      'null',
      '300111223a',
      '+57 300 111 22 33 44 55', // too long for E.164
      '23472132947', // 11 bare digits that do not start with 1
      '58300111223344', // 14 bare digits that do not start with 57
    ]) {
      expect(normalizeWhatsApp(bad), bad).toBeNull();
    }
  });

  it('rejects non-strings rather than throwing', () => {
    expect(normalizeWhatsApp(null)).toBeNull();
    expect(normalizeWhatsApp(undefined)).toBeNull();
  });

  it('rejects a number too long for E.164', () => {
    expect(normalizeWhatsApp('+1234567890123456')).toBeNull();
  });

  /**
   * If this and the CHECK ever disagree, the insert fails at runtime on a lead
   * we already told the person we saved.
   */
  it('only ever emits values the database CHECK accepts', () => {
    const inputs = [
      '3001112233',
      '+573001112233',
      '13472132947',
      '+1 347 213 2947',
      '+44 20 7946 0958',
      '00573001112233',
      '573001112233',
    ];
    for (const input of inputs) {
      const out = normalizeWhatsApp(input);
      expect(out, input).not.toBeNull();
      expect(out!, input).toMatch(DB_CHECK);
    }
  });
});

describe('waMeDigits', () => {
  it('strips the plus, because wa.me/+57... does not resolve', () => {
    expect(waMeDigits('+573001112233')).toBe('573001112233');
    expect(waMeDigits('+13472132947')).toBe('13472132947');
  });
});

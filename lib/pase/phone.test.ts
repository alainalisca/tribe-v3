import { describe, it, expect } from 'vitest';
import { normalizeWhatsApp, waMeDigits } from './phone';

describe('normalizeWhatsApp', () => {
  /**
   * The point of the whole module: one person, typing the same number three
   * ways, must produce one row value. Leo dedupes by eye and cannot tell that
   * "300 111 2233" and "+573001112233" are the same lead.
   */
  it('collapses every way a Colombian number gets typed to one E.164 value', () => {
    const forms = [
      '3001112233',
      '300 111 2233',
      '300-111-2233',
      '+573001112233',
      '+57 300 111 2233',
      '+57 300-111-2233',
      '57 300 111 2233',
      '(300) 111 2233',
      '00573001112233',
      ' 3001112233 ',
    ];
    const results = forms.map(normalizeWhatsApp);
    expect(new Set(results)).toEqual(new Set(['+573001112233']));
  });

  it('handles the non-breaking space a number pasted out of WhatsApp carries', () => {
    expect(normalizeWhatsApp('300 111 2233')).toBe('+573001112233');
  });

  it('keeps an explicit country code that is not Colombia', () => {
    expect(normalizeWhatsApp('+1 415 555 0123')).toBe('+14155550123');
    expect(normalizeWhatsApp('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects what cannot be a phone number', () => {
    for (const bad of ['', '   ', 'abc', '123', '30011122', '+', '+0123456789', 'null']) {
      expect(normalizeWhatsApp(bad)).toBeNull();
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
   * The regex here is migration 173's pass_leads_whatsapp_e164 CHECK. If the
   * two ever disagree the insert fails at runtime, so the agreement is pinned.
   */
  it('only ever emits values the database CHECK accepts', () => {
    const dbCheck = /^\+[1-9][0-9]{7,14}$/;
    for (const input of ['3001112233', '+573001112233', '+1 415 555 0123', '00573001112233']) {
      const out = normalizeWhatsApp(input);
      expect(out).not.toBeNull();
      expect(out!).toMatch(dbCheck);
    }
  });
});

describe('waMeDigits', () => {
  it('strips the plus, because wa.me/+57... does not resolve', () => {
    expect(waMeDigits('+573001112233')).toBe('573001112233');
  });
});

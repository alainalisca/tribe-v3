import { describe, it, expect } from 'vitest';
import type { Attribution } from '@/lib/attribution';
import { decideSignupAttribution, SIGNUP_WINDOW_MS, CLOCK_SLACK_MS } from './signupAttribution';

/**
 * The three rules in lib/signupAttribution.ts. Each has a boundary arm on both
 * sides, because an off-by-one in rule 1 credits a pre-existing account and an
 * off-by-one in rule 2 credits a signup to a visit that came after it.
 */

const CREATED = Date.UTC(2026, 9, 9, 15, 0, 0);
const NOW = CREATED + 60_000;

function touch(over: Partial<Attribution>): Attribution {
  return {
    src: null,
    code: null,
    ref: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    landing_path: '/',
    ts: CREATED - 3_600_000,
    ...over,
  };
}

const FIRST = touch({ src: 'ig', code: 'IG-REEL-01', landing_path: '/', ts: CREATED - 5 * 86_400_000 });
const LAST = touch({
  src: 'runclub',
  code: 'RUNCLUB-SAT0927',
  ref: 'A7K2QX',
  utm_source: 'whatsapp',
  utm_medium: 'chat',
  utm_campaign: 'hyrox-oct',
  utm_content: 'flyer',
  landing_path: '/pase/bullbox/',
  ts: CREATED - 600_000,
});

describe('decideSignupAttribution', () => {
  it('fills the flat columns from the LAST touch and keeps the FIRST touch whole', () => {
    const d = decideSignupAttribution(FIRST, LAST, CREATED, NOW);
    expect(d).toEqual({
      kind: 'write',
      fields: {
        signup_src: 'runclub',
        signup_code: 'RUNCLUB-SAT0927',
        signup_ref: 'A7K2QX',
        signup_utm_source: 'whatsapp',
        signup_utm_medium: 'chat',
        signup_utm_campaign: 'hyrox-oct',
        signup_utm_content: 'flyer',
        signup_landing_path: '/pase/bullbox/',
        signup_first_touch: FIRST,
      },
    });
  });

  describe('rule 1: only a young account', () => {
    it('writes at exactly the window edge', () => {
      expect(decideSignupAttribution(FIRST, LAST, CREATED, CREATED + SIGNUP_WINDOW_MS).kind).toBe('write');
    });
    it('refuses one millisecond past it, so a pre-existing account is never credited', () => {
      expect(decideSignupAttribution(FIRST, LAST, CREATED, CREATED + SIGNUP_WINDOW_MS + 1)).toEqual({
        kind: 'too_old',
      });
    });
    it('refuses an unreadable created_at rather than treating it as new', () => {
      expect(decideSignupAttribution(FIRST, LAST, Number.NaN, NOW)).toEqual({ kind: 'too_old' });
    });
  });

  describe('rule 2: only touches from before the account existed', () => {
    it('accepts a touch inside the clock slack', () => {
      const late = { ...LAST, ts: CREATED + CLOCK_SLACK_MS };
      expect(decideSignupAttribution(null, late, CREATED, NOW).kind).toBe('write');
    });

    it('ignores a last touch from after signup, and falls back to the first touch', () => {
      const after = { ...LAST, ts: CREATED + CLOCK_SLACK_MS + 1 };
      const d = decideSignupAttribution(FIRST, after, CREATED, NOW);
      expect(d.kind).toBe('write');
      if (d.kind !== 'write') return;
      expect(d.fields.signup_src).toBe('ig');
      expect(d.fields.signup_code).toBe('IG-REEL-01');
      expect(d.fields.signup_first_touch).toEqual(FIRST);
    });

    it('records nothing when every touch postdates the account', () => {
      const after = (t: Attribution) => ({ ...t, ts: CREATED + CLOCK_SLACK_MS + 1 });
      expect(decideSignupAttribution(after(FIRST), after(LAST), CREATED, NOW)).toEqual({ kind: 'none' });
    });

    it('drops a first touch that postdates the account from signup_first_touch', () => {
      const lateFirst = { ...FIRST, ts: CREATED + CLOCK_SLACK_MS + 1 };
      const d = decideSignupAttribution(lateFirst, LAST, CREATED, NOW);
      expect(d.kind === 'write' && d.fields.signup_first_touch).toBeNull();
    });
  });

  it('records nothing when neither touch is tagged (a landing path alone is not a tag)', () => {
    expect(decideSignupAttribution(touch({}), touch({}), CREATED, NOW)).toEqual({ kind: 'none' });
    expect(decideSignupAttribution(null, null, CREATED, NOW)).toEqual({ kind: 'none' });
  });
});

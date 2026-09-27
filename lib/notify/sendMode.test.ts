/**
 * T-AV19 Part B. The rule every send path and av-guard asks.
 *
 * Mutation proofs (run by hand, recorded in the T-AV19 report):
 *   - delete the isLoopbackUrl line in resolveSendMode -> "a localhost Supabase
 *     URL forces log even when the env says live" goes red.
 *   - change `=== 'log'` to `!== 'live'` -> "unset is live" goes red.
 */
import { describe, it, expect } from 'vitest';
import { resolveSendMode, emailMode, pushMode, isLoopbackUrl, maskEmail } from './sendMode';

const PROD = 'https://abcdefgh.supabase.co';

describe('resolveSendMode: the env rule', () => {
  it('unset is live, so main sends exactly as today after the merge', () => {
    expect(resolveSendMode('email', { NEXT_PUBLIC_SUPABASE_URL: PROD })).toEqual({
      mode: 'live',
      reason: 'default-live',
    });
    expect(pushMode({ NEXT_PUBLIC_SUPABASE_URL: PROD })).toBe('live');
  });

  it('only the exact value "log" means log', () => {
    expect(emailMode({ NEXT_PUBLIC_SUPABASE_URL: PROD, EMAIL_MODE: 'log' })).toBe('log');
    for (const v of ['LOG', ' log', 'true', 'live', 'off', '']) {
      expect(emailMode({ NEXT_PUBLIC_SUPABASE_URL: PROD, EMAIL_MODE: v })).toBe('live');
    }
  });

  it('reads EMAIL_MODE for email and PUSH_MODE for push, never the other', () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: PROD, EMAIL_MODE: 'log' };
    expect(emailMode(env)).toBe('log');
    expect(pushMode(env)).toBe('live');
  });
});

describe('resolveSendMode: the localhost fail-safe', () => {
  it('a localhost Supabase URL forces log even when the env says live', () => {
    for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) {
      const env = { NEXT_PUBLIC_SUPABASE_URL: url, EMAIL_MODE: 'live', PUSH_MODE: 'live' };
      expect(resolveSendMode('email', env)).toEqual({ mode: 'log', reason: 'local-supabase' });
      expect(resolveSendMode('push', env)).toEqual({ mode: 'log', reason: 'local-supabase' });
    }
  });

  it('does not treat a lookalike host as local', () => {
    for (const url of ['https://localhost.example.com', 'https://127.0.0.1.nip.io', 'not a url', undefined]) {
      expect(isLoopbackUrl(url)).toBe(false);
    }
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain only', () => {
    expect(maskEmail('ana@example.com')).toBe('a***@example.com');
    expect(maskEmail('nobody')).toBe('***');
  });
});

/**
 * Tests for isValidCronAuth (lib/auth/cron.ts).
 *
 * This guards every /api/cron/* job. The regression it prevents is
 * the exact bug the audit found: a missing/empty CRON_SECRET making
 * the expected bearer `Bearer undefined` / `Bearer `, i.e. every
 * scheduled job world-callable. The "fails closed" cases below are
 * the security-critical ones — they must stay red-on-regression.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { isValidCronAuth } from './cron';

const ORIGINAL = process.env.CRON_SECRET;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

describe('isValidCronAuth — fails closed on misconfig', () => {
  it('rejects everything when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET;
    expect(isValidCronAuth('Bearer undefined')).toBe(false);
    expect(isValidCronAuth('Bearer ')).toBe(false);
    expect(isValidCronAuth('Bearer anything')).toBe(false);
    expect(isValidCronAuth(null)).toBe(false);
  });

  it('rejects everything when CRON_SECRET is empty', () => {
    process.env.CRON_SECRET = '';
    expect(isValidCronAuth('Bearer ')).toBe(false);
    expect(isValidCronAuth('Bearer ')).toBe(false);
    expect(isValidCronAuth('')).toBe(false);
  });
});

describe('isValidCronAuth — with a real secret', () => {
  it('accepts the exact matching bearer token', () => {
    process.env.CRON_SECRET = 's3cr3t-value';
    expect(isValidCronAuth('Bearer s3cr3t-value')).toBe(true);
  });

  it('rejects a wrong token, missing header, and prefix-only', () => {
    process.env.CRON_SECRET = 's3cr3t-value';
    expect(isValidCronAuth('Bearer wrong')).toBe(false);
    expect(isValidCronAuth('Bearer s3cr3t-valu')).toBe(false);
    expect(isValidCronAuth('Bearer s3cr3t-value ')).toBe(false);
    expect(isValidCronAuth('s3cr3t-value')).toBe(false);
    expect(isValidCronAuth('Bearer')).toBe(false);
    expect(isValidCronAuth(null)).toBe(false);
    expect(isValidCronAuth(undefined)).toBe(false);
  });
});

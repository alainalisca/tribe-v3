import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, 'route.ts'), 'utf-8');

describe('reconcile daily-cap contract', () => {
  it('imports SYSTEM_DAILY_ENROLL_CAP from constants', () => {
    expect(src).toContain('SYSTEM_DAILY_ENROLL_CAP');
    expect(src).toMatch(/import.*SYSTEM_DAILY_ENROLL_CAP.*from.*constants/);
  });

  it('counts today system enrollments before creating new ones', () => {
    const capIdx = src.indexOf('SYSTEM_DAILY_ENROLL_CAP');
    const insertIdx = src.indexOf("from('tribe_os_sequence_enrollments').insert");
    expect(capIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeLessThan(insertIdx);
  });

  it('slices eligible candidates to remaining cap', () => {
    expect(src).toMatch(/eligible\.slice\(0,\s*remaining\)/);
  });

  it('skips enrollment entirely when remaining <= 0', () => {
    expect(src).toMatch(/remaining\s*>\s*0/);
  });
});

describe('reconcile candidate ordering contract', () => {
  it('sorts eligible by score descending then plan value descending', () => {
    expect(src).toContain('eligible.sort');
    expect(src).toMatch(/scoreDiff.*=.*\(b\.score.*\).*-.*\(a\.score/);
    expect(src).toContain('monthlyValueCents');
  });

  it('imports monthlyValueCents from forecast', () => {
    expect(src).toMatch(/import.*monthlyValueCents.*from.*forecast/);
  });

  it('queries gym_plans (not gym_plan_prices)', () => {
    expect(src).toContain("from('gym_plans')");
    expect(src).not.toContain("from('gym_plan_prices')");
  });
});

describe('reconcile pending-expiry contract', () => {
  it('imports PENDING_EXPIRY_DAYS from constants', () => {
    expect(src).toMatch(/import.*PENDING_EXPIRY_DAYS.*from.*constants/);
  });

  it('expires pending approvals to stopped with correct reason', () => {
    expect(src).toContain("status: 'stopped'");
    expect(src).toContain("stopped_reason: 'Sin respuesta del dueño'");
  });

  it('uses PENDING_EXPIRY_DAYS for the threshold, not a hardcoded number', () => {
    expect(src).toContain('PENDING_EXPIRY_DAYS');
    expect(src).toMatch(/PENDING_EXPIRY_DAYS\s*\*/);
  });

  it('tracks expired_pending in counts', () => {
    expect(src).toContain('expired_pending');
    expect(src).toMatch(/counts\.expired_pending\+\+/);
  });

  it('expiry happens before autonomy enrollment (stale pending frees up clients)', () => {
    const expiryIdx = src.indexOf("stopped_reason: 'Sin respuesta del dueño'");
    const autonomyIdx = src.indexOf('Autonomy: suggest/auto enrollment');
    expect(expiryIdx).toBeGreaterThan(-1);
    expect(autonomyIdx).toBeGreaterThan(-1);
    expect(expiryIdx).toBeLessThan(autonomyIdx);
  });
});

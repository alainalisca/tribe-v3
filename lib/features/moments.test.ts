import { describe, it, expect } from 'vitest';
import { isMomentsEnabled } from './moments';

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe('MOMENTS_ENABLED (T-MOM1)', () => {
  it('off in Production unless set, on in Preview and local development', () => {
    expect(isMomentsEnabled(env({ NODE_ENV: 'production', VERCEL_ENV: 'production' }))).toBe(false);
    expect(isMomentsEnabled(env({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }))).toBe(true);
    expect(isMomentsEnabled(env({ NODE_ENV: 'development' }))).toBe(true);
    expect(isMomentsEnabled(env({ NODE_ENV: 'production' }))).toBe(false);
  });
  it('the variable wins either way', () => {
    expect(isMomentsEnabled(env({ VERCEL_ENV: 'production', MOMENTS_ENABLED: 'true' }))).toBe(true);
    expect(isMomentsEnabled(env({ VERCEL_ENV: 'preview', MOMENTS_ENABLED: 'false' }))).toBe(false);
  });
  it('never reads the Part F flag', () => {
    expect(isMomentsEnabled(env({ VERCEL_ENV: 'production', MOMENTS_POSTS_ENABLED: 'true' }))).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { shareImageOrigin } from './shareImageOrigin';

/** T-SHARE1: a preview names its own cards; production names tribelatam.com. */
describe('shareImageOrigin', () => {
  it('is tribelatam.com in production, locally and in tests', () => {
    expect(shareImageOrigin({ VERCEL_ENV: 'production', VERCEL_URL: 'tribe-v3-abc.vercel.app' })).toBe(
      'https://tribelatam.com'
    );
    expect(shareImageOrigin({})).toBe('https://tribelatam.com');
    expect(shareImageOrigin({ VERCEL_ENV: 'development', VERCEL_BRANCH_URL: 'x.vercel.app' })).toBe(
      'https://tribelatam.com'
    );
  });

  it("is the preview's branch host, else its deployment host", () => {
    expect(
      shareImageOrigin({
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'tribe-v3-git-feat-og-cards-team.vercel.app',
        VERCEL_URL: 'tribe-v3-abc123-team.vercel.app',
      })
    ).toBe('https://tribe-v3-git-feat-og-cards-team.vercel.app');
    expect(shareImageOrigin({ VERCEL_ENV: 'preview', VERCEL_URL: 'tribe-v3-abc123-team.vercel.app' })).toBe(
      'https://tribe-v3-abc123-team.vercel.app'
    );
    expect(shareImageOrigin({ VERCEL_ENV: 'preview' })).toBe('https://tribelatam.com');
  });
});

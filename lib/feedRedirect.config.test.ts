// @vitest-environment node
import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config';

/** T-POLISH1: the old routes land somewhere real. */
describe('next.config redirects', () => {
  it('/feed and anything under it go to /, /my-sessions to /sessions', async () => {
    const rules = await (nextConfig.redirects as () => Promise<Array<{ source: string; destination: string }>>)();
    const to = (src: string) => rules.find((r) => r.source === src)?.destination;
    expect(to('/feed')).toBe('/');
    expect(to('/feed/:path*')).toBe('/');
    expect(to('/my-sessions')).toBe('/sessions');
  });
});

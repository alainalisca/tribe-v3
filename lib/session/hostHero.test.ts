import { describe, it, expect, vi, beforeEach } from 'vitest';

/** T-UI-SD1: the signed-in hero comes from the host's coach-card chain, and never holds the page. */
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));
const state = vi.hoisted(() => ({
  host: { id: 'h1' } as { id: string } | null,
  hero: { url: 'https://x/card.jpg', x: 50, y: 20 } as { url: string; x: number; y: number } | null,
  delay: 0,
  throws: false,
}));
vi.mock('@/lib/og/sessionCard', () => ({
  loadSessionForCard: async () => (state.host === undefined ? null : { row: {}, partnerName: null, host: state.host }),
}));
vi.mock('@/lib/site/coachPage', () => ({
  coachHeroPhoto: async () => {
    if (state.throws) throw new Error('boom');
    await new Promise((r) => setTimeout(r, state.delay));
    return state.hero;
  },
}));

import { hostHeroFor } from './publicSession';

beforeEach(() => {
  state.host = { id: 'h1' };
  state.hero = { url: 'https://x/card.jpg', x: 50, y: 20 };
  state.delay = 0;
  state.throws = false;
});

describe('hostHeroFor', () => {
  it("is the host's card photo", async () => {
    expect(await hostHeroFor('s1')).toEqual({ url: 'https://x/card.jpg', x: 50, y: 20 });
  });

  it('is null with no host, no usable photo, an error, or past the timeout', async () => {
    state.host = null;
    expect(await hostHeroFor('s1')).toBeNull();
    state.host = { id: 'h1' };
    state.hero = null;
    expect(await hostHeroFor('s1')).toBeNull();
    state.hero = { url: 'https://x/card.jpg', x: 50, y: 20 };
    state.throws = true;
    expect(await hostHeroFor('s1')).toBeNull();
    state.throws = false;
    state.delay = 200;
    expect(await hostHeroFor('s1', 20)).toBeNull();
  });
});

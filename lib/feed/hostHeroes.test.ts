import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], inArg: [] as string[], error: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          db.inArg = ids;
          return { data: db.rows, error: db.error };
        },
      }),
    }),
  }),
}));
const hero = vi.hoisted(() => ({ delay: 0 }));
vi.mock('@/lib/site/coachPage', () => ({
  coachHeroPhoto: async (c: { id: string; avatar_url: string | null }) => {
    await new Promise((r) => setTimeout(r, hero.delay));
    return c.avatar_url ? { url: c.avatar_url, x: 50, y: 20 } : null;
  },
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { hostHeroesFor } from './hostHeroes';

/** T-UI-FD1: one read for every host on the feed, the card chain per host, never a hidden account. */
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const user = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  avatar_url: `https://x/${id}.jpg`,
  is_test_account: false,
  banned: false,
  deleted_at: null,
  ...over,
});

beforeEach(() => {
  db.rows = [];
  db.error = null;
  hero.delay = 0;
});

describe('hostHeroesFor', () => {
  it('maps each visible host to its photo or null, in one read', async () => {
    db.rows = [user(A), user(B, { avatar_url: null }), user(C, { is_test_account: true })];
    const out = await hostHeroesFor([A, B, C, A, 'not-a-uuid']);
    expect(db.inArg).toEqual([A, B, C]);
    expect(out).toEqual({ [A]: { url: `https://x/${A}.jpg`, x: 50, y: 20 }, [B]: null });
  });

  it('a failed read or a slow pick never holds the feed', async () => {
    db.error = { message: 'down' };
    expect(await hostHeroesFor([A])).toEqual({});
    db.error = null;
    db.rows = [user(A)];
    hero.delay = 200;
    expect(await hostHeroesFor([A], 20)).toEqual({});
  });
});

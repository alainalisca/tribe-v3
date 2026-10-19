import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** T-MOM1: the gate every manager route opens with, and every route wired to it. */
const auth = vi.hoisted(() => ({ userId: null as string | null }));
const ctx = vi.hoisted(() => ({
  value: null as null | {
    userId: string;
    hostId: string;
    isAdmin: boolean;
    isPhotographer: boolean;
    sessionStatus: string;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.userId ? { id: auth.userId } : null } }) },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('./permissions', async (orig) => ({
  ...(await orig<typeof import('./permissions')>()),
  loadUploadContext: async () => ctx.value,
}));

import { guardMomentsManager } from './routeGuard';

const S = 'cfcafad0-80ec-43ea-a018-eafcf99c8648';
const as = (who: 'host' | 'admin' | 'photographer' | 'participant' | 'stranger') => {
  auth.userId = who;
  ctx.value = {
    userId: who,
    hostId: 'host',
    isAdmin: who === 'admin',
    isPhotographer: who === 'photographer',
    sessionStatus: 'active',
  };
};

beforeEach(() => vi.stubEnv('MOMENTS_ENABLED', 'true'));
afterEach(() => vi.unstubAllEnvs());

describe('guardMomentsManager: who may upload, tag and deliver', () => {
  it.each([
    ['host', true],
    ['admin', true],
    ['photographer', true],
    ['participant', false],
    ['stranger', false],
  ] as const)('%s', async (who, allowed) => {
    as(who);
    const g = await guardMomentsManager(S);
    expect(g.ok).toBe(allowed);
    if (!g.ok) expect(g.res.status).toBe(403);
  });

  it('signed out is 401; a bad id or an unknown session is 404', async () => {
    auth.userId = null;
    expect(((await guardMomentsManager(S)) as { res: Response }).res.status).toBe(401);
    as('host');
    expect(((await guardMomentsManager('nope')) as { res: Response }).res.status).toBe(404);
    ctx.value = null;
    expect(((await guardMomentsManager(S)) as { res: Response }).res.status).toBe(404);
  });

  it('with MOMENTS_ENABLED off, everything is a 404, even for the host', async () => {
    vi.stubEnv('MOMENTS_ENABLED', 'false');
    as('host');
    expect(((await guardMomentsManager(S)) as { res: Response }).res.status).toBe(404);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T-MOM1 Part C: "Ver mis fotos" comes back here. Signed out goes to sign-up
 * (with this step as returnTo); signed in claims and lands on Momentos with
 * that session's batch open; expired or someone else's goes back to the link.
 */
const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  result: { ok: true, sessionId: '11111111-1111-4111-8111-111111111111' } as unknown,
  claimed: [] as string[],
}));
vi.mock('@/lib/features/moments', () => ({ isMomentsEnabled: () => true }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/moments/routeGuard', () => ({ signedInUser: async () => h.user }));
vi.mock('@/lib/moments/claim', async (orig) => ({
  ...(await orig<typeof import('@/lib/moments/claim')>()),
  claimInvite: async (_s: unknown, token: string, userId: string) => {
    h.claimed.push(`${token}:${userId}`);
    return h.result;
  },
}));

import { GET } from './route';

const TOKEN = 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z';
const call = (token = TOKEN) =>
  GET(new Request(`https://tribelatam.com/m/${token}/claim/`), { params: Promise.resolve({ token }) });

beforeEach(() => {
  h.user = null;
  h.claimed = [];
  h.result = { ok: true, sessionId: '11111111-1111-4111-8111-111111111111' };
});

describe('/m/<token>/claim/ (T-MOM1 Part C)', () => {
  it('signed out: to sign-up, coming back to this step', async () => {
    const res = await call();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      `https://tribelatam.com/auth/?signup=1&returnTo=${encodeURIComponent(`/m/${TOKEN}/claim/`)}`
    );
    expect(h.claimed).toEqual([]);
  });

  it('a fresh account claims and lands on Momentos with the batch open (the deep link)', async () => {
    h.user = { id: 'fresh' };
    const res = await call();
    expect(h.claimed).toEqual([`${TOKEN}:fresh`]);
    expect(res.headers.get('location')).toBe(
      'https://tribelatam.com/profile/momentos/?s=11111111-1111-4111-8111-111111111111'
    );
  });

  it('expired, or claimed by someone else: back to the link, which says so', async () => {
    h.user = { id: 'late' };
    h.result = { ok: false, status: 'expired' };
    expect((await call()).headers.get('location')).toBe(`https://tribelatam.com/m/${TOKEN}/`);
  });

  it('a malformed token is a 404', async () => {
    h.user = { id: 'x' };
    expect((await call('nope')).status).toBe(404);
  });
});

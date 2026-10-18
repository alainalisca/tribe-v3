import { describe, it, expect, vi } from 'vitest';

/** T-SHARE1 Part C: /i/<handle> and /i/<uuid> are one page with one card. */
const row = {
  id: '34d56f30-f8d2-4588-beaa-07ee53d13d1d',
  name: 'Andrés Varón',
  sports: ['CrossFit'],
  handle: 'andres',
  is_instructor: true,
  banned: false,
  deleted_at: null,
  is_test_account: false,
  instructor_bio: null,
  bio: null,
};
const loadCoach = vi.fn(async (idOrHandle: string) => (idOrHandle === row.id || idOrHandle === 'andres' ? row : null));
vi.mock('@/lib/og/coachCard', () => ({
  loadCoach: (x: string) => loadCoach(x),
  coachGym: async () => 'CrossFit BullBox',
  coachCardVersion: () => 'v123',
  isListedCoach: (c: typeof row) => c.is_instructor && !c.banned && !c.deleted_at,
}));

import { generateMetadata } from './page';

const meta = (id: string) => generateMetadata({ params: Promise.resolve({ id }) });

describe('/i/<handle> and /i/<uuid>', () => {
  it('give the same page: same title, same address, same card', async () => {
    const [byHandle, byId] = await Promise.all([meta('andres'), meta(row.id)]);
    expect(byId).toEqual(byHandle);
    expect(byHandle.openGraph?.url).toMatch(/\/i\/andres\/$/);
    expect(byHandle.openGraph?.images).toEqual([
      expect.objectContaining({ url: expect.stringMatching(/\/i\/andres\/card\/\?v=v123$/), width: 1200, height: 630 }),
    ]);
  });

  it('an unknown handle is not a coach page', async () => {
    expect((await meta('nobody')).title).toBe('Instructor no disponible | Tribe');
  });
});

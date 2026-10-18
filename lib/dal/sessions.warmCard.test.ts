import { describe, it, expect, vi, beforeEach } from 'vitest';

/** T-JOIN1: creating or editing a session warms its share card. */
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/storage/privateMedia', () => ({ signRecapPhotoUrls: vi.fn() }));
const warm = vi.fn();
vi.mock('@/lib/share/warmSessionCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/share/warmSessionCard')>()),
  warmSessionCard: (id: string) => warm(id),
}));

import { insertSession, updateSessionAsHost } from './sessions';

const SESSION = '11111111-1111-4111-8111-111111111111';
const current = {
  creator_id: 'host',
  date: '2030-10-21',
  start_time: '18:30:00',
  is_recurring: false,
  recurring_parent_id: null,
  title: null,
  sport: 'Yoga',
  location: 'El Poblado',
  location_lat: 6.2,
  location_lng: -75.5,
  partner_id: null,
  partner_status: null,
};

function client() {
  const updates: unknown[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.single = async () =>
      table === 'sessions'
        ? { data: q.inserted ?? current, error: null }
        : { data: { is_instructor: true }, error: null };
    q.insert = (row: Record<string, unknown>) => {
      q.inserted = { id: SESSION, ...row };
      return q;
    };
    q.update = (u: unknown) => {
      updates.push(u);
      return { eq: async () => ({ error: null }) };
    };
    return q;
  };
  return { c: { from, auth: { getUser: async () => ({ data: { user: { id: 'host' } } }) } } as never, updates };
}

beforeEach(() => warm.mockClear());

describe('card warm-up on write', () => {
  it("create warms the new session's card", async () => {
    const { c } = client();
    const res = await insertSession(c, { creator_id: 'host', sport: 'Yoga', date: '2030-10-21' } as never);
    expect(res.success).toBe(true);
    expect(warm).toHaveBeenCalledWith(SESSION);
  });

  it('an edit to something the card shows warms it', async () => {
    const { c } = client();
    await updateSessionAsHost(c, SESSION, { title: 'Yoga al atardecer' } as never);
    expect(warm).toHaveBeenCalledWith(SESSION);
    warm.mockClear();
    await updateSessionAsHost(c, SESSION, { start_time: '19:00:00' } as never);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('an edit the card does not show does not', async () => {
    const { c } = client();
    await updateSessionAsHost(c, SESSION, { description: 'Trae tu mat', title: null, sport: 'Yoga' } as never);
    expect(warm).not.toHaveBeenCalled();
  });
});

describe('T-JOIN1b: the test-session switch saves', () => {
  it('create sends is_test with the new session', async () => {
    const inserted: Record<string, unknown>[] = [];
    const { c } = client();
    const from = (c as unknown as { from: (t: string) => Record<string, unknown> }).from;
    (c as unknown as { from: unknown }).from = (table: string) => {
      const q = from(table);
      const insert = q.insert as (row: Record<string, unknown>) => unknown;
      q.insert = (row: Record<string, unknown>) => (inserted.push(row), insert(row));
      return q;
    };
    await insertSession(c, { creator_id: 'host', sport: 'Yoga', date: '2030-10-21', is_test: true } as never);
    expect(inserted[0]).toMatchObject({ is_test: true });
  });

  it('edit sends is_test, and marking a session as a test re-warms its card', async () => {
    const { c, updates } = client();
    await updateSessionAsHost(c, SESSION, { is_test: true } as never);
    expect(updates[0]).toMatchObject({ is_test: true });
    expect(warm).toHaveBeenCalledWith(SESSION);
  });
});

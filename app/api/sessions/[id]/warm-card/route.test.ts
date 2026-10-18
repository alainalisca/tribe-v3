import { describe, it, expect, vi, beforeEach } from 'vitest';

/** T-JOIN1: the warm-card route fetches the same versioned card URL the page's og:image names. */
const afterCallbacks: (() => unknown)[] = [];
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (cb: () => unknown) => afterCallbacks.push(cb),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/http/shareImageOrigin', () => ({ shareImageOrigin: () => 'https://tribelatam.com' }));
const loaded = { row: { id: 's' }, partnerName: null, host: null };
const loadSessionForCard = vi.fn();
vi.mock('@/lib/og/sessionCard', () => ({
  loadSessionForCard: (id: string) => loadSessionForCard(id),
  sessionCardVersion: () => 'abc123',
}));

import { POST } from './route';

const ID = '11111111-1111-4111-8111-111111111111';
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 200 }))
  );
});

describe('POST /api/sessions/[id]/warm-card', () => {
  it('fetches the versioned card after the response', async () => {
    loadSessionForCard.mockResolvedValue(loaded);
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ warmed: true, url: `https://tribelatam.com/session/${ID}/card/?v=abc123` });
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(fetch).toHaveBeenCalledWith(`https://tribelatam.com/session/${ID}/card/?v=abc123`, expect.anything());
  });

  it('a session that is not public: nothing to warm', async () => {
    loadSessionForCard.mockResolvedValue(null);
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx());
    expect((await res.json()).warmed).toBe(false);
    expect(afterCallbacks).toHaveLength(0);
  });

  it('refuses an id that is not a UUID', async () => {
    expect((await POST(new Request('http://x', { method: 'POST' }), ctx('nope'))).status).toBe(400);
  });
});

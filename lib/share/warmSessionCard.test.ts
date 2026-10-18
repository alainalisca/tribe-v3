import { describe, it, expect, vi } from 'vitest';
import { cardFieldsChanged, warmSessionCard } from './warmSessionCard';

/** T-JOIN1: which edits change the card, and the browser's fire-and-forget call. */
describe('cardFieldsChanged', () => {
  const before = { title: null, sport: 'Yoga', date: '2030-10-21', start_time: '18:30:00', location: 'X' };
  it.each([
    [{ title: 'Nuevo' }, true],
    [{ date: '2030-10-22' }, true],
    [{ location_lat: 6.21 }, true],
    [{ description: 'otro texto' }, false],
    [{ title: null, sport: 'Yoga' }, false],
    [{ max_participants: 20 }, false],
  ])('%o -> %s', (update, expected) => {
    expect(cardFieldsChanged(before, update)).toBe(expected);
  });
});

describe('warmSessionCard', () => {
  it('posts to the warm-card route and never throws', () => {
    const f = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', f);
    warmSessionCard('11111111-1111-4111-8111-111111111111');
    expect(f).toHaveBeenCalledWith('/api/sessions/11111111-1111-4111-8111-111111111111/warm-card/', {
      method: 'POST',
      keepalive: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline')))
    );
    expect(() => warmSessionCard('x')).not.toThrow();
  });
});

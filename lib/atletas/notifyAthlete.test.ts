/** T-AV27b: the door's fire-and-forget call. It never throws into the caller. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyAthlete } from './notifyAthlete';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('notifyAthlete', () => {
  it('posts the pass and the event to /api/atletas/notify/', () => {
    fetchMock.mockResolvedValue({ ok: true });
    notifyAthlete('AV-CARB', 'joined');
    expect(fetchMock).toHaveBeenCalledWith('/api/atletas/notify/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passCode: 'AV-CARB', event: 'joined' }),
      // T-AV27c: survives the coach leaving the page right after the tap.
      keepalive: true,
    });
  });

  it('a network failure is swallowed (logged), never thrown', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => notifyAthlete('AV-CARB', 'arrived')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { fetchPendingRequestCount } from './participants';

/** "Solicitudes (N)" in Mis sesiones counts the way /requests lists: pending roster rows of the host's sessions. */
function makeClient(result: { count?: number | null; error?: { message: string } | null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq']) {
    b[m] = (...a: unknown[]) => {
      calls.push([m, ...a]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve({ count: result.count ?? null, error: result.error ?? null });
  return {
    client: {
      from: (t: string) => {
        calls.push(['from', t]);
        return b;
      },
    } as never,
    calls,
  };
}

describe('fetchPendingRequestCount', () => {
  it('head-counts pending rows of the given sessions in the roster view', async () => {
    const { client, calls } = makeClient({ count: 3 });
    expect(await fetchPendingRequestCount(client, ['s1', 's2'])).toEqual({ success: true, data: 3 });
    expect(calls).toContainEqual(['from', 'session_participants_roster']);
    expect(calls).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(calls).toContainEqual(['in', 'session_id', ['s1', 's2']]);
    expect(calls).toContainEqual(['eq', 'status', 'pending']);
  });

  it('no sessions: zero, and no query', async () => {
    const { client, calls } = makeClient({ count: 9 });
    expect(await fetchPendingRequestCount(client, [])).toEqual({ success: true, data: 0 });
    expect(calls).toEqual([]);
  });

  it('a query error is a failure', async () => {
    const { client } = makeClient({ error: { message: 'boom' } });
    expect(await fetchPendingRequestCount(client, ['s1'])).toEqual({ success: false, error: 'boom' });
  });
});

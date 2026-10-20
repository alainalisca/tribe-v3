import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { fetchSessionsByCreatorCount } from './sessions';

/** "Creadas" on both profiles: real sessions only, never a Sesión de prueba (T-POLISH1). */
describe('fetchSessionsByCreatorCount', () => {
  it('counts the creator sessions that are not test sessions', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) {
      b[m] = (...a: unknown[]) => {
        calls.push([m, ...a]);
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve({ count: 4, error: null });
    const client = { from: () => b } as never;
    expect(await fetchSessionsByCreatorCount(client, 'host-1')).toEqual({ success: true, data: 4 });
    expect(calls).toContainEqual(['eq', 'creator_id', 'host-1']);
    expect(calls).toContainEqual(['eq', 'is_test', false]);
  });
});

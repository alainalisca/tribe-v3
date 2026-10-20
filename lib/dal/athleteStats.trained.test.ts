import { describe, it, expect, vi } from 'vitest';

/**
 * The trained rule (lib/dal/athleteStats.ts): confirmed, and the session's
 * date is today or earlier in Medellín. My Training, the own profile and the
 * public profile all read it through trainedParticipations.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { trainedParticipations, fetchTrainedSessionCount, fetchAthleteStats } from './athleteStats';

/** A query builder that records every filter and resolves to `result`. */
function makeClient(result: { data?: unknown; count?: number | null; error?: { message: string } | null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lte']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: result.data ?? null, count: result.count ?? null, error: result.error ?? null });
  const from = vi.fn((table: string) => {
    calls.push(['from', table]);
    return builder;
  });
  return { client: { from } as never, calls };
}

describe('trainedParticipations', () => {
  it('confirmed rows of this person whose session date is today or earlier in Bogotá', async () => {
    const { client, calls } = makeClient({ data: [] });
    // 01:30 UTC on 2026-10-21 is still 2026-10-20 in Medellín (UTC-5).
    await trainedParticipations(
      client,
      'u-1',
      'id, sessions:session_id!inner(date)',
      undefined,
      new Date('2026-10-21T01:30:00Z')
    );
    expect(calls).toContainEqual(['from', 'session_participants']);
    expect(calls).toContainEqual(['eq', 'user_id', 'u-1']);
    expect(calls).toContainEqual(['eq', 'status', 'confirmed']);
    expect(calls).toContainEqual(['lte', 'sessions.date', '2026-10-20']);
  });
});

describe('fetchTrainedSessionCount', () => {
  it('returns the head count under the trained rule, with the session joined inner', async () => {
    const { client, calls } = makeClient({ count: 7 });
    const res = await fetchTrainedSessionCount(client, 'u-1');
    expect(res).toEqual({ success: true, data: 7 });
    const select = calls.find((c) => c[0] === 'select');
    expect(select?.[1]).toContain('sessions:session_id!inner(date)');
    expect(select?.[2]).toEqual({ count: 'exact', head: true });
    expect(calls.some((c) => c[0] === 'lte' && c[1] === 'sessions.date')).toBe(true);
  });

  it('a missing id never reaches the query', async () => {
    const { client, calls } = makeClient({ count: 99 });
    expect(await fetchTrainedSessionCount(client, '')).toEqual({ success: true, data: 0 });
    expect(await fetchTrainedSessionCount(client, 'undefined')).toEqual({ success: true, data: 0 });
    expect(calls).toEqual([]);
  });

  it('a query error is a failure, not a zero', async () => {
    const { client } = makeClient({ error: { message: 'boom' } });
    expect(await fetchTrainedSessionCount(client, 'u-1')).toEqual({ success: false, error: 'boom' });
  });
});

describe('My Training reads the same rule', () => {
  it('fetchAthleteStats filters confirmed rows to sessions on or before today', async () => {
    const { client, calls } = makeClient({
      data: [
        {
          session_id: 's1',
          sessions: {
            id: 's1',
            title: null,
            sport: 'Running',
            date: '2026-10-01',
            start_time: '07:00',
            location: null,
            creator_id: 'h',
            creator: null,
          },
        },
      ],
    });
    const res = await fetchAthleteStats(client, 'u-1');
    expect(res.success).toBe(true);
    expect(calls).toContainEqual(['eq', 'status', 'confirmed']);
    expect(calls.some((c) => c[0] === 'lte' && c[1] === 'sessions.date')).toBe(true);
    const select = calls.find((c) => c[0] === 'select');
    expect(String(select?.[1])).toContain('sessions:session_id!inner(');
  });
});

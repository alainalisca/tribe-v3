import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

import { updateSessionAsHost } from './sessions';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeSupabase(session: Record<string, unknown>) {
  const updateMock = vi.fn(() => ({ error: null }));
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'host-1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: async () => ({ data: session, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => updateMock()),
      })),
    })),
    _updateMock: updateMock,
  };
}

describe('updateSessionAsHost edit guard timezone under TZ=UTC', () => {
  const session = {
    creator_id: 'host-1',
    date: '2026-07-10',
    start_time: '18:00:00',
    is_recurring: false,
    recurring_parent_id: null,
  };

  it('allows editing at 22:00Z (17:00 Bogotá, 1h before the session)', async () => {
    // 18:00 Bogotá = 23:00 UTC. At 22:00 UTC the session hasn't started.
    vi.setSystemTime(new Date('2026-07-10T22:00:00Z'));

    const supabase = makeSupabase(session);
    const result = await updateSessionAsHost(supabase as never, 'sess-1', { sport: 'Running' });

    expect(result.success).toBe(true);
  });

  it('blocks editing after 23:00Z (18:00 Bogotá, session has started)', async () => {
    // 18:00 Bogotá = 23:00 UTC. At 23:01 UTC the session is in the past.
    vi.setSystemTime(new Date('2026-07-10T23:01:00Z'));

    const supabase = makeSupabase(session);
    const result = await updateSessionAsHost(supabase as never, 'sess-1', { sport: 'Running' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/past/i);
  });

  it('would have wrongly blocked at 18:01 UTC under the old bug', async () => {
    // Old bug: new Date('2026-07-10T18:00:00') → 18:00 UTC. At 18:01 UTC
    // it would be "past". With the fix, 18:00 Bogotá = 23:00 UTC, so 18:01 UTC
    // is still ~5h before the session.
    vi.setSystemTime(new Date('2026-07-10T18:01:00Z'));

    const supabase = makeSupabase(session);
    const result = await updateSessionAsHost(supabase as never, 'sess-1', { sport: 'Running' });

    expect(result.success).toBe(true);
  });
});

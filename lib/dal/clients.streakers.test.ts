/**
 * Tests for listActiveStreakers (lib/dal/clients.ts).
 *
 * Covers:
 *   - Tenant scoping: gym-id path vs instructor-user-id fallback
 *   - Defaults: minStreakDays=7, staleAfterDays=7, limit=10
 *   - Option overrides pass through to the query
 *   - Limit clamping (1 ≤ limit ≤ 50)
 *   - Row hydration into ActiveStreaker shape
 *   - Error path (graceful failure)
 *
 * The function relies on the DB to do the actual threshold filter
 * (.gte('current_streak_days', minStreakDays) etc) — so the tests
 * focus on (a) verifying the right filters are passed to PostgREST
 * and (b) verifying returned rows hydrate correctly. The "would the
 * DB filter actually exclude a 5-day streak" question is a DB contract,
 * not a unit-test concern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listActiveStreakers } from './clients';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface StreakerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  current_streak_days: number;
  longest_streak_days: number;
  last_seen_at: string | null;
}

interface CapturedQuery {
  eqCalls: Array<{ col: string; val: unknown }>;
  gteCalls: Array<{ col: string; val: unknown }>;
  notCalls: Array<{ col: string; op: string; val: unknown }>;
  orderCalls: Array<{ col: string; ascending: boolean }>;
  limit?: number;
  selectString?: string;
}

function newCapture(): CapturedQuery {
  return { eqCalls: [], gteCalls: [], notCalls: [], orderCalls: [] };
}

function buildSupabaseMock(opts: {
  rows?: StreakerRow[];
  error?: { message: string } | null;
  capture?: CapturedQuery;
}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table !== 'clients') throw new Error(`unexpected table: ${table}`);
      const chain: Record<string, unknown> = {};
      const fn = () => chain;
      chain.select = (s: string) => {
        if (opts.capture) opts.capture.selectString = s;
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        opts.capture?.eqCalls.push({ col, val });
        return chain;
      };
      chain.gte = (col: string, val: unknown) => {
        opts.capture?.gteCalls.push({ col, val });
        return chain;
      };
      chain.not = (col: string, op: string, val: unknown) => {
        opts.capture?.notCalls.push({ col, op, val });
        return chain;
      };
      chain.order = (col: string, options?: { ascending: boolean }) => {
        opts.capture?.orderCalls.push({ col, ascending: options?.ascending ?? true });
        return chain;
      };
      chain.limit = (n: number) => {
        if (opts.capture) opts.capture.limit = n;
        return chain;
      };
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: opts.rows ?? [], error: opts.error ?? null });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const SAMPLE_ROW: StreakerRow = {
  id: 'client-1',
  name: 'Carlos González',
  email: 'carlos@example.com',
  phone: '+573001234567',
  current_streak_days: 30,
  longest_streak_days: 47,
  last_seen_at: '2026-05-12T16:00:00Z',
};

describe('listActiveStreakers — tenant scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes by gym_id when a gymId is provided in context', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, { gymId: 'gym-42', instructorUserId: 'irrelevant' });
    expect(capture.eqCalls).toContainEqual({ col: 'gym_id', val: 'gym-42' });
    // When gymId is set we explicitly do NOT scope by instructor_user_id
    expect(capture.eqCalls).not.toContainEqual({ col: 'instructor_user_id', val: 'irrelevant' });
  });

  it('falls back to instructor_user_id when gymId is null', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(capture.eqCalls).toContainEqual({ col: 'instructor_user_id', val: 'instructor-1' });
    // No gym_id filter at all in the legacy path
    expect(capture.eqCalls.some((c) => c.col === 'gym_id')).toBe(false);
  });

  it('accepts a bare instructorUserId string as a shorthand context', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-2');
    expect(capture.eqCalls).toContainEqual({ col: 'instructor_user_id', val: 'instructor-2' });
  });
});

describe('listActiveStreakers — defaults + option overrides', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies the default min-streak (7), stale-after (7), and limit (10)', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1');
    expect(capture.gteCalls).toContainEqual({ col: 'current_streak_days', val: 7 });
    expect(capture.limit).toBe(10);
    // last_seen_at cutoff is a timestamp, so we can't assert exact
    // value — but it should be present.
    expect(capture.gteCalls.some((c) => c.col === 'last_seen_at')).toBe(true);
  });

  it('always filters out null last_seen_at as a not-null guard', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1');
    expect(capture.notCalls).toContainEqual({ col: 'last_seen_at', op: 'is', val: null });
  });

  it('always excludes archived clients', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1');
    expect(capture.eqCalls).toContainEqual({ col: 'archived', val: false });
  });

  it('passes a custom minStreakDays through', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1', { minStreakDays: 14 });
    expect(capture.gteCalls).toContainEqual({ col: 'current_streak_days', val: 14 });
  });

  it('honors a custom limit within the allowed range', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1', { limit: 25 });
    expect(capture.limit).toBe(25);
  });

  it('clamps the limit to the upper bound (50)', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1', { limit: 9999 });
    expect(capture.limit).toBe(50);
  });

  it('clamps the limit to the lower bound (1) when zero or negative', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1', { limit: 0 });
    expect(capture.limit).toBe(1);
  });
});

describe('listActiveStreakers — ordering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('orders by current_streak_days DESC (longest streaks first)', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1');
    // The first order call should be the primary sort.
    expect(capture.orderCalls[0]).toEqual({ col: 'current_streak_days', ascending: false });
  });

  it('orders by last_seen_at DESC as a tiebreaker (most-recently-active among ties)', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1');
    expect(capture.orderCalls[1]).toEqual({ col: 'last_seen_at', ascending: false });
  });
});

describe('listActiveStreakers — row hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty array when no streakers qualify', async () => {
    const supabase = buildSupabaseMock({ rows: [] });
    const result = await listActiveStreakers(supabase, 'instructor-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('hydrates rows into the ActiveStreaker shape', async () => {
    const supabase = buildSupabaseMock({ rows: [SAMPLE_ROW] });
    const result = await listActiveStreakers(supabase, 'instructor-1');
    expect(result.success).toBe(true);
    expect(result.data?.[0]).toEqual({
      id: 'client-1',
      name: 'Carlos González',
      email: 'carlos@example.com',
      phone: '+573001234567',
      current_streak_days: 30,
      longest_streak_days: 47,
      last_seen_at: '2026-05-12T16:00:00Z',
    });
  });

  it('preserves the order the DB returned (DAL does not re-sort)', async () => {
    const rows: StreakerRow[] = [
      { ...SAMPLE_ROW, id: 'longest', current_streak_days: 100 },
      { ...SAMPLE_ROW, id: 'middle', current_streak_days: 30 },
      { ...SAMPLE_ROW, id: 'shortest', current_streak_days: 7 },
    ];
    const supabase = buildSupabaseMock({ rows });
    const result = await listActiveStreakers(supabase, 'instructor-1');
    expect(result.data?.map((r) => r.id)).toEqual(['longest', 'middle', 'shortest']);
  });

  it('passes null phone through (members without one still surface)', async () => {
    const supabase = buildSupabaseMock({ rows: [{ ...SAMPLE_ROW, phone: null }] });
    const result = await listActiveStreakers(supabase, 'instructor-1');
    expect(result.data?.[0].phone).toBeNull();
  });
});

describe('listActiveStreakers — error path', () => {
  it('returns failure when the query errors out', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'connection refused' } });
    const result = await listActiveStreakers(supabase, 'instructor-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

describe('listActiveStreakers — team filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the plain select string when no teamId is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1');
    // No team_membership join on the default path — keeps the query
    // cheap when most callers don't filter by team.
    expect(capture.selectString).not.toContain('team_membership');
  });

  it('switches to the inner-join select string when teamId is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1', { teamId: 'team-42' });
    // The dynamic select adds the join so PostgREST can apply
    // .eq('team_membership.team_id', X) as a filter.
    expect(capture.selectString).toContain('team_membership:gym_team_members!inner(team_id)');
  });

  it('emits a team_id .eq filter when teamId is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1', { teamId: 'team-42' });
    expect(capture.eqCalls).toContainEqual({ col: 'team_membership.team_id', val: 'team-42' });
  });

  it('does NOT emit a team_id .eq filter when teamId is omitted', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listActiveStreakers(supabase, 'instructor-1');
    expect(capture.eqCalls.some((c) => c.col === 'team_membership.team_id')).toBe(false);
  });
});

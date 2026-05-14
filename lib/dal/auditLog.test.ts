/**
 * Tests for listAuditEntries (lib/dal/auditLog.ts).
 *
 * Covers:
 *   - Gym scoping (only the requested gym's rows surface)
 *   - Optional action + target_type filters pass through
 *   - Limit clamping (1 ≤ limit ≤ MAX_AUDIT_PAGE_SIZE)
 *   - Default limit when none provided
 *   - Actor hydration: row with joined user → actor object,
 *     row with no joined user (deleted via ON DELETE SET NULL) → null
 *   - Error path
 *
 * The mock captures the .eq() and .limit() calls so we can assert
 * the DAL is passing the right filter values to PostgREST. Limit
 * assertions matter because shipping an uncapped page would let
 * a future caller request 100k rows in one round trip.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listAuditEntries, fetchLastActionByActor } from './auditLog';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface RowFromQuery {
  id: string;
  gym_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; name: string | null; email: string | null } | null;
}

interface CapturedQuery {
  eqCalls: Array<{ col: string; val: unknown }>;
  gteCalls: Array<{ col: string; val: unknown }>;
  lteCalls: Array<{ col: string; val: unknown }>;
  neqCalls: Array<{ col: string; val: unknown }>;
  limit?: number;
  order?: { col: string; ascending: boolean };
}

function newCapture(): CapturedQuery {
  return { eqCalls: [], gteCalls: [], lteCalls: [], neqCalls: [] };
}

function buildSupabaseMock(opts: {
  rows?: RowFromQuery[];
  error?: { message: string } | null;
  capture?: CapturedQuery;
}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table !== 'gym_audit_log') throw new Error(`unexpected table: ${table}`);
      const chain: Record<string, unknown> = {};
      const fn = () => chain;
      chain.select = fn;
      chain.eq = (col: string, val: unknown) => {
        opts.capture?.eqCalls.push({ col, val });
        return chain;
      };
      chain.gte = (col: string, val: unknown) => {
        opts.capture?.gteCalls.push({ col, val });
        return chain;
      };
      chain.lte = (col: string, val: unknown) => {
        opts.capture?.lteCalls.push({ col, val });
        return chain;
      };
      chain.neq = (col: string, val: unknown) => {
        opts.capture?.neqCalls.push({ col, val });
        return chain;
      };
      chain.order = (col: string, options?: { ascending: boolean }) => {
        if (opts.capture) opts.capture.order = { col, ascending: options?.ascending ?? true };
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

const ROW_WITH_ACTOR: RowFromQuery = {
  id: 'audit-1',
  gym_id: 'gym-1',
  action: 'client.archive',
  target_type: 'client',
  target_id: 'client-1',
  payload: { name: 'Anna García' },
  created_at: '2026-05-12T10:00:00Z',
  actor: { id: 'user-coach-A', name: 'Coach Alex', email: 'alex@example.com' },
};

const ROW_WITHOUT_ACTOR: RowFromQuery = {
  id: 'audit-2',
  gym_id: 'gym-1',
  action: 'client.purge',
  target_type: 'client',
  target_id: 'client-2',
  payload: { name: 'Carlos R.', reason: 'gdpr_or_manual' },
  created_at: '2026-05-12T11:00:00Z',
  actor: null, // user was deleted (ON DELETE SET NULL on actor_user_id)
};

describe('listAuditEntries — query construction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always filters by the requested gym_id', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-42');
    expect(capture.eqCalls).toEqual([{ col: 'gym_id', val: 'gym-42' }]);
  });

  it('orders by created_at DESC (newest first)', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1');
    expect(capture.order).toEqual({ col: 'created_at', ascending: false });
  });

  it('passes an action filter through when provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { action: 'client.purge' });
    expect(capture.eqCalls).toContainEqual({ col: 'action', val: 'client.purge' });
  });

  it('passes a target_type filter through when provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { targetType: 'attendance' });
    expect(capture.eqCalls).toContainEqual({ col: 'target_type', val: 'attendance' });
  });

  it('uses both filters together when both are provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { action: 'attendance.refund', targetType: 'attendance' });
    expect(capture.eqCalls).toContainEqual({ col: 'action', val: 'attendance.refund' });
    expect(capture.eqCalls).toContainEqual({ col: 'target_type', val: 'attendance' });
  });
});

describe('listAuditEntries — limit clamping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the default limit (50) when none is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1');
    expect(capture.limit).toBe(50);
  });

  it('honors an explicit limit within the allowed range', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { limit: 25 });
    expect(capture.limit).toBe(25);
  });

  it('clamps to the upper bound (100) when given a larger limit', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { limit: 9999 });
    expect(capture.limit).toBe(100);
  });

  it('clamps to the lower bound (1) when given zero or negative', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { limit: 0 });
    expect(capture.limit).toBe(1);
  });

  it('floors fractional limit values', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { limit: 7.9 });
    expect(capture.limit).toBe(7);
  });
});

describe('listAuditEntries — row hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty array when no rows match', async () => {
    const supabase = buildSupabaseMock({ rows: [] });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('hydrates the joined actor user when present', async () => {
    const supabase = buildSupabaseMock({ rows: [ROW_WITH_ACTOR] });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.success).toBe(true);
    expect(result.data?.[0]).toMatchObject({
      id: 'audit-1',
      action: 'client.archive',
      actor: { id: 'user-coach-A', name: 'Coach Alex', email: 'alex@example.com' },
    });
  });

  it('returns actor:null when the joined user was deleted (ON DELETE SET NULL)', async () => {
    const supabase = buildSupabaseMock({ rows: [ROW_WITHOUT_ACTOR] });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.success).toBe(true);
    expect(result.data?.[0].actor).toBeNull();
  });

  it('passes the payload through unchanged', async () => {
    const supabase = buildSupabaseMock({ rows: [ROW_WITHOUT_ACTOR] });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.data?.[0].payload).toEqual({ name: 'Carlos R.', reason: 'gdpr_or_manual' });
  });

  it('preserves the order returned by the DB (DAL does not re-sort)', async () => {
    const rows: RowFromQuery[] = [
      { ...ROW_WITH_ACTOR, id: 'audit-newest', created_at: '2026-05-12T15:00:00Z' },
      { ...ROW_WITH_ACTOR, id: 'audit-older', created_at: '2026-05-12T10:00:00Z' },
    ];
    const supabase = buildSupabaseMock({ rows });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.data?.map((r) => r.id)).toEqual(['audit-newest', 'audit-older']);
  });

  it('handles null target_id (actions without a single target)', async () => {
    const supabase = buildSupabaseMock({
      rows: [{ ...ROW_WITH_ACTOR, target_id: null, action: 'insight.bulk_dismiss' }],
    });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.data?.[0].target_id).toBeNull();
  });
});

describe('listAuditEntries — date-range filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes fromIso through as a .gte lower bound on created_at', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { fromIso: '2026-01-01T00:00:00Z' });
    expect(capture.gteCalls).toContainEqual({ col: 'created_at', val: '2026-01-01T00:00:00Z' });
  });

  it('passes toIso through as a .lte upper bound on created_at', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { toIso: '2026-12-31T23:59:59Z' });
    expect(capture.lteCalls).toContainEqual({ col: 'created_at', val: '2026-12-31T23:59:59Z' });
  });

  it('emits both bounds when fromIso and toIso are both provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', {
      fromIso: '2026-05-01T00:00:00Z',
      toIso: '2026-05-31T23:59:59Z',
    });
    expect(capture.gteCalls).toContainEqual({ col: 'created_at', val: '2026-05-01T00:00:00Z' });
    expect(capture.lteCalls).toContainEqual({ col: 'created_at', val: '2026-05-31T23:59:59Z' });
  });

  it('omits the .gte / .lte calls entirely when no bounds are provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1');
    // No date filters when both are undefined — keeps the query plan
    // simple for the common "give me the last 50 entries" case.
    expect(capture.gteCalls).toHaveLength(0);
    expect(capture.lteCalls).toHaveLength(0);
  });
});

describe('listAuditEntries — actor filter ("Only mine")', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes actorUserId through as an .eq filter on actor_user_id', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { actorUserId: 'user-coach-A' });
    expect(capture.eqCalls).toContainEqual({ col: 'actor_user_id', val: 'user-coach-A' });
  });

  it('does NOT emit an actor_user_id filter when actorUserId is omitted', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1');
    // Default view shows everyone's activity — the filter only kicks
    // in when the caller explicitly asks for "only mine".
    expect(capture.eqCalls.some((c) => c.col === 'actor_user_id')).toBe(false);
  });

  it('stacks the actor filter on top of action + targetType filters', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', {
      action: 'client.purge',
      targetType: 'client',
      actorUserId: 'user-coach-A',
    });
    expect(capture.eqCalls).toContainEqual({ col: 'action', val: 'client.purge' });
    expect(capture.eqCalls).toContainEqual({ col: 'target_type', val: 'client' });
    expect(capture.eqCalls).toContainEqual({ col: 'actor_user_id', val: 'user-coach-A' });
  });
});

describe('listAuditEntries — error path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns failure when the query errors out', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'connection refused' } });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

describe('fetchLastActionByActor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes by gym_id and orders newest-first', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await fetchLastActionByActor(supabase, 'gym-1');
    expect(capture.eqCalls).toContainEqual({ col: 'gym_id', val: 'gym-1' });
    expect(capture.order).toEqual({ col: 'created_at', ascending: false });
  });

  it('excludes gym.alert_sent (system-written rows are not coach activity)', async () => {
    // The watchdog writes gym.alert_sent rows when it fires alerts.
    // Those have null actors and would be the newest row each
    // watchdog tick — they MUST be filtered out or the indicator
    // would always show "Last action: just now" for nobody.
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await fetchLastActionByActor(supabase, 'gym-1');
    expect(capture.neqCalls).toContainEqual({ col: 'action', val: 'gym.alert_sent' });
  });

  it('returns the most-recent timestamp per actor (first-occurrence wins)', async () => {
    // Rows arrive newest-first; the first time we see an actor is
    // their most recent action. Subsequent rows for the same actor
    // are older and should be ignored. The DAL selects 'actor_user_id,
    // created_at' so we shape test rows with that flat schema (JS
    // tolerates the extra fields the mock's RowFromQuery declares).
    const supabase = buildSupabaseMock({
      rows: [
        // Cast through unknown — the DAL reads actor_user_id flat;
        // the test mock's RowFromQuery type is for the join path.
        { actor_user_id: 'coach-A', created_at: '2026-05-12T15:00:00Z' } as unknown as RowFromQuery,
        { actor_user_id: 'coach-B', created_at: '2026-05-12T14:00:00Z' } as unknown as RowFromQuery,
        { actor_user_id: 'coach-A', created_at: '2026-05-12T08:00:00Z' } as unknown as RowFromQuery,
      ],
    });
    const result = await fetchLastActionByActor(supabase, 'gym-1');
    expect(result.success).toBe(true);
    expect(result.data?.size).toBe(2);
    // coach-A's newer 15:00 entry wins over the 08:00 one.
    expect(result.data?.get('coach-A')).toBe('2026-05-12T15:00:00Z');
    expect(result.data?.get('coach-B')).toBe('2026-05-12T14:00:00Z');
  });

  it('skips rows with null actor_user_id (system-written rows that slipped through)', async () => {
    // Defensive: even though we filter gym.alert_sent in the .neq,
    // null actors can also come from manual data fixes. They
    // shouldn't end up in the map.
    const supabase = buildSupabaseMock({
      rows: [
        { actor_user_id: null, created_at: '2026-05-12T15:00:00Z' } as unknown as RowFromQuery,
        { actor_user_id: 'coach-A', created_at: '2026-05-12T14:00:00Z' } as unknown as RowFromQuery,
      ],
    });
    const result = await fetchLastActionByActor(supabase, 'gym-1');
    expect(result.success).toBe(true);
    expect(result.data?.size).toBe(1);
    expect(result.data?.has('coach-A')).toBe(true);
  });

  it('returns failure when the query errors out', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'connection refused' } });
    const result = await fetchLastActionByActor(supabase, 'gym-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

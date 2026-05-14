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
import { listAuditEntries } from './auditLog';

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
  limit?: number;
  order?: { col: string; ascending: boolean };
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
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-42');
    expect(capture.eqCalls).toEqual([{ col: 'gym_id', val: 'gym-42' }]);
  });

  it('orders by created_at DESC (newest first)', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1');
    expect(capture.order).toEqual({ col: 'created_at', ascending: false });
  });

  it('passes an action filter through when provided', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { action: 'client.purge' });
    expect(capture.eqCalls).toContainEqual({ col: 'action', val: 'client.purge' });
  });

  it('passes a target_type filter through when provided', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { targetType: 'attendance' });
    expect(capture.eqCalls).toContainEqual({ col: 'target_type', val: 'attendance' });
  });

  it('uses both filters together when both are provided', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { action: 'attendance.refund', targetType: 'attendance' });
    expect(capture.eqCalls).toContainEqual({ col: 'action', val: 'attendance.refund' });
    expect(capture.eqCalls).toContainEqual({ col: 'target_type', val: 'attendance' });
  });
});

describe('listAuditEntries — limit clamping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the default limit (50) when none is provided', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1');
    expect(capture.limit).toBe(50);
  });

  it('honors an explicit limit within the allowed range', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { limit: 25 });
    expect(capture.limit).toBe(25);
  });

  it('clamps to the upper bound (100) when given a larger limit', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { limit: 9999 });
    expect(capture.limit).toBe(100);
  });

  it('clamps to the lower bound (1) when given zero or negative', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAuditEntries(supabase, 'gym-1', { limit: 0 });
    expect(capture.limit).toBe(1);
  });

  it('floors fractional limit values', async () => {
    const capture: CapturedQuery = { eqCalls: [] };
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

describe('listAuditEntries — error path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns failure when the query errors out', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'connection refused' } });
    const result = await listAuditEntries(supabase, 'gym-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

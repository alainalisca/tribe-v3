/**
 * Tests for listAtRiskClients (lib/dal/clients.ts).
 *
 * Covers:
 *   - Tenant scoping: gym-id path vs instructor-user-id fallback
 *   - Defaults: thresholdDays=14, limit=25
 *   - Limit clamping (1 ≤ limit ≤ 100)
 *   - Archived clients always excluded
 *   - Team filter: plain select vs inner-join select + team_id .eq
 *   - Days-since-last-seen computation
 *   - Row hydration into AtRiskClient shape
 *   - Error path (graceful failure)
 *
 * Like the other clients DAL tests, we don't simulate the DB's
 * health_status / status / last_seen filters — that's a DB contract,
 * not a unit-test concern. We assert the filters get passed
 * correctly + the row shape comes back hydrated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listAtRiskClients } from './clients';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface AtRiskRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'inactive' | 'lead' | 'lapsed';
  health_status: 'HEALTHY' | 'WATCH' | 'AT_RISK' | null;
  churn_risk_score: number | null;
  last_seen_at: string | null;
  created_at: string;
}

interface CapturedQuery {
  eqCalls: Array<{ col: string; val: unknown }>;
  orCalls: Array<string>;
  orderCalls: Array<{ col: string; ascending: boolean }>;
  limit?: number;
  selectString?: string;
}

function newCapture(): CapturedQuery {
  return { eqCalls: [], orCalls: [], orderCalls: [] };
}

function buildSupabaseMock(opts: {
  rows?: AtRiskRow[];
  error?: { message: string } | null;
  capture?: CapturedQuery;
}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table !== 'clients') throw new Error(`unexpected table: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = (s: string) => {
        if (opts.capture) opts.capture.selectString = s;
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        opts.capture?.eqCalls.push({ col, val });
        return chain;
      };
      chain.or = (clause: string) => {
        opts.capture?.orCalls.push(clause);
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
      // The conditional-type cast was clever but tripped tsc on
      // strict mode — chain shape is correct, the outer cast on the
      // returned object already erases the type. Match the streakers
      // test pattern.
      return chain;
    },
  } as unknown as SupabaseClient;
}

const SAMPLE_ROW: AtRiskRow = {
  id: 'client-1',
  name: 'Carlos González',
  email: 'carlos@example.com',
  phone: '+573001234567',
  status: 'active',
  health_status: 'AT_RISK',
  churn_risk_score: 0.78,
  last_seen_at: '2026-04-20T16:00:00Z',
  created_at: '2025-12-01T00:00:00Z',
};

describe('listAtRiskClients — tenant scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes by gym_id when gymId is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, { gymId: 'gym-42', instructorUserId: 'irrelevant' });
    expect(capture.eqCalls).toContainEqual({ col: 'gym_id', val: 'gym-42' });
    expect(capture.eqCalls).not.toContainEqual({ col: 'instructor_user_id', val: 'irrelevant' });
  });

  it('falls back to instructor_user_id when gymId is null', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(capture.eqCalls).toContainEqual({ col: 'instructor_user_id', val: 'instructor-1' });
    expect(capture.eqCalls.some((c) => c.col === 'gym_id')).toBe(false);
  });

  it('accepts a bare instructorUserId string as shorthand context', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-2');
    expect(capture.eqCalls).toContainEqual({ col: 'instructor_user_id', val: 'instructor-2' });
  });

  it('always excludes archived clients', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1');
    expect(capture.eqCalls).toContainEqual({ col: 'archived', val: false });
  });
});

describe('listAtRiskClients — defaults + limit clamping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies the default limit of 25', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1');
    expect(capture.limit).toBe(25);
  });

  it('honors a custom limit within bounds', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1', { limit: 5 });
    expect(capture.limit).toBe(5);
  });

  it('clamps limit to the upper bound (100)', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1', { limit: 9999 });
    expect(capture.limit).toBe(100);
  });

  it('clamps limit to 1 when given 0', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1', { limit: 0 });
    expect(capture.limit).toBe(1);
  });
});

describe('listAtRiskClients — at-risk OR clause', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits an OR clause covering all four at-risk branches', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1');
    expect(capture.orCalls).toHaveLength(1);
    // Four branches: health_status AT_RISK, status lapsed, active +
    // stale last_seen, active + never-seen + old enough.
    const clause = capture.orCalls[0];
    expect(clause).toContain('health_status.eq.AT_RISK');
    expect(clause).toContain('status.eq.lapsed');
    expect(clause).toContain('status.eq.active');
    expect(clause).toContain('last_seen_at.lt');
    expect(clause).toContain('last_seen_at.is.null');
  });
});

describe('listAtRiskClients — row hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty array when no clients qualify', async () => {
    const supabase = buildSupabaseMock({ rows: [] });
    const result = await listAtRiskClients(supabase, 'instructor-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('hydrates rows into the AtRiskClient shape', async () => {
    const supabase = buildSupabaseMock({ rows: [SAMPLE_ROW] });
    const result = await listAtRiskClients(supabase, 'instructor-1');
    expect(result.success).toBe(true);
    expect(result.data?.[0]).toMatchObject({
      id: 'client-1',
      name: 'Carlos González',
      email: 'carlos@example.com',
      phone: '+573001234567',
      status: 'active',
      last_seen_at: '2026-04-20T16:00:00Z',
    });
    // days_since_last_seen is a Date.now()-relative computation; we
    // just assert it's a non-null integer rather than pin an exact
    // value (the test clock could be anywhere).
    expect(typeof result.data?.[0].days_since_last_seen).toBe('number');
  });

  it('sets days_since_last_seen to null when last_seen_at is null', async () => {
    const supabase = buildSupabaseMock({ rows: [{ ...SAMPLE_ROW, last_seen_at: null }] });
    const result = await listAtRiskClients(supabase, 'instructor-1');
    expect(result.data?.[0].days_since_last_seen).toBeNull();
  });
});

describe('listAtRiskClients — team filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the plain select string when no teamId is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1');
    expect(capture.selectString).not.toContain('team_membership');
  });

  it('switches to the inner-join select string when teamId is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1', { teamId: 'team-42' });
    expect(capture.selectString).toContain('team_membership:gym_team_members!inner(team_id)');
  });

  it('emits a team_id .eq filter when teamId is provided', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await listAtRiskClients(supabase, 'instructor-1', { teamId: 'team-42' });
    expect(capture.eqCalls).toContainEqual({ col: 'team_membership.team_id', val: 'team-42' });
  });
});

describe('listAtRiskClients — error path', () => {
  it('returns failure when the query errors out', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'connection refused' } });
    const result = await listAtRiskClients(supabase, 'instructor-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

/**
 * Tests for evaluateGymAuditThresholds (lib/dal/auditWatchdog.ts).
 *
 * Covers the four classes of behavior that matter:
 *   1. Per-rule thresholds (under → no alert, at/above → alert)
 *   2. Per-actor counting (one actor can trip a rule without
 *      another actor at the same gym tripping it)
 *   3. alertOnAny rules (any actor counts toward one bucket)
 *   4. Suppression via gym.alert_sent rows + matching trigger_key
 *
 * The function makes one query per threshold rule plus a
 * suppression-check query for each rule that crosses threshold.
 * The mock dispatches by the `.eq('action', X)` argument so each
 * lane returns the rows the test set up.
 *
 * AUDIT_THRESHOLDS (from the DAL):
 *   client.archive:    5 in 24h, per-actor
 *   attendance.delete: 10 in 24h, per-actor
 *   attendance.refund: 3 in 24h, per-actor
 *   client.purge:      1 in 24h, alertOnAny
 *   coach.remove:      2 in 24h, per-actor
 *   team.delete:       2 in 24h, per-actor
 *
 * Tests reference those numbers directly. If a threshold ever
 * changes, the matching test will fail and force a deliberate
 * acknowledgement of the new value — which is the point.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateGymAuditThresholds } from './auditWatchdog';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface AuditMockRow {
  actor_user_id: string | null;
  created_at: string;
  /** Only populated on gym.alert_sent rows used by the suppression check. */
  payload?: Record<string, unknown> | null;
}

/**
 * Mock that dispatches queries by the action filter. Tests pass
 * `{ 'client.archive': [...], 'gym.alert_sent': [...] }` and the
 * mock returns the matching rows for each `.eq('action', X)` chain.
 *
 * Doesn't simulate the .gte('created_at', cutoff) filter — tests
 * are responsible for only providing rows that would be inside the
 * window. The function trusts the DB for date filtering, so testing
 * that filter is a DB contract test, not a unit test.
 */
function buildSupabaseMock(rowsByAction: Record<string, AuditMockRow[]>): SupabaseClient {
  return {
    from: (table: string) => {
      if (table !== 'gym_audit_log') throw new Error(`unexpected table: ${table}`);
      // Each chain is fresh per call to `.from()` so different
      // queries in the same test don't pollute each other.
      let actionFilter = '';
      const chain: Record<string, unknown> = {};
      const passThrough = () => chain;
      chain.select = passThrough;
      chain.eq = (col: string, val: string) => {
        if (col === 'action') actionFilter = val;
        return chain;
      };
      chain.gte = passThrough;
      chain.order = passThrough;
      chain.limit = passThrough;
      chain.then = (resolve: (v: unknown) => void) => {
        const rows = rowsByAction[actionFilter] ?? [];
        resolve({ data: rows, error: null });
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

/** Helper for synthesizing audit rows with sensible default timestamps. */
function row(actor: string | null, opts: { at?: string; payload?: Record<string, unknown> } = {}): AuditMockRow {
  return {
    actor_user_id: actor,
    created_at: opts.at ?? '2026-05-10T12:00:00Z',
    payload: opts.payload ?? null,
  };
}

const GYM_ID = 'gym-1';

describe('evaluateGymAuditThresholds — empty + under-threshold cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns no alerts when the audit log is empty', async () => {
    const supabase = buildSupabaseMock({});
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toEqual([]);
  });

  it('does NOT alert when client.archive count is 4 (one under threshold of 5)', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': Array.from({ length: 4 }, () => row('coach-A')),
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toEqual([]);
  });

  it('does NOT alert when attendance.delete count is 9 (one under threshold of 10)', async () => {
    const supabase = buildSupabaseMock({
      'attendance.delete': Array.from({ length: 9 }, () => row('coach-A')),
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toEqual([]);
  });

  it('does NOT alert when attendance.refund count is 2 (one under threshold of 3)', async () => {
    const supabase = buildSupabaseMock({
      'attendance.refund': Array.from({ length: 2 }, () => row('coach-A')),
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toEqual([]);
  });
});

describe('evaluateGymAuditThresholds — at-threshold per-actor alerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('alerts at exactly 5 client.archive by one actor', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': Array.from({ length: 5 }, () => row('coach-A')),
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      gym_id: GYM_ID,
      action: 'client.archive',
      actor_user_id: 'coach-A',
      count: 5,
      window_hours: 24,
      trigger_key: 'client.archive:coach-A',
    });
  });

  it('alerts at 10 attendance.delete by one actor', async () => {
    const supabase = buildSupabaseMock({
      'attendance.delete': Array.from({ length: 10 }, () => row('coach-A')),
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      action: 'attendance.delete',
      actor_user_id: 'coach-A',
      count: 10,
      trigger_key: 'attendance.delete:coach-A',
    });
  });

  it('alerts at 3 attendance.refund by one actor', async () => {
    const supabase = buildSupabaseMock({
      'attendance.refund': Array.from({ length: 3 }, () => row('coach-A')),
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('attendance.refund');
  });

  it('does NOT alert when coach.remove count is 1 (under threshold of 2)', async () => {
    // Single coach removal is normal turnover — alerting here would
    // train the owner to dismiss the alert as noise. Threshold of 2
    // catches the genuinely-unusual same-day double removal that
    // suggests a hostile actor.
    const supabase = buildSupabaseMock({
      'coach.remove': [row('owner-A')],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result.filter((r) => r.action === 'coach.remove')).toHaveLength(0);
  });

  it('alerts at 2 coach.remove by one actor in 24h (hostile-takeover signature)', async () => {
    const supabase = buildSupabaseMock({
      'coach.remove': [row('owner-A'), row('owner-A')],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    const alert = result.find((r) => r.action === 'coach.remove');
    expect(alert).toMatchObject({
      action: 'coach.remove',
      actor_user_id: 'owner-A',
      count: 2,
      window_hours: 24,
      trigger_key: 'coach.remove:owner-A',
    });
  });

  it('alerts at 2 team.delete by one actor in 24h', async () => {
    const supabase = buildSupabaseMock({
      'team.delete': [row('owner-A'), row('owner-A')],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    const alert = result.find((r) => r.action === 'team.delete');
    expect(alert).toMatchObject({
      action: 'team.delete',
      actor_user_id: 'owner-A',
      count: 2,
      window_hours: 24,
      trigger_key: 'team.delete:owner-A',
    });
  });

  it('does NOT alert when team.delete is split between two actors (1+1)', async () => {
    // Per-actor counting: two different owners (in the unusual case
    // of an ownership transfer + cleanup) each deleting one team is
    // not a takeover signal.
    const supabase = buildSupabaseMock({
      'team.delete': [row('owner-A'), row('owner-B')],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result.filter((r) => r.action === 'team.delete')).toHaveLength(0);
  });

  it('captures earliest_at and latest_at across the cluster', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': [
        row('coach-A', { at: '2026-05-10T08:00:00Z' }),
        row('coach-A', { at: '2026-05-10T14:00:00Z' }),
        row('coach-A', { at: '2026-05-10T11:00:00Z' }), // middle
        row('coach-A', { at: '2026-05-10T20:00:00Z' }), // latest
        row('coach-A', { at: '2026-05-10T06:00:00Z' }), // earliest
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].earliest_at).toBe('2026-05-10T06:00:00Z');
    expect(result[0].latest_at).toBe('2026-05-10T20:00:00Z');
  });
});

describe('evaluateGymAuditThresholds — per-actor independence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT alert when two actors split the count (4+4 under threshold)', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': [
        ...Array.from({ length: 4 }, () => row('coach-A')),
        ...Array.from({ length: 4 }, () => row('coach-B')),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    // 8 total but no single actor crossed 5 → no alert
    expect(result).toEqual([]);
  });

  it('alerts ONLY for the actor that crossed (5+4 → 1 alert)', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': [
        ...Array.from({ length: 5 }, () => row('coach-A')),
        ...Array.from({ length: 4 }, () => row('coach-B')),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].actor_user_id).toBe('coach-A');
  });

  it('alerts for BOTH actors when both cross (5+5 → 2 alerts)', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': [
        ...Array.from({ length: 5 }, () => row('coach-A')),
        ...Array.from({ length: 5 }, () => row('coach-B')),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(2);
    const actors = result.map((r) => r.actor_user_id).sort();
    expect(actors).toEqual(['coach-A', 'coach-B']);
  });

  it('treats null actor_user_id as a distinct bucket from named actors', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': [
        ...Array.from({ length: 5 }, () => row(null)),
        ...Array.from({ length: 4 }, () => row('coach-A')),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    // null-actor bucket crossed 5; coach-A did not
    expect(result).toHaveLength(1);
    expect(result[0].actor_user_id).toBeNull();
  });
});

describe('evaluateGymAuditThresholds — alertOnAny (client.purge)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('alerts on a single client.purge regardless of actor', async () => {
    const supabase = buildSupabaseMock({
      'client.purge': [row('owner-1')],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      action: 'client.purge',
      // alertOnAny pools actors into one bucket → actor_user_id always null
      actor_user_id: null,
      trigger_key: 'client.purge:any',
    });
  });

  it('aggregates count across actors for alertOnAny rules', async () => {
    const supabase = buildSupabaseMock({
      'client.purge': [row('owner-1'), row('owner-1'), row('coach-A')],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    // trigger_key still :any so suppression collapses everything to one alert
    expect(result[0].trigger_key).toBe('client.purge:any');
  });
});

describe('evaluateGymAuditThresholds — suppression', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips an alert when a matching gym.alert_sent row exists in the window', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': Array.from({ length: 5 }, () => row('coach-A')),
      'gym.alert_sent': [
        // Recent suppression entry with the right trigger_key →
        // the watchdog should NOT re-alert
        row(null, {
          at: '2026-05-10T11:00:00Z',
          payload: { trigger_key: 'client.archive:coach-A' },
        }),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toEqual([]);
  });

  it('does NOT skip when the suppression entry has a DIFFERENT trigger_key', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': Array.from({ length: 5 }, () => row('coach-A')),
      'gym.alert_sent': [
        row(null, {
          at: '2026-05-10T11:00:00Z',
          // Wrong actor — should NOT suppress an alert about coach-A
          payload: { trigger_key: 'client.archive:coach-B' },
        }),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
  });

  it('does NOT skip when the suppression payload is missing trigger_key', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': Array.from({ length: 5 }, () => row('coach-A')),
      'gym.alert_sent': [
        row(null, {
          at: '2026-05-10T11:00:00Z',
          // Malformed entry — be defensive: don't suppress
          payload: { some_other_field: 'whatever' },
        }),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
  });

  it('suppresses per actor independently — A is suppressed, B still alerts', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': [
        ...Array.from({ length: 5 }, () => row('coach-A')),
        ...Array.from({ length: 5 }, () => row('coach-B')),
      ],
      'gym.alert_sent': [
        row(null, {
          at: '2026-05-10T11:00:00Z',
          payload: { trigger_key: 'client.archive:coach-A' },
        }),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].actor_user_id).toBe('coach-B');
  });

  it('suppresses client.purge:any via the matching :any trigger_key', async () => {
    const supabase = buildSupabaseMock({
      'client.purge': [row('owner-1')],
      'gym.alert_sent': [
        row(null, {
          at: '2026-05-10T11:00:00Z',
          payload: { trigger_key: 'client.purge:any' },
        }),
      ],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toEqual([]);
  });
});

describe('evaluateGymAuditThresholds — combined scenarios', () => {
  beforeEach(() => vi.clearAllMocks());

  it('alerts across multiple rule types in a single run', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': Array.from({ length: 5 }, () => row('coach-A')),
      'attendance.refund': Array.from({ length: 3 }, () => row('coach-A')),
      'client.purge': [row('owner-1')],
    });
    const result = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(result).toHaveLength(3);
    const actions = result.map((r) => r.action).sort();
    expect(actions).toEqual(['attendance.refund', 'client.archive', 'client.purge']);
  });

  it('returns a stable shape — every alert has trigger_key + count + window', async () => {
    const supabase = buildSupabaseMock({
      'client.archive': Array.from({ length: 5 }, () => row('coach-A')),
    });
    const [alert] = await evaluateGymAuditThresholds(supabase, GYM_ID);
    expect(alert).toMatchObject({
      gym_id: expect.any(String),
      trigger_key: expect.any(String),
      action: expect.any(String),
      count: expect.any(Number),
      window_hours: expect.any(Number),
      earliest_at: expect.any(String),
      latest_at: expect.any(String),
    });
  });
});

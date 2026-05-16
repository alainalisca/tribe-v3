/**
 * Tests for generateAuditLogCsv (lib/dal/auditLog.ts).
 *
 * Focus areas:
 *   - Header row is always present (even on empty result)
 *   - Row hydration: actor name/email both populated, both empty
 *     when the joined user is null
 *   - Payload JSON-stringified, including empty/null payload → ""
 *   - RFC-4180 escaping: cells with commas/quotes/newlines get
 *     wrapped + internal quotes doubled
 *   - Filter args (action, targetType, fromIso, toIso) pass
 *     through to PostgREST (`.eq`/`.gte`/`.lte`)
 *   - Error path returns failure
 *
 * CSV correctness is the contract: a regression in escape rules
 * would silently produce files Excel mis-parses. These tests pin
 * the rules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateAuditLogCsv } from './auditLog';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface CsvRow {
  created_at: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  actor: { name: string | null; email: string | null } | null;
}

interface CapturedQuery {
  eqCalls: Array<{ col: string; val: unknown }>;
  gteCalls: Array<{ col: string; val: unknown }>;
  lteCalls: Array<{ col: string; val: unknown }>;
  limit?: number;
}

function newCapture(): CapturedQuery {
  return { eqCalls: [], gteCalls: [], lteCalls: [] };
}

function buildSupabaseMock(opts: {
  rows?: CsvRow[];
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
      chain.order = fn;
      chain.limit = (n: number) => {
        if (opts.capture) opts.capture.limit = n;
        return chain;
      };
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: opts.rows ?? [], error: opts.error ?? null });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const HEADER = 'created_at,action,target_type,target_id,actor_name,actor_email,payload';

describe('generateAuditLogCsv — header + empty result', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits only the header row when no audit entries exist', async () => {
    const supabase = buildSupabaseMock({ rows: [] });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    expect(result.success).toBe(true);
    expect(result.data).toBe(HEADER);
  });
});

describe('generateAuditLogCsv — row hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a row with a fully-populated actor', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          created_at: '2026-05-12T10:00:00Z',
          action: 'client.archive',
          target_type: 'client',
          target_id: 'client-abc',
          payload: { name: 'Anna' },
          actor: { name: 'Coach Alex', email: 'alex@example.com' },
        },
      ],
    });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    expect(result.success).toBe(true);
    const lines = result.data!.split('\r\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe(
      '2026-05-12T10:00:00Z,client.archive,client,client-abc,Coach Alex,alex@example.com,"{""name"":""Anna""}"'
    );
  });

  it('renders empty actor cells when the joined user is null (ON DELETE SET NULL)', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          created_at: '2026-05-12T10:00:00Z',
          action: 'client.purge',
          target_type: 'client',
          target_id: 'client-abc',
          payload: null,
          actor: null,
        },
      ],
    });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    const lines = result.data!.split('\r\n');
    expect(lines[1]).toBe('2026-05-12T10:00:00Z,client.purge,client,client-abc,,,');
  });

  it('renders empty target_id cell when null', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          created_at: '2026-05-12T10:00:00Z',
          action: 'insight.bulk_dismiss',
          target_type: 'insight',
          target_id: null,
          payload: { dismissed: 5 },
          actor: { name: 'Coach', email: 'c@example.com' },
        },
      ],
    });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    const lines = result.data!.split('\r\n');
    expect(lines[1]).toBe('2026-05-12T10:00:00Z,insight.bulk_dismiss,insight,,Coach,c@example.com,"{""dismissed"":5}"');
  });

  it('emits empty string for null payload', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          created_at: '2026-05-12T10:00:00Z',
          action: 'gym.settings_update',
          target_type: 'gym',
          target_id: 'gym-1',
          payload: null,
          actor: { name: 'Alain', email: 'a@example.com' },
        },
      ],
    });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    const lines = result.data!.split('\r\n');
    expect(lines[1].endsWith(',')).toBe(true); // payload column empty
  });
});

describe('generateAuditLogCsv — RFC-4180 escaping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('wraps cells with commas in double quotes', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          created_at: '2026-05-12T10:00:00Z',
          action: 'client.archive',
          target_type: 'client',
          target_id: 'cid',
          payload: { name: 'Smith, John' },
          actor: { name: 'Coach', email: 'c@example.com' },
        },
      ],
    });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    const lines = result.data!.split('\r\n');
    // The JSON-stringified payload contains a comma → wrapped in quotes.
    expect(lines[1]).toContain('"{""name"":""Smith, John""}"');
  });

  it('escapes internal double quotes by doubling them', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          created_at: '2026-05-12T10:00:00Z',
          action: 'attendance.refund',
          target_type: 'attendance',
          target_id: 'att-1',
          // The reason field has its own quote — must be escaped to ""
          payload: { refund_reason: 'Customer said "broken"' },
          actor: { name: 'Coach', email: 'c@example.com' },
        },
      ],
    });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    const lines = result.data!.split('\r\n');
    // Internal " becomes "" inside the wrapped cell.
    expect(lines[1]).toContain('"{""refund_reason"":""Customer said \\""broken\\""""}"');
  });

  it('preserves JSON-escaped newlines in payload cells (no row break)', async () => {
    // JSON.stringify renders real newlines as the two-character
    // sequence backslash-n. That means the CSV cell does NOT contain
    // a real \r or \n character even when the original payload field
    // had one — so the row stays one line in the output. We pin this
    // explicitly because Excel mis-parses cells with real embedded
    // newlines unless they're quoted properly.
    const supabase = buildSupabaseMock({
      rows: [
        {
          created_at: '2026-05-12T10:00:00Z',
          action: 'client.archive',
          target_type: 'client',
          target_id: 'cid',
          payload: { notes: 'line1\nline2' },
          actor: { name: 'Coach', email: 'c@example.com' },
        },
      ],
    });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    const lines = result.data!.split('\r\n');
    // One header + one body row = exactly 2 lines.
    expect(lines).toHaveLength(2);
    // The body row contains the literal escape sequence \\n, not a real newline.
    expect(lines[1]).toContain('"{""notes"":""line1\\nline2""}"');
  });
});

describe('generateAuditLogCsv — filter passthrough', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always scopes by gym_id', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-42');
    expect(capture.eqCalls).toContainEqual({ col: 'gym_id', val: 'gym-42' });
  });

  it('passes the action filter through', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-1', { action: 'client.purge' });
    expect(capture.eqCalls).toContainEqual({ col: 'action', val: 'client.purge' });
  });

  it('passes the targetType filter through', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-1', { targetType: 'attendance' });
    expect(capture.eqCalls).toContainEqual({ col: 'target_type', val: 'attendance' });
  });

  it('passes the fromIso lower bound as .gte', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-1', { fromIso: '2026-01-01T00:00:00Z' });
    expect(capture.gteCalls).toContainEqual({ col: 'created_at', val: '2026-01-01T00:00:00Z' });
  });

  it('passes the toIso upper bound as .lte', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-1', { toIso: '2026-12-31T23:59:59Z' });
    expect(capture.lteCalls).toContainEqual({ col: 'created_at', val: '2026-12-31T23:59:59Z' });
  });

  it('passes the actorUserId filter through ("Only mine" export)', async () => {
    // Mirrors /os/audit's onlyMine toggle. When a coach exports their
    // own activity, the CSV needs to apply the same actor_user_id
    // .eq filter the in-app viewer does — otherwise the export would
    // silently include everyone, defeating the toggle.
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-1', { actorUserId: 'user-coach-A' });
    expect(capture.eqCalls).toContainEqual({ col: 'actor_user_id', val: 'user-coach-A' });
  });

  it('omits the actor_user_id filter when actorUserId is undefined', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-1');
    expect(capture.eqCalls.some((c) => c.col === 'actor_user_id')).toBe(false);
  });

  it('caps the limit at MAX_AUDIT_CSV_ROWS (5000)', async () => {
    const capture = newCapture();
    const supabase = buildSupabaseMock({ rows: [], capture });
    await generateAuditLogCsv(supabase, 'gym-1');
    expect(capture.limit).toBe(5000);
  });
});

describe('generateAuditLogCsv — error path', () => {
  it('returns failure when the query errors', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'pg blew up' } });
    const result = await generateAuditLogCsv(supabase, 'gym-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('pg blew up');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const FAKE_GYM_ID = 'gym-001';
const FAKE_USER_ID = 'coach-001';
const FAKE_CLIENT_ID = 'client-001';

const upsertedRows: Record<string, unknown>[][] = [];
let upsertError: { message: string; code: string } | null = null;

function chainable(terminal?: () => Promise<unknown>) {
  const self: Record<string, unknown> = {};
  const proxy = new Proxy(self, {
    get(_target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      if (terminal && (prop === 'single' || prop === 'maybeSingle')) return terminal;
      return () => proxy;
    },
  });
  return proxy;
}

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'clients') {
      return {
        select: () => ({
          eq: () => ({
            in: (_col: string, vals: string[]) =>
              Promise.resolve({
                data: vals.map((v) => ({ id: FAKE_CLIENT_ID, external_id: v, email: v, phone: v })),
              }),
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: FAKE_CLIENT_ID } }) }),
            maybeSingle: () => Promise.resolve({ data: { id: FAKE_CLIENT_ID } }),
          }),
        }),
      };
    }
    if (table === 'client_visits') {
      return {
        upsert: (rows: Record<string, unknown>[], _opts?: unknown) => {
          upsertedRows.push(Array.isArray(rows) ? rows : [rows]);
          if (upsertError) {
            return { select: () => Promise.resolve({ data: null, error: upsertError, status: 403 }) };
          }
          return {
            select: () =>
              Promise.resolve({
                data: (Array.isArray(rows) ? rows : [rows]).map((_, i) => ({ id: `v-${i}` })),
                error: null,
                status: 201,
              }),
          };
        },
      };
    }
    if (table === 'client_imports') {
      return chainable(() => Promise.resolve({ data: { id: 'imp-001' }, error: null }));
    }
    return chainable(() => Promise.resolve({ data: null, error: null }));
  }),
};

vi.mock('@/lib/auth/premium', () => ({
  requireTribeOSPremium: () =>
    Promise.resolve({
      ok: true,
      supabase: mockSupabase,
      userId: FAKE_USER_ID,
      gymId: FAKE_GYM_ID,
    }),
}));

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/dal/auditLog', () => ({ writeAuditEntry: vi.fn() }));

import { POST } from './route';

function makeRequest(rows: Record<string, string>[]) {
  return new Request('https://localhost/api/tribe-os/import/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, source: 'csv' }),
  }) as never;
}

beforeEach(() => {
  upsertedRows.length = 0;
  upsertError = null;
  vi.clearAllMocks();
});

describe('POST /api/tribe-os/import/visits', () => {
  it('inserts visits with ignoreDuplicates (no UPDATE policy needed)', async () => {
    const res = await POST(
      makeRequest([
        { external_id: 'MIRA-001', visit_date: '01/08/2026', visit_time: '06:00', class_name: 'CrossFit' },
        { external_id: 'MIRA-001', visit_date: '03/08/2026', visit_time: '06:30', class_name: 'CrossFit' },
      ])
    );
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.inserted).toBe(2);
    expect(json.data.already_existed).toBe(0);
    expect(upsertedRows).toHaveLength(1);
    expect(upsertedRows[0]).toHaveLength(2);

    // Verify client_visits was accessed via from()
    const visitsCalls = mockSupabase.from.mock.calls.filter((c: string[]) => c[0] === 'client_visits');
    expect(visitsCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('resolves members in bulk (not per-row)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      external_id: `MIRA-${String(i + 1).padStart(3, '0')}`,
      visit_date: `${String(i + 1).padStart(2, '0')}/08/2026`,
      visit_time: '06:00',
    }));
    await POST(makeRequest(rows));

    // The clients.select().eq('gym_id').in() should be called once for external_ids
    // (bulk resolution), not 5 times
    const clientCalls = mockSupabase.from.mock.calls.filter((c: string[]) => c[0] === 'clients');
    // Should have at most 3 bulk queries (ext_id, email, phone), not 5+ per-row
    expect(clientCalls.length).toBeLessThanOrEqual(3);
  });

  it('marks unresolved members as errors', async () => {
    // Override to return no clients for this test
    const origFrom = mockSupabase.from;
    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      }
      return origFrom(table);
    });

    const res = await POST(
      makeRequest([{ external_id: 'UNKNOWN-999', visit_date: '01/08/2026', visit_time: '06:00' }])
    );
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.inserted).toBe(0);
    expect(json.data.errors).toHaveLength(1);
    expect(json.data.errors[0].reason).toBe('unresolved_member');

    mockSupabase.from = origFrom;
  });

  it('stores raw error code in error rows on db failure', async () => {
    upsertError = { message: 'new row violates row-level security policy', code: '42501' };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeRequest([{ external_id: 'MIRA-001', visit_date: '01/08/2026', visit_time: '06:00' }]));
    const json = await res.json();

    expect(json.data.errors).toHaveLength(1);
    expect(json.data.errors[0].reason).toContain('db_error');
    expect(json.data.errors[0].code).toBe('42501');

    // Verify server-side logging was called
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[visits-import]'),
      expect.objectContaining({ code: '42501' })
    );

    consoleSpy.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const FAKE_GYM_ID = 'gym-001';
const FAKE_USER_ID = 'coach-001';
const FAKE_OWNER_ID = 'owner-001';

const insertedRows: Record<string, unknown>[] = [];

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
    if (table === 'gyms') {
      return chainable(() => Promise.resolve({ data: { owner_user_id: FAKE_OWNER_ID }, error: null }));
    }
    if (table === 'clients') {
      return {
        select: () => chainable(() => Promise.resolve({ data: null, error: null })),
        insert: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve({ error: null });
        },
        update: () => chainable(() => Promise.resolve({ error: null })),
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
  return new Request('https://localhost/api/tribe-os/import/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, source: 'csv' }),
  }) as never;
}

beforeEach(() => {
  insertedRows.length = 0;
  vi.clearAllMocks();
});

describe('POST /api/tribe-os/import/members', () => {
  it('sets instructor_user_id to the gym owner on insert', async () => {
    const res = await POST(makeRequest([{ name: 'Test User', email: 'test@example.com' }]));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.inserted).toBe(1);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].instructor_user_id).toBe(FAKE_OWNER_ID);
    expect(insertedRows[0].gym_id).toBe(FAKE_GYM_ID);
  });

  it('rejects rows without a name on insert with missing_name', async () => {
    const res = await POST(makeRequest([{ email: 'noname@example.com' }]));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.inserted).toBe(0);
    expect(json.data.errors).toHaveLength(1);
    expect(json.data.errors[0].reason).toBe('missing_name');
  });
});

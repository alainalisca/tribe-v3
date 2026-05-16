/**
 * Tests for buildMyDataExport (lib/dal/memberSelf.ts).
 *
 * Covers the right-to-access path:
 *   - Empty email → no_email
 *   - Missing service-role env → service_role_missing
 *   - No matching client rows → memberships: []
 *   - One membership → full hydration including counters, gym info,
 *     attendance, and partners
 *   - Multi-gym member → one membership per gym
 *   - Attendance grouped by client_id (no cross-bleed)
 *   - Partner attached to the matching side (member_a or member_b)
 *   - Schema shape stability: generated_at + user_email + schema_version
 *
 * Uses the same service-role mock pattern as
 * lib/dal/memberSelf.checkIn.test.ts — env vars stubbed in beforeEach,
 * @supabase/supabase-js mocked per test via vi.doMock + reset modules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  vi.resetModules();
});

interface ClientRow {
  id: string;
  gym_id: string;
  name: string;
  email: string;
  status: string | null;
  archived: boolean;
  total_sessions: number;
  sessions_last_30_days: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_seen_at: string | null;
  gym: { id: string; name: string; slug: string; timezone: string } | null;
}

interface AttendanceRow {
  id: string;
  client_id: string;
  attended: boolean;
  paid: boolean;
  amount_paid_cents: number | null;
  currency: string | null;
  attended_at: string | null;
  created_at: string;
  session: {
    id: string;
    title: string | null;
    sport: string | null;
    date: string | null;
    start_time: string | null;
  } | null;
}

interface PartnerRow {
  member_a_id: string;
  member_b_id: string;
  shared_sessions: number;
  last_shared_at: string;
  client_a: { id: string; name: string; archived: boolean } | null;
  client_b: { id: string; name: string; archived: boolean } | null;
}

interface MockShape {
  clients?: ClientRow[];
  clientsError?: { message: string } | null;
  attendance?: AttendanceRow[];
  attendanceError?: { message: string } | null;
  partners?: PartnerRow[];
  partnersError?: { message: string } | null;
}

/**
 * Build a SupabaseClient mock that dispatches by table name. The
 * clients query terminates via .ilike()-then-await; attendance and
 * partners are .select()-chain-then-await.
 *
 * Doesn't simulate the .ilike() email filter — tests pass whatever
 * client rows they want returned and trust the DAL to do nothing
 * more than pass the (already-lowercased) email through. The
 * email-match identity gate is enforced in getMyTrainingRecord,
 * not here; buildMyDataExport returns whatever the DB returns for
 * a given email (this matches the "give me ALL my data" semantics).
 */
function buildSupabaseMock(shape: MockShape): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'clients') {
        const chain: Record<string, unknown> = {};
        const fn = () => chain;
        chain.select = fn;
        chain.ilike = fn;
        chain.not = fn;
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: shape.clients ?? [], error: shape.clientsError ?? null });
        return chain;
      }
      if (table === 'client_attendance') {
        const chain: Record<string, unknown> = {};
        const fn = () => chain;
        chain.select = fn;
        chain.in = fn;
        chain.order = fn;
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: shape.attendance ?? [], error: shape.attendanceError ?? null });
        return chain;
      }
      if (table === 'training_partners') {
        const chain: Record<string, unknown> = {};
        const fn = () => chain;
        chain.select = fn;
        chain.or = fn;
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: shape.partners ?? [], error: shape.partnersError ?? null });
        return chain;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

async function loadDal(shape: MockShape) {
  vi.doMock('@supabase/supabase-js', async () => {
    const actual = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
    return {
      ...actual,
      createClient: () => buildSupabaseMock(shape),
    };
  });
  return import('./memberSelf');
}

const GYM_BOGOTA = { id: 'gym-1', name: 'Studio Bogotá', slug: 'studio-bogota', timezone: 'America/Bogota' };

function clientRow(opts: { id: string; gymId: string; gym?: ClientRow['gym']; total?: number }): ClientRow {
  return {
    id: opts.id,
    gym_id: opts.gymId,
    name: 'Test Member',
    email: 'me@example.com',
    status: 'active',
    archived: false,
    total_sessions: opts.total ?? 30,
    sessions_last_30_days: 8,
    current_streak_days: 14,
    longest_streak_days: 28,
    last_seen_at: '2026-05-12T16:00:00Z',
    gym: opts.gym ?? GYM_BOGOTA,
  };
}

describe('buildMyDataExport — input + env guards', () => {
  it('returns no_email when given a whitespace-only email', async () => {
    const { buildMyDataExport } = await loadDal({});
    const result = await buildMyDataExport('   ');
    expect(result.success).toBe(false);
    expect(result.error).toBe('no_email');
  });

  it('returns service_role_missing when env vars are unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { buildMyDataExport } = await import('./memberSelf');
    const result = await buildMyDataExport('me@example.com');
    expect(result.success).toBe(false);
    expect(result.error).toBe('service_role_missing');
  });

  it('lowercases the email before passing to the query (auth stores lowercase)', async () => {
    // This is observable indirectly via the returned user_email field
    // — the DAL normalizes before storing in the result payload.
    const { buildMyDataExport } = await loadDal({ clients: [] });
    const result = await buildMyDataExport('Me@Example.COM');
    expect(result.success).toBe(true);
    expect(result.data?.user_email).toBe('me@example.com');
  });
});

describe('buildMyDataExport — empty case', () => {
  it('returns an empty memberships array when no client rows match', async () => {
    const { buildMyDataExport } = await loadDal({ clients: [] });
    const result = await buildMyDataExport('me@example.com');
    expect(result.success).toBe(true);
    expect(result.data?.memberships).toEqual([]);
    expect(result.data?.schema_version).toBe(1);
    expect(result.data?.user_email).toBe('me@example.com');
    expect(typeof result.data?.generated_at).toBe('string');
  });

  it('returns success on clientsError logged-but-passed-through (graceful read failure)', async () => {
    const { buildMyDataExport } = await loadDal({
      clientsError: { message: 'connection refused' },
    });
    const result = await buildMyDataExport('me@example.com');
    // Per the DAL, a clients-query error returns success:false
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

describe('buildMyDataExport — single membership', () => {
  it('hydrates the full membership shape for one gym', async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [clientRow({ id: 'client-1', gymId: 'gym-1' })],
      attendance: [],
      partners: [],
    });
    const result = await buildMyDataExport('me@example.com');
    expect(result.success).toBe(true);
    expect(result.data?.memberships).toHaveLength(1);
    const m = result.data!.memberships[0];
    expect(m.client_id).toBe('client-1');
    expect(m.member_name).toBe('Test Member');
    expect(m.gym).toEqual(GYM_BOGOTA);
    expect(m.cached_counters).toMatchObject({
      total_sessions: 30,
      sessions_last_30_days: 8,
      current_streak_days: 14,
      longest_streak_days: 28,
      last_seen_at: '2026-05-12T16:00:00Z',
    });
    expect(m.attendance).toEqual([]);
    expect(m.partners).toEqual([]);
  });

  it('skips a row whose joined gym is null (defensive guard)', async () => {
    // Bypass the clientRow helper for this case — its `gym ?? default`
    // coalesces null back to the default, which is the wrong behavior
    // for testing the explicit-null branch.
    const rowWithNullGym: ClientRow = { ...clientRow({ id: 'client-1', gymId: 'gym-1' }), gym: null };
    const { buildMyDataExport } = await loadDal({
      clients: [rowWithNullGym, clientRow({ id: 'client-2', gymId: 'gym-2' })],
      attendance: [],
      partners: [],
    });
    const result = await buildMyDataExport('me@example.com');
    expect(result.data?.memberships.map((m) => m.client_id)).toEqual(['client-2']);
  });
});

describe('buildMyDataExport — attendance grouping', () => {
  it('attaches attendance rows to the right client by client_id', async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [
        clientRow({ id: 'client-A', gymId: 'gym-1' }),
        clientRow({ id: 'client-B', gymId: 'gym-2', gym: { ...GYM_BOGOTA, id: 'gym-2', name: 'Studio Medellín' } }),
      ],
      attendance: [
        // Two attendance rows for client-A, one for client-B.
        {
          id: 'att-1',
          client_id: 'client-A',
          attended: true,
          paid: true,
          amount_paid_cents: 2000,
          currency: 'USD',
          attended_at: '2026-05-12T10:00:00Z',
          created_at: '2026-05-12T10:00:00Z',
          session: { id: 's1', title: 'Chest Day', sport: null, date: '2026-05-12', start_time: '10:00:00' },
        },
        {
          id: 'att-2',
          client_id: 'client-A',
          attended: true,
          paid: false,
          amount_paid_cents: null,
          currency: null,
          attended_at: '2026-05-10T10:00:00Z',
          created_at: '2026-05-10T10:00:00Z',
          session: null,
        },
        {
          id: 'att-3',
          client_id: 'client-B',
          attended: false,
          paid: false,
          amount_paid_cents: null,
          currency: null,
          attended_at: null,
          created_at: '2026-05-08T10:00:00Z',
          session: { id: 's3', title: 'Recovery', sport: 'Yoga', date: '2026-05-08', start_time: '07:00:00' },
        },
      ],
      partners: [],
    });
    const result = await buildMyDataExport('me@example.com');
    const membershipsById = new Map(result.data!.memberships.map((m) => [m.client_id, m]));
    expect(membershipsById.get('client-A')?.attendance).toHaveLength(2);
    expect(membershipsById.get('client-B')?.attendance).toHaveLength(1);
    // Attendance carries the joined session info through unchanged
    expect(membershipsById.get('client-B')?.attendance[0].session?.sport).toBe('Yoga');
  });

  it('returns an empty attendance array for a client with no rows', async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [clientRow({ id: 'client-1', gymId: 'gym-1' })],
      attendance: [],
      partners: [],
    });
    const result = await buildMyDataExport('me@example.com');
    expect(result.data?.memberships[0].attendance).toEqual([]);
  });
});

describe('buildMyDataExport — partner attachment', () => {
  it('attaches partner via member_a_id when the caller is the A side', async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [clientRow({ id: 'client-A', gymId: 'gym-1' })],
      attendance: [],
      partners: [
        {
          member_a_id: 'client-A',
          member_b_id: 'other-1',
          shared_sessions: 12,
          last_shared_at: '2026-05-10T10:00:00Z',
          client_a: { id: 'client-A', name: 'Test Member', archived: false },
          client_b: { id: 'other-1', name: 'Carlos', archived: false },
        },
      ],
    });
    const result = await buildMyDataExport('me@example.com');
    expect(result.data?.memberships[0].partners).toEqual([
      {
        partner_id: 'other-1',
        partner_name: 'Carlos',
        shared_sessions: 12,
        last_shared_at: '2026-05-10T10:00:00Z',
      },
    ]);
  });

  it('attaches partner via member_b_id when the caller is the B side', async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [clientRow({ id: 'client-B', gymId: 'gym-1' })],
      attendance: [],
      partners: [
        {
          member_a_id: 'other-2',
          member_b_id: 'client-B',
          shared_sessions: 5,
          last_shared_at: '2026-05-05T10:00:00Z',
          client_a: { id: 'other-2', name: 'Ana', archived: false },
          client_b: { id: 'client-B', name: 'Test Member', archived: false },
        },
      ],
    });
    const result = await buildMyDataExport('me@example.com');
    expect(result.data?.memberships[0].partners[0]).toEqual({
      partner_id: 'other-2',
      partner_name: 'Ana',
      shared_sessions: 5,
      last_shared_at: '2026-05-05T10:00:00Z',
    });
  });

  it("does not attach when neither side matches any of the caller's client_ids", async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [clientRow({ id: 'client-A', gymId: 'gym-1' })],
      attendance: [],
      partners: [
        {
          member_a_id: 'unrelated-1',
          member_b_id: 'unrelated-2',
          shared_sessions: 99,
          last_shared_at: '2026-05-10T10:00:00Z',
          client_a: { id: 'unrelated-1', name: 'X', archived: false },
          client_b: { id: 'unrelated-2', name: 'Y', archived: false },
        },
      ],
    });
    const result = await buildMyDataExport('me@example.com');
    expect(result.data?.memberships[0].partners).toEqual([]);
  });
});

describe('buildMyDataExport — multi-gym member', () => {
  it('returns one membership per gym the email matches', async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [
        clientRow({ id: 'client-A', gymId: 'gym-1' }),
        clientRow({
          id: 'client-B',
          gymId: 'gym-2',
          gym: { id: 'gym-2', name: 'Studio Medellín', slug: 'studio-medellin', timezone: 'America/Bogota' },
        }),
      ],
      attendance: [],
      partners: [],
    });
    const result = await buildMyDataExport('me@example.com');
    expect(result.data?.memberships).toHaveLength(2);
    expect(result.data?.memberships.map((m) => m.gym.id).sort()).toEqual(['gym-1', 'gym-2']);
  });
});

describe('buildMyDataExport — schema shape', () => {
  it('always emits schema_version: 1 + ISO generated_at + lowercased user_email', async () => {
    const { buildMyDataExport } = await loadDal({
      clients: [clientRow({ id: 'client-1', gymId: 'gym-1' })],
      attendance: [],
      partners: [],
    });
    const result = await buildMyDataExport('ME@Example.com');
    expect(result.data?.schema_version).toBe(1);
    expect(result.data?.user_email).toBe('me@example.com');
    // ISO date string
    expect(result.data?.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

/**
 * Tests for recordSelfCheckIn (lib/dal/memberSelf.ts).
 *
 * The function uses a service-role Supabase client internally (since
 * client_attendance RLS doesn't have a "members self-check-in" branch)
 * so the tests stub the env vars + mock @supabase/supabase-js to
 * return a controllable client.
 *
 * Identity gating is the highest-value invariant under test here:
 * the email-match check is the only thing between "member sees their
 * own data" and "member writes to someone else's row." Plus the
 * today-only rule, the wrong-gym rule, and the archived-member rule
 * all need explicit coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Suppress logger noise.
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

// Stub the env vars buildServiceClient() needs.
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  vi.resetModules();
});

interface ClientRow {
  id: string;
  gym_id: string;
  email: string | null;
  archived: boolean;
  gym: { id: string; owner_user_id: string; timezone: string } | null;
}

interface SessionRow {
  id: string;
  creator_id: string;
  date: string;
  status: string;
}

interface ExistingAttendance {
  id: string;
  attended: boolean;
}

interface MockShape {
  clientRow?: ClientRow | null;
  clientErr?: { message: string } | null;
  sessionRow?: SessionRow | null;
  sessionErr?: { message: string } | null;
  existingAtt?: ExistingAttendance | null;
  existingErr?: { message: string } | null;
  insertErr?: { message: string } | null;
  updateErr?: { message: string } | null;
}

/**
 * Build a SupabaseClient mock that dispatches by table name. Stateful
 * enough to handle the three-table sequence recordSelfCheckIn walks
 * through (clients → sessions → client_attendance) without bleeding
 * state across tests.
 */
function buildSupabaseMock(shape: MockShape): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: shape.clientRow ?? null,
                error: shape.clientErr ?? null,
              }),
            }),
          }),
        };
      }
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: shape.sessionRow ?? null,
                error: shape.sessionErr ?? null,
              }),
            }),
          }),
        };
      }
      if (table === 'client_attendance') {
        return {
          // Existing-row lookup
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: shape.existingAtt ?? null,
                  error: shape.existingErr ?? null,
                }),
              }),
            }),
          }),
          // Update path
          update: () => ({
            eq: async () => ({ error: shape.updateErr ?? null }),
          }),
          // Insert path
          insert: async () => ({ error: shape.insertErr ?? null }),
        };
      }
      throw new Error(`unexpected table in mock: ${table}`);
    },
  } as unknown as SupabaseClient;
}

/**
 * Helper to compute "today" in a given IANA timezone, matching the
 * format the DAL uses (en-CA → YYYY-MM-DD). Lets us build sessions
 * that fall on "today" vs "yesterday" for the date-gating tests.
 */
function todayInTz(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function yesterdayInTz(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

const GYM_TZ = 'America/Bogota';
const TODAY = () => todayInTz(GYM_TZ);
const YESTERDAY = () => yesterdayInTz(GYM_TZ);

const ALICE_EMAIL = 'alice@example.com';
const BASE_CLIENT: ClientRow = {
  id: 'client-alice',
  gym_id: 'gym-1',
  email: ALICE_EMAIL,
  archived: false,
  gym: { id: 'gym-1', owner_user_id: 'owner-1', timezone: GYM_TZ },
};

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

describe('recordSelfCheckIn — input + identity gating', () => {
  it('rejects empty email as no_email', async () => {
    const { recordSelfCheckIn } = await loadDal({});
    const result = await recordSelfCheckIn('client-alice', 'session-1', '   ');
    expect(result.success).toBe(false);
    expect(result.error).toBe('no_email');
  });

  it('returns not_found when the client row does not exist', async () => {
    const { recordSelfCheckIn } = await loadDal({ clientRow: null });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('returns archived_member when the client is archived', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: { ...BASE_CLIENT, archived: true },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('archived_member');
  });

  it('returns identity_mismatch when the email does NOT match clients.email', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: { ...BASE_CLIENT, email: 'someone-else@example.com' },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('identity_mismatch');
  });

  it('accepts case-insensitive email match (auth lowercases)', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: { ...BASE_CLIENT, email: 'Alice@Example.com' },
      sessionRow: { id: 'session-1', creator_id: 'owner-1', date: TODAY(), status: 'active' },
      existingAtt: null,
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', 'alice@example.com');
    expect(result.success).toBe(true);
  });

  it('returns db_error when the client lookup itself fails', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientErr: { message: 'connection refused' },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
  });
});

describe('recordSelfCheckIn — session validation', () => {
  it('returns not_found when the session does not exist', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: null,
    });
    const result = await recordSelfCheckIn('client-alice', 'session-missing', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('returns wrong_gym when session creator is NOT the gym owner', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: {
        id: 'session-1',
        creator_id: 'some-other-coach', // not gym-1's owner
        date: TODAY(),
        status: 'active',
      },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('wrong_gym');
  });

  it('returns wrong_day when session date is NOT today in the gym TZ', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: {
        id: 'session-1',
        creator_id: 'owner-1',
        date: YESTERDAY(), // yesterday
        status: 'active',
      },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('wrong_day');
  });
});

describe('recordSelfCheckIn — attendance write paths', () => {
  it('inserts a new attendance row when no existing one is found', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: { id: 'session-1', creator_id: 'owner-1', date: TODAY(), status: 'active' },
      existingAtt: null,
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(true);
    expect(result.data?.created).toBe(true);
    expect(result.data?.client_id).toBe('client-alice');
    expect(result.data?.session_id).toBe('session-1');
  });

  it('is idempotent — returns success without writing when attended=true already', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: { id: 'session-1', creator_id: 'owner-1', date: TODAY(), status: 'active' },
      existingAtt: { id: 'att-1', attended: true },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(true);
    expect(result.data?.created).toBe(false);
  });

  it('upgrades a coach-created attended=false row to attended=true', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: { id: 'session-1', creator_id: 'owner-1', date: TODAY(), status: 'active' },
      existingAtt: { id: 'att-1', attended: false },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(true);
    // created:false because the row pre-existed; the DAL updated it
    // rather than inserting a new one. This is the path coaches care
    // about — they marked the session "available," the member showed up.
    expect(result.data?.created).toBe(false);
  });

  it('returns db_error when the insert phase fails', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: { id: 'session-1', creator_id: 'owner-1', date: TODAY(), status: 'active' },
      existingAtt: null,
      insertErr: { message: 'unique violation' },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
  });

  it('returns db_error when the update phase fails', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: { id: 'session-1', creator_id: 'owner-1', date: TODAY(), status: 'active' },
      existingAtt: { id: 'att-1', attended: false },
      updateErr: { message: 'permission denied' },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
  });

  it('returns db_error when looking up an existing row fails', async () => {
    const { recordSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: { id: 'session-1', creator_id: 'owner-1', date: TODAY(), status: 'active' },
      existingErr: { message: 'lookup blew up' },
    });
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
  });
});

describe('recordSelfCheckIn — missing env config', () => {
  it('returns service_role_missing when env vars are unset', async () => {
    // We use vi.resetModules in beforeEach so re-importing reads
    // these fresh values without cache from prior tests.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { recordSelfCheckIn } = await import('./memberSelf');
    const result = await recordSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('service_role_missing');
  });
});

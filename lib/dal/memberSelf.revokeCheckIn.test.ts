/**
 * Tests for revokeSelfCheckIn (lib/dal/memberSelf.ts).
 *
 * The undo path mirrors recordSelfCheckIn's gate model:
 *   - email-match identity check (the only thing between "undo my
 *     check-in" and "undo someone else's")
 *   - session must belong to gym owner (creator_id)
 *   - session date must be today in gym timezone (today-only)
 *   - archived-member guard
 *   - idempotent when the row is already attended:false
 *
 * Plus the success path: existing row with attended:true gets
 * flipped to false; attended_at stays intact (historical record).
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
  email: string | null;
  archived: boolean;
  gym: { id: string; owner_user_id: string; timezone: string } | null;
}

interface SessionRow {
  id: string;
  creator_id: string;
  date: string;
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
  updateErr?: { message: string } | null;
}

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
          update: () => ({
            eq: async () => ({ error: shape.updateErr ?? null }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

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
const BASE_SESSION = (date: string): SessionRow => ({
  id: 'session-1',
  creator_id: 'owner-1',
  date,
});

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

describe('revokeSelfCheckIn — identity + scope gates', () => {
  it('returns no_email for whitespace-only email', async () => {
    const { revokeSelfCheckIn } = await loadDal({});
    const r = await revokeSelfCheckIn('client-alice', 'session-1', '   ');
    expect(r.success).toBe(false);
    expect(r.error).toBe('no_email');
  });

  it('returns not_found when the client row is missing', async () => {
    const { revokeSelfCheckIn } = await loadDal({ clientRow: null });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('not_found');
  });

  it('returns archived_member when the client is archived', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: { ...BASE_CLIENT, archived: true },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('archived_member');
  });

  it('returns identity_mismatch when emails differ', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: { ...BASE_CLIENT, email: 'someone-else@example.com' },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('identity_mismatch');
  });

  it('accepts case-insensitive email match', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: { ...BASE_CLIENT, email: 'Alice@Example.com' },
      sessionRow: BASE_SESSION(TODAY()),
      existingAtt: { id: 'att-1', attended: true },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', 'alice@example.com');
    expect(r.success).toBe(true);
  });

  it('returns wrong_gym when session creator is not the gym owner', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: { ...BASE_SESSION(TODAY()), creator_id: 'someone-else' },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('wrong_gym');
  });

  it('returns wrong_day when session date is not today (gym tz)', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: BASE_SESSION(YESTERDAY()),
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('wrong_day');
  });

  it('returns not_found when no attendance row exists for the pair', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: BASE_SESSION(TODAY()),
      existingAtt: null,
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('not_found');
  });
});

describe('revokeSelfCheckIn — happy path + idempotency', () => {
  it('flips attended:true to attended:false and reports reverted:true', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: BASE_SESSION(TODAY()),
      existingAtt: { id: 'att-1', attended: true },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(true);
    expect(r.data?.reverted).toBe(true);
  });

  it('returns reverted:false when the row was already attended:false (idempotent)', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: BASE_SESSION(TODAY()),
      existingAtt: { id: 'att-1', attended: false },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(true);
    expect(r.data?.reverted).toBe(false);
  });
});

describe('revokeSelfCheckIn — DB error paths', () => {
  it('returns db_error on client lookup failure', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientErr: { message: 'connection refused' },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('db_error');
  });

  it('returns db_error on session lookup failure', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionErr: { message: 'lookup blew up' },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('db_error');
  });

  it('returns db_error on existing-row lookup failure', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: BASE_SESSION(TODAY()),
      existingErr: { message: 'oops' },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('db_error');
  });

  it('returns db_error on update failure', async () => {
    const { revokeSelfCheckIn } = await loadDal({
      clientRow: BASE_CLIENT,
      sessionRow: BASE_SESSION(TODAY()),
      existingAtt: { id: 'att-1', attended: true },
      updateErr: { message: 'permission denied' },
    });
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('db_error');
  });
});

describe('revokeSelfCheckIn — env guard', () => {
  it('returns service_role_missing when env vars are unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { revokeSelfCheckIn } = await import('./memberSelf');
    const r = await revokeSelfCheckIn('client-alice', 'session-1', ALICE_EMAIL);
    expect(r.success).toBe(false);
    expect(r.error).toBe('service_role_missing');
  });
});

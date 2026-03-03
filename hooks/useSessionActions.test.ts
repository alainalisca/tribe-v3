import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { joinSession } from '@/lib/sessions';
import { cancelSession } from '@/lib/dal';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
}));

vi.mock('@/lib/errorMessages', () => ({
  getErrorMessage: vi.fn(() => 'Error message'),
}));

vi.mock('@/lib/confetti', () => ({
  celebrateJoin: vi.fn(),
}));

// Mock fetch for notifications
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

// Test the underlying functions that useSessionActions delegates to
describe('joinSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockSupabase(config: {
    session?: Record<string, unknown> | null;
    sessionError?: { message: string } | null;
    existingParticipant?: Record<string, unknown> | null;
    confirmedCount?: number;
    insertError?: { message: string } | null;
  }) {
    return {
      from: (table: string) => {
        if (table === 'sessions') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: config.session ?? null,
                  error: config.sessionError ?? null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }

        if (table === 'session_participants') {
          return {
            select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.count === 'exact') {
                const countChain: Record<string, unknown> = {};
                countChain.eq = () => countChain;
                countChain.then = (resolve: (v: unknown) => void) =>
                  resolve({ count: config.confirmedCount ?? 0, error: null });
                return countChain;
              }
              return {
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: config.existingParticipant ?? null,
                      error: null,
                    }),
                  }),
                }),
              };
            },
            insert: () => ({
              error: config.insertError ?? null,
              then: (resolve: (v: unknown) => void) => resolve({ error: config.insertError ?? null }),
            }),
          };
        }

        return {};
      },
    } as unknown as SupabaseClient;
  }

  it('joinSession calls Supabase insert on success', async () => {
    const mockSupabase = createMockSupabase({
      session: {
        id: 'session-1',
        creator_id: 'creator-1',
        join_policy: 'open',
        max_participants: 10,
        current_participants: 2,
        status: 'active',
        sport: 'Running',
      },
      existingParticipant: null,
      confirmedCount: 2,
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('confirmed');
  });

  it('joinSession returns pending for curated sessions', async () => {
    const mockSupabase = createMockSupabase({
      session: {
        id: 'session-1',
        creator_id: 'creator-1',
        join_policy: 'curated',
        max_participants: 10,
        current_participants: 2,
        status: 'active',
        sport: 'Yoga',
      },
      existingParticipant: null,
      confirmedCount: 2,
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');
  });

  it('joinSession fails when session is full', async () => {
    const mockSupabase = createMockSupabase({
      session: {
        id: 'session-1',
        creator_id: 'creator-1',
        join_policy: 'open',
        max_participants: 5,
        current_participants: 5,
        status: 'active',
        sport: 'Running',
      },
      existingParticipant: null,
      confirmedCount: 5,
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('capacity_full');
  });

  it('joinSession fails when session not found', async () => {
    const mockSupabase = createMockSupabase({
      session: null,
      sessionError: { message: 'Not found' },
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'nonexistent',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('session_not_found');
  });

  it('joinSession prevents self-join (creator joining own session)', async () => {
    const mockSupabase = createMockSupabase({
      session: {
        id: 'session-1',
        creator_id: 'user-1', // Same as joining user
        join_policy: 'open',
        max_participants: 10,
        current_participants: 1,
        status: 'active',
        sport: 'Running',
      },
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'user-1',
      userName: 'Creator',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('self_join');
  });
});

describe('cancelSession', () => {
  it('cancelSession updates session status', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
        delete: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await cancelSession(mockSupabase, 'session-1');
    expect(result.success).toBe(true);
  });

  it('cancelSession handles errors gracefully', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: { message: 'Permission denied' } }),
        }),
        delete: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await cancelSession(mockSupabase, 'session-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Permission denied');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { joinSession } from './sessions';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

// Mock fetch for notification calls
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

// Factory for building a mock SupabaseClient tailored to joinSession's query sequence:
// 1. from('sessions').select(...).eq('id', ...).single()
// 2. from('session_participants').select('id, status').eq(...).eq(...).maybeSingle()
// 3. from('session_participants').select('id', { count: 'exact', head: true }).eq(...).eq(...)
// 4. from('session_participants').insert(...) -- terminal
// 5. from('sessions').update(...).eq(...) -- terminal

interface MockSessionData {
  session?: Record<string, unknown> | null;
  sessionError?: { message: string } | null;
  existingParticipant?: Record<string, unknown> | null;
  confirmedCount?: number;
  insertError?: { message: string } | null;
}

function createJoinSessionMock(config: MockSessionData) {
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
              // Call 3: count query
              const countChain: Record<string, unknown> = {};
              countChain.eq = () => countChain;
              countChain.then = (resolve: (v: unknown) => void) =>
                resolve({ count: config.confirmedCount ?? 0, error: null });
              return countChain;
            }
            // Call 2: existing participant check
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

const baseSession = {
  id: 'session-1',
  creator_id: 'creator-1',
  join_policy: 'open',
  max_participants: 10,
  current_participants: 3,
  status: 'active',
  sport: 'Running',
};

describe('joinSession', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('joins an open session successfully', async () => {
    const mockSupabase = createJoinSessionMock({
      session: baseSession,
      existingParticipant: null,
      confirmedCount: 3,
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

  it('returns session_not_found when session does not exist', async () => {
    const mockSupabase = createJoinSessionMock({
      session: null,
      sessionError: { message: 'Row not found' },
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

  it('returns session_not_active for cancelled sessions', async () => {
    const mockSupabase = createJoinSessionMock({
      session: { ...baseSession, status: 'cancelled' },
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('session_not_active');
  });

  it('returns self_join when creator tries to join own session', async () => {
    const mockSupabase = createJoinSessionMock({
      session: baseSession,
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'creator-1',
      userName: 'Creator',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('self_join');
  });

  it('returns already_joined when user has existing participation', async () => {
    const mockSupabase = createJoinSessionMock({
      session: baseSession,
      existingParticipant: { id: 'participant-1', status: 'confirmed' },
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('already_joined');
  });

  it('returns capacity_full when session is at max capacity', async () => {
    const mockSupabase = createJoinSessionMock({
      session: { ...baseSession, max_participants: 5 },
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

  it('returns pending status for curated sessions', async () => {
    const mockSupabase = createJoinSessionMock({
      session: { ...baseSession, join_policy: 'curated' },
      existingParticipant: null,
      confirmedCount: 3,
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

  it('returns invite_only error for invite-only sessions', async () => {
    const mockSupabase = createJoinSessionMock({
      session: { ...baseSession, join_policy: 'invite_only' },
      existingParticipant: null,
      confirmedCount: 3,
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: 'session-1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('invite_only');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  sendConnectionRequest,
  acceptConnection,
  declineConnection,
  removeConnection,
  getConnectionStatus,
  fetchConnections,
  fetchPendingRequests,
  fetchTrainingPartners,
  hasSharedSession,
  getSharedSessionCount,
} from './connections';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

/** Helper: build a mock SupabaseClient with chainable query builder */
function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const queryBuilder: Record<string, unknown> = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };

  // Make every chainable method return the builder
  for (const key of Object.keys(queryBuilder)) {
    const val = queryBuilder[key];
    if (typeof val === 'function' && !['single'].includes(key)) {
      (queryBuilder[key] as ReturnType<typeof vi.fn>).mockReturnValue(queryBuilder);
    }
  }

  const supabase = {
    from: vi.fn().mockReturnValue(queryBuilder),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as unknown as SupabaseClient;

  return { supabase, queryBuilder };
}

describe('sendConnectionRequest', () => {
  it('returns success with connection id when shared session exists', async () => {
    const { supabase } = createMockSupabase();

    // rpc calls: have_shared_session -> true, first_shared_session -> 'session-1'
    (supabase.rpc as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: 'session-1', error: null });

    // insert -> select -> single returns the new connection id
    const qb = (supabase.from as ReturnType<typeof vi.fn>).mock.results;
    // We need to set up single() to resolve with the id
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'conn-123' }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert: mockInsert });

    const result = await sendConnectionRequest(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(true);
    expect(result.data).toBe('conn-123');
  });

  it('returns error when users have not shared a session', async () => {
    const { supabase } = createMockSupabase();

    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: false, error: null });

    const result = await sendConnectionRequest(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(false);
    expect(result.error).toBe('You must train together first');
  });

  it('returns error when rpc fails', async () => {
    const { supabase } = createMockSupabase();

    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC error' },
    });

    const result = await sendConnectionRequest(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot verify shared session');
  });
});

describe('getConnectionStatus', () => {
  it('returns "none" when no connection exists', async () => {
    const { supabase, queryBuilder } = createMockSupabase();
    (queryBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    const result = await getConnectionStatus(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(true);
    expect(result.data).toBe('none');
  });

  it('returns "connected" when status is accepted', async () => {
    const { supabase, queryBuilder } = createMockSupabase();
    (queryBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { status: 'accepted', requester_id: 'user-a' },
      error: null,
    });

    const result = await getConnectionStatus(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(true);
    expect(result.data).toBe('connected');
  });

  it('returns "pending_sent" when current user is the requester', async () => {
    const { supabase, queryBuilder } = createMockSupabase();
    (queryBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { status: 'pending', requester_id: 'user-a' },
      error: null,
    });

    const result = await getConnectionStatus(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(true);
    expect(result.data).toBe('pending_sent');
  });

  it('returns "pending_received" when other user is the requester', async () => {
    const { supabase, queryBuilder } = createMockSupabase();
    (queryBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { status: 'pending', requester_id: 'user-b' },
      error: null,
    });

    const result = await getConnectionStatus(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(true);
    expect(result.data).toBe('pending_received');
  });

  it('returns error on non-PGRST116 database error', async () => {
    const { supabase, queryBuilder } = createMockSupabase();
    (queryBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'table not found' },
    });

    const result = await getConnectionStatus(supabase, 'user-a', 'user-b');

    expect(result.success).toBe(false);
    expect(result.error).toBe('table not found');
  });
});

describe('module exports', () => {
  it('exports all expected functions', () => {
    expect(typeof sendConnectionRequest).toBe('function');
    expect(typeof acceptConnection).toBe('function');
    expect(typeof declineConnection).toBe('function');
    expect(typeof removeConnection).toBe('function');
    expect(typeof getConnectionStatus).toBe('function');
    expect(typeof fetchConnections).toBe('function');
    expect(typeof fetchPendingRequests).toBe('function');
    expect(typeof fetchTrainingPartners).toBe('function');
    expect(typeof hasSharedSession).toBe('function');
    expect(typeof getSharedSessionCount).toBe('function');
  });
});

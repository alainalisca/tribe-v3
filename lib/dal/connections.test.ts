import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for lib/dal/connections.ts — focused on sendConnectionRequest, the
 * only function with non-trivial branching logic.
 *
 * Rewritten 2026-04-21. Previous fixtures tried to exercise every exported
 * function with a single reused chainable mock, which drifted as the
 * queries evolved. This version covers sendConnectionRequest's decision
 * tree with precise per-query mocks:
 *
 *   - blocked_users hit → error "Cannot connect with this user"
 *   - existing accepted connection → error "Already connected"
 *   - existing pending request from THE SAME caller → error "Request already sent"
 *   - existing pending request from the OTHER side → auto-accept, returns id
 *   - have_shared_session RPC returns false → error "You must train together first"
 *   - happy path: RPC returns true → connections.insert → returns new id
 *   - unique-violation (23505) on insert → error "Connection request already exists"
 *
 * Other exports (fetchConnections, fetchPendingRequests, etc.) are thin
 * wrappers around supabase queries with no branching worth unit-testing;
 * they're covered at integration level.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { sendConnectionRequest } from './connections';

// ── Mock builder ───────────────────────────────────────────────────

interface Scenario {
  blockedExists?: boolean;
  existingConnection?: { id: string; status: string; requester_id: string } | null;
  acceptError?: { message: string } | null;
  hasSharedResult?: { data: boolean | null; error: { message: string } | null };
  firstSharedResult?: { data: string | null; error: { message: string } | null };
  insertResult?: { data: { id: string } | null; error: { code?: string; message: string } | null };
}

function mockSupabase(s: Scenario) {
  // blocked_users.select().or().maybeSingle() → data/error
  const blockedMaybeSingle = vi.fn().mockResolvedValue({
    data: s.blockedExists ? { id: 'block-1' } : null,
    error: null,
  });
  // connections.select('id, status, requester_id').or().maybeSingle() → existingConnection
  const connectionsSelectMaybeSingle = vi.fn().mockResolvedValue({
    data: s.existingConnection ?? null,
    error: null,
  });
  // connections.update().eq() → { error }
  const connectionsUpdateEq = vi.fn().mockResolvedValue({ error: s.acceptError ?? null });
  // connections.insert().select('id').single() → { data, error }
  const connectionsInsertSingle = vi.fn().mockResolvedValue({
    data: s.insertResult?.data ?? null,
    error: s.insertResult?.error ?? null,
  });

  const from = vi.fn((table: string) => {
    if (table === 'blocked_users') {
      return {
        select: () => ({
          or: () => ({ maybeSingle: blockedMaybeSingle }),
        }),
      };
    }
    if (table === 'connections') {
      return {
        select: () => ({
          or: () => ({ maybeSingle: connectionsSelectMaybeSingle }),
        }),
        update: () => ({ eq: connectionsUpdateEq }),
        insert: () => ({ select: () => ({ single: connectionsInsertSingle }) }),
      };
    }
    return {};
  });

  const rpc = vi.fn((name: string) => {
    if (name === 'have_shared_session') {
      return Promise.resolve(s.hasSharedResult ?? { data: true, error: null });
    }
    if (name === 'first_shared_session') {
      return Promise.resolve(s.firstSharedResult ?? { data: 'sess-1', error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  return {
    from,
    rpc,
    // Expose inner mocks so tests can assert specific calls.
    __connectionsUpdateEq: connectionsUpdateEq,
    __connectionsInsertSingle: connectionsInsertSingle,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('sendConnectionRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when either user has blocked the other', async () => {
    const s = mockSupabase({ blockedExists: true });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res).toEqual({ success: false, error: 'Cannot connect with this user' });
  });

  it('rejects when an accepted connection already exists', async () => {
    const s = mockSupabase({
      existingConnection: { id: 'conn-1', status: 'accepted', requester_id: 'a' },
    });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res).toEqual({ success: false, error: 'Already connected' });
  });

  it('rejects when the caller has already sent a pending request', async () => {
    const s = mockSupabase({
      existingConnection: { id: 'conn-2', status: 'pending', requester_id: 'a' },
    });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res).toEqual({ success: false, error: 'Request already sent' });
  });

  it('auto-accepts when the OTHER side already sent a pending request', async () => {
    const s = mockSupabase({
      existingConnection: { id: 'conn-3', status: 'pending', requester_id: 'b' },
    });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res).toEqual({ success: true, data: 'conn-3' });
    expect(s.__connectionsUpdateEq).toHaveBeenCalled();
    expect(s.__connectionsInsertSingle).not.toHaveBeenCalled();
  });

  it('refuses when users have not shared a session', async () => {
    const s = mockSupabase({
      hasSharedResult: { data: false, error: null },
    });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res).toEqual({ success: false, error: 'You must train together first' });
  });

  it('propagates have_shared_session RPC errors', async () => {
    const s = mockSupabase({
      hasSharedResult: { data: null, error: { message: 'rpc down' } },
    });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Cannot verify shared session');
  });

  it('happy path: returns new connection id', async () => {
    const s = mockSupabase({
      insertResult: { data: { id: 'conn-new' }, error: null },
    });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res).toEqual({ success: true, data: 'conn-new' });
  });

  it('translates unique-violation (23505) into a human error', async () => {
    const s = mockSupabase({
      insertResult: { data: null, error: { code: '23505', message: 'duplicate' } },
    });
    const res = await sendConnectionRequest(s as never, 'a', 'b');
    expect(res).toEqual({ success: false, error: 'Connection request already exists' });
  });
});

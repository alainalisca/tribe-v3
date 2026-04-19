import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSession,
  fetchConfirmedCount,
  cancelSession,
  deleteSession,
} from './sessions';

// Mock logger to prevent console output during tests
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {};

  chain.select = () => chain;
  chain.eq = () => chain;
  chain.single = async () => ({
    data: overrides.data ?? null,
    error: overrides.error ?? null,
  });

  // For count queries
  chain.count = overrides.count ?? null;
  chain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: overrides.data ?? null, error: overrides.error ?? null, count: overrides.count ?? null });

  return {
    from: () => {
      const tableChain: Record<string, unknown> = { ...chain };

      // select with count options
      tableChain.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact') {
          const countChain: Record<string, unknown> = {};
          countChain.eq = () => countChain;
          countChain.then = (resolve: (v: unknown) => void) =>
            resolve({ count: overrides.count ?? 0, error: overrides.error ?? null });
          return countChain;
        }
        return tableChain;
      };

      // update
      tableChain.update = () => {
        const updateChain: Record<string, unknown> = {};
        updateChain.eq = async () => ({
          error: overrides.updateError ?? overrides.error ?? null,
        });
        return updateChain;
      };

      // delete
      tableChain.delete = () => {
        const deleteChain: Record<string, unknown> = {};
        deleteChain.eq = async () => ({
          error: overrides.deleteError ?? overrides.error ?? null,
        });
        return deleteChain;
      };

      tableChain.eq = () => tableChain;
      tableChain.single = async () => ({
        data: overrides.data ?? null,
        error: overrides.error ?? null,
      });

      return tableChain;
    },
  } as unknown as SupabaseClient;
}

describe('fetchSession', () => {
  it('returns session data on success', async () => {
    const sessionData = { id: 'session-1', sport: 'running', status: 'active' };
    const mockSupabase = createMockSupabase({ data: sessionData });

    const result = await fetchSession(mockSupabase, 'session-1');

    expect(result.success).toBe(true);
    expect(result.data).toEqual(sessionData);
  });

  it('returns error when session not found', async () => {
    const mockSupabase = createMockSupabase({
      data: null,
      error: { message: 'Row not found' },
    });

    const result = await fetchSession(mockSupabase, 'nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Row not found');
  });
});

describe('fetchConfirmedCount', () => {
  it('returns correct count', async () => {
    const mockSupabase = createMockSupabase({ count: 5 });

    const result = await fetchConfirmedCount(mockSupabase, 'session-1');

    expect(result.success).toBe(true);
    expect(result.data).toBe(5);
  });

  it('returns 0 when count is null', async () => {
    const mockSupabase = createMockSupabase({ count: null });

    const result = await fetchConfirmedCount(mockSupabase, 'session-1');

    expect(result.success).toBe(true);
    expect(result.data).toBe(0);
  });
});

describe('cancelSession', () => {
  it('returns error when session not found', async () => {
    const mockSupabase = createMockSupabase({ data: null, error: { message: 'Row not found' } });

    const result = await cancelSession(mockSupabase, 'session-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
  });
});

describe('deleteSession', () => {
  it('deletes session on success', async () => {
    const mockSupabase = createMockSupabase({});

    const result = await deleteSession(mockSupabase, 'session-1');

    expect(result.success).toBe(true);
  });

  it('returns error on failure', async () => {
    const mockSupabase = createMockSupabase({
      deleteError: { message: 'Not found' },
    });

    const result = await deleteSession(mockSupabase, 'session-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { endRecurringSeries } from './sessions';
import { bogotaToday } from '@/lib/time/bogotaDate';

// Mock logger to prevent console output during tests
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

// A TRUE recurring parent: recurring, with no parent of its own.
const TRUE_PARENT = {
  creator_id: 'host-1',
  is_recurring: true,
  recurring_parent_id: null,
};

// A child occurrence: not recurring itself, points at a parent.
const CHILD_OCCURRENCE = {
  creator_id: 'host-1',
  is_recurring: false,
  recurring_parent_id: 'parent-1',
};

// A plain non-recurring one-off.
const ONE_OFF = {
  creator_id: 'host-1',
  is_recurring: false,
  recurring_parent_id: null,
};

// The nonsense state (is_recurring true AND recurring_parent_id set): still not
// a true parent, so it must be rejected as a series to end.
const RECURRING_CHILD = {
  creator_id: 'host-1',
  is_recurring: true,
  recurring_parent_id: 'parent-1',
};

interface MockOptions {
  user?: { id: string } | null;
  session?: Record<string, unknown> | null;
  sessionError?: { message: string } | null;
  updateError?: { message: string } | null;
}

/** Minimal sessions-only mock: captures the update payload for assertions. */
function createMockSupabase(opts: MockOptions) {
  const captured: { updatePayload: Record<string, unknown> | null } = { updatePayload: null };

  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: opts.user === undefined ? { id: 'host-1' } : opts.user } }),
    },
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({
        data: opts.session === undefined ? TRUE_PARENT : opts.session,
        error: opts.sessionError ?? null,
      });
      chain.update = (payload: Record<string, unknown>) => {
        captured.updatePayload = payload;
        const updateChain: Record<string, unknown> = {};
        updateChain.eq = async () => ({ error: opts.updateError ?? null });
        return updateChain;
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  return { supabase, captured };
}

describe('endRecurringSeries', () => {
  it('rejects when not signed in', async () => {
    const { supabase, captured } = createMockSupabase({ user: null });
    const result = await endRecurringSeries(supabase, 'p1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('rejects a non-owner even before RLS does', async () => {
    const { supabase, captured } = createMockSupabase({ user: { id: 'intruder' } });
    const result = await endRecurringSeries(supabase, 'p1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/host/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('rejects when the session is not found', async () => {
    const { supabase, captured } = createMockSupabase({ session: null });
    const result = await endRecurringSeries(supabase, 'p1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('rejects a child occurrence (recurring_parent_id set)', async () => {
    const { supabase, captured } = createMockSupabase({ session: CHILD_OCCURRENCE });
    const result = await endRecurringSeries(supabase, 'c1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a recurring series/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('rejects a non-recurring one-off', async () => {
    const { supabase, captured } = createMockSupabase({ session: ONE_OFF });
    const result = await endRecurringSeries(supabase, 'o1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a recurring series/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('rejects the recurring-child nonsense state (is_recurring true but parent set)', async () => {
    const { supabase, captured } = createMockSupabase({ session: RECURRING_CHILD });
    const result = await endRecurringSeries(supabase, 'rc1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a recurring series/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('ends a true parent, defaulting recurrence_end_date to today (Bogotá)', async () => {
    const { supabase, captured } = createMockSupabase({ session: TRUE_PARENT });
    const result = await endRecurringSeries(supabase, 'p1');
    expect(result.success).toBe(true);
    expect(captured.updatePayload).toEqual({ recurrence_end_date: bogotaToday() });
  });

  it('honors an explicit endDate', async () => {
    const { supabase, captured } = createMockSupabase({ session: TRUE_PARENT });
    const result = await endRecurringSeries(supabase, 'p1', '2026-01-01');
    expect(result.success).toBe(true);
    expect(captured.updatePayload).toEqual({ recurrence_end_date: '2026-01-01' });
  });

  it('surfaces a DB update error', async () => {
    const { supabase } = createMockSupabase({ session: TRUE_PARENT, updateError: { message: 'boom' } });
    const result = await endRecurringSeries(supabase, 'p1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { updateSessionAsHost } from './sessions';

// Mock logger to prevent console output during tests
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

const FUTURE_SESSION = {
  creator_id: 'host-1',
  date: '2099-01-01',
  start_time: '19:00:00',
  is_recurring: false,
};

const PAST_SESSION = {
  creator_id: 'host-1',
  date: '2020-01-01',
  start_time: '19:00:00',
  is_recurring: false,
};

const PAST_RECURRING_PARENT = {
  creator_id: 'host-1',
  date: '2020-01-01',
  start_time: '19:00:00',
  is_recurring: true,
};

interface MockOptions {
  user?: { id: string } | null;
  session?: Record<string, unknown> | null;
  sessionError?: { message: string } | null;
  profile?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
}

/** Table-aware mock: sessions select/update and users select behave independently. */
function createMockSupabase(opts: MockOptions) {
  const captured: { updatePayload: Record<string, unknown> | null } = { updatePayload: null };

  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: opts.user === undefined ? { id: 'host-1' } : opts.user } }),
    },
    from: (table: string) => {
      if (table === 'users') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.single = async () => ({ data: opts.profile ?? null, error: null });
        return chain;
      }
      // sessions
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({
        data: opts.session === undefined ? FUTURE_SESSION : opts.session,
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

describe('updateSessionAsHost', () => {
  it('rejects when not signed in', async () => {
    const { supabase } = createMockSupabase({ user: null });
    const result = await updateSessionAsHost(supabase, 's1', { sport: 'Yoga' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it('rejects a non-owner even before RLS does', async () => {
    const { supabase, captured } = createMockSupabase({ user: { id: 'intruder' } });
    const result = await updateSessionAsHost(supabase, 's1', { sport: 'Yoga' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/host/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('rejects editing a past non-recurring session', async () => {
    const { supabase, captured } = createMockSupabase({ session: PAST_SESSION });
    const result = await updateSessionAsHost(supabase, 's1', { sport: 'Yoga' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/past/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('allows editing a past-dated recurring parent', async () => {
    const { supabase, captured } = createMockSupabase({ session: PAST_RECURRING_PARENT });
    const result = await updateSessionAsHost(supabase, 's1', { sport: 'Yoga' });
    expect(result.success).toBe(true);
    expect(captured.updatePayload).toEqual({ sport: 'Yoga' });
  });

  it('rejects a paid update from a non-instructor', async () => {
    const { supabase, captured } = createMockSupabase({ profile: { is_instructor: false } });
    const result = await updateSessionAsHost(supabase, 's1', {
      is_paid: true,
      price_cents: 3500000,
      currency: 'COP',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/instructor/i);
    expect(captured.updatePayload).toBe(null);
  });

  it('rejects a paid update with no positive price', async () => {
    const { supabase } = createMockSupabase({ profile: { is_instructor: true } });
    const result = await updateSessionAsHost(supabase, 's1', { is_paid: true, price_cents: 0, currency: 'COP' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/greater than zero/i);
  });

  it('rejects a price above the maximum', async () => {
    const { supabase } = createMockSupabase({ profile: { is_instructor: true } });
    const result = await updateSessionAsHost(supabase, 's1', {
      is_paid: true,
      price_cents: 100000001,
      currency: 'COP',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum/i);
  });

  it('rejects an invalid currency', async () => {
    const { supabase } = createMockSupabase({ profile: { is_instructor: true } });
    const result = await updateSessionAsHost(supabase, 's1', { is_paid: true, price_cents: 1000, currency: 'EUR' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/currency/i);
  });

  it('accepts a valid free-to-paid transition from an instructor', async () => {
    const { supabase, captured } = createMockSupabase({ profile: { is_instructor: true } });
    const result = await updateSessionAsHost(supabase, 's1', {
      is_paid: true,
      price_cents: 3500000,
      currency: 'COP',
      payment_instructions: 'Nequi 300-123',
    });
    expect(result.success).toBe(true);
    expect(captured.updatePayload).toMatchObject({ is_paid: true, price_cents: 3500000, currency: 'COP' });
  });

  it('nulls price_cents on a paid-to-free transition so no stale price displays', async () => {
    const { supabase, captured } = createMockSupabase({});
    const result = await updateSessionAsHost(supabase, 's1', { is_paid: false });
    expect(result.success).toBe(true);
    expect(captured.updatePayload).toMatchObject({ is_paid: false, price_cents: null });
  });

  it('surfaces the database error message on update failure', async () => {
    const { supabase } = createMockSupabase({ updateError: { message: 'row violates check constraint' } });
    const result = await updateSessionAsHost(supabase, 's1', { sport: 'Yoga' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/check constraint/);
  });

  it('surfaces a fetch failure instead of proceeding', async () => {
    const { supabase, captured } = createMockSupabase({ session: null, sessionError: { message: 'not found' } });
    const result = await updateSessionAsHost(supabase, 's1', { sport: 'Yoga' });
    expect(result.success).toBe(false);
    expect(captured.updatePayload).toBe(null);
  });
});

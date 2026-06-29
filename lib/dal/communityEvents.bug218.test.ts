/**
 * BUG-218: DAL unit tests for community_events + community_event_rsvps.
 *
 * Covers:
 *  - createCommunityEvent: happy path, 0-row (RLS-blocked) guard, transport error
 *  - listCommunityEvents: maps rsvp counts + user_rsvpd correctly
 *  - rsvpToEvent: happy path, duplicate (23505) treated as success, transport error
 *  - cancelRsvp: happy path, error surface
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCommunityEvent, listCommunityEvents, rsvpToEvent, cancelRsvp } from './communityEvents';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type MockChain = {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

/**
 * Build a minimal supabase client mock that returns the given resolved value
 * from the final awaited call in the DAL chain.
 */
function makeInsertMock(resolvedValue: unknown): SupabaseClient {
  const chain: Partial<MockChain> = {};
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  return {
    from: () => chain,
  } as unknown as SupabaseClient;
}

function makeSelectMock(resolvedValue: unknown): SupabaseClient {
  const chain: Partial<MockChain> = {};
  chain.order = vi.fn(() => Promise.resolve(resolvedValue));
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  return {
    from: () => chain,
  } as unknown as SupabaseClient;
}

function makeDeleteMock(resolvedValue: unknown): SupabaseClient {
  const chain: Partial<MockChain> = {};
  chain.eq = vi.fn(() => chain);
  // Second eq returns the final promise
  let eqCallCount = 0;
  chain.eq = vi.fn(() => {
    eqCallCount++;
    if (eqCallCount >= 2) return Promise.resolve(resolvedValue);
    return chain;
  });
  chain.delete = vi.fn(() => chain);
  return {
    from: () => chain,
  } as unknown as SupabaseClient;
}

// ─── createCommunityEvent ─────────────────────────────────────────────────────

describe('createCommunityEvent (BUG-218)', () => {
  it('returns { success: true, data: id } on success', async () => {
    const supabase = makeInsertMock({ data: { id: 'evt-123' }, error: null });

    const result = await createCommunityEvent(supabase, {
      community_id: 'comm-1',
      created_by: 'user-1',
      title: 'Morning Run',
      event_at: '2026-07-01T07:00:00Z',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('evt-123');
  });

  it('returns failure when Supabase returns an error', async () => {
    const supabase = makeInsertMock({ data: null, error: { message: 'RLS violation' } });

    const result = await createCommunityEvent(supabase, {
      community_id: 'comm-1',
      created_by: 'user-1',
      title: 'Evening Ride',
      event_at: '2026-07-02T18:00:00Z',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('RLS violation');
  });

  it('detects 0-row RLS block: no error but data is null', async () => {
    // RLS-blocked inserts on some Supabase versions return { data: null, error: null }
    const supabase = makeInsertMock({ data: null, error: null });

    const result = await createCommunityEvent(supabase, {
      community_id: 'comm-1',
      created_by: 'user-1',
      title: 'Yoga in the Park',
      event_at: '2026-07-03T09:00:00Z',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/RLS/i);
  });

  it('handles a thrown exception without crashing', async () => {
    const supabase = {
      from: () => {
        throw new Error('network timeout');
      },
    } as unknown as SupabaseClient;

    const result = await createCommunityEvent(supabase, {
      community_id: 'comm-1',
      created_by: 'user-1',
      title: 'Crash test',
      event_at: '2026-07-04T10:00:00Z',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to create event');
  });
});

// ─── listCommunityEvents ──────────────────────────────────────────────────────

describe('listCommunityEvents (BUG-218)', () => {
  it('maps rsvp_count and user_rsvpd correctly', async () => {
    const rawRow = {
      id: 'evt-1',
      community_id: 'comm-1',
      created_by: 'user-1',
      title: 'Group Run',
      description: null,
      location: 'Parque Arvi',
      event_at: '2026-07-10T07:00:00Z',
      ends_at: null,
      created_at: '2026-06-29T00:00:00Z',
      updated_at: '2026-06-29T00:00:00Z',
      creator: { id: 'user-1', name: 'Ana', avatar_url: null },
      community_event_rsvps: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
    };
    const supabase = makeSelectMock({ data: [rawRow], error: null });

    const result = await listCommunityEvents(supabase, 'comm-1', 'user-1');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    const ev = result.data![0];
    expect(ev.rsvp_count).toBe(2);
    expect(ev.user_rsvpd).toBe(true);
  });

  it('sets user_rsvpd=false when userId is not in rsvps', async () => {
    const rawRow = {
      id: 'evt-2',
      community_id: 'comm-1',
      created_by: 'user-1',
      title: 'Swim Meet',
      description: null,
      location: null,
      event_at: '2026-07-11T08:00:00Z',
      ends_at: null,
      created_at: '2026-06-29T00:00:00Z',
      updated_at: '2026-06-29T00:00:00Z',
      creator: null,
      community_event_rsvps: [{ user_id: 'user-99' }],
    };
    const supabase = makeSelectMock({ data: [rawRow], error: null });

    const result = await listCommunityEvents(supabase, 'comm-1', 'user-1');

    expect(result.success).toBe(true);
    expect(result.data![0].user_rsvpd).toBe(false);
    expect(result.data![0].rsvp_count).toBe(1);
  });

  it('returns failure on Supabase error', async () => {
    const supabase = makeSelectMock({ data: null, error: { message: 'permission denied' } });

    const result = await listCommunityEvents(supabase, 'comm-1', 'user-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
  });
});

// ─── rsvpToEvent ─────────────────────────────────────────────────────────────

describe('rsvpToEvent (BUG-218)', () => {
  it('returns success on happy path', async () => {
    const supabase = makeInsertMock({ data: { id: 'rsvp-1' }, error: null });

    const result = await rsvpToEvent(supabase, 'evt-1', 'user-1');

    expect(result.success).toBe(true);
  });

  it('treats 23505 unique_violation as success (already RSVPd)', async () => {
    const supabase = makeInsertMock({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    const result = await rsvpToEvent(supabase, 'evt-1', 'user-1');

    expect(result.success).toBe(true);
  });

  it('surfaces other errors as failure', async () => {
    const supabase = makeInsertMock({
      data: null,
      error: { code: '42501', message: 'insufficient privilege' },
    });

    const result = await rsvpToEvent(supabase, 'evt-1', 'user-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('insufficient privilege');
  });

  it('handles 0-row RLS block: no error but no data', async () => {
    const supabase = makeInsertMock({ data: null, error: null });

    const result = await rsvpToEvent(supabase, 'evt-1', 'user-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/RLS/i);
  });
});

// ─── cancelRsvp ──────────────────────────────────────────────────────────────

describe('cancelRsvp (BUG-218)', () => {
  it('returns success when delete succeeds', async () => {
    const supabase = makeDeleteMock({ error: null });

    const result = await cancelRsvp(supabase, 'evt-1', 'user-1');

    expect(result.success).toBe(true);
  });

  it('returns failure when delete errors', async () => {
    const supabase = makeDeleteMock({ error: { message: 'Row not found' } });

    const result = await cancelRsvp(supabase, 'evt-1', 'user-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Row not found');
  });
});

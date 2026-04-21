import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { GET } from './route';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.CRON_SECRET = 'test-cron-secret';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request('http://localhost/api/cron/smart-match', { headers });
}

/**
 * Creates a chainable + thenable mock that resolves to `result` when awaited.
 * Every chain method (select, eq, in, overlaps, order, limit) returns the
 * same thenable chain so `await supabase.from(t).select().eq().in()` works.
 */
function thenableChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.overlaps = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.single = () => Promise.resolve(result);
  // upsert for smart_matches
  chain.upsert = () => ({
    select: () => ({
      single: () => Promise.resolve({ data: { id: 'match-1' }, error: null }),
    }),
  });
  // insert for notifications
  chain.insert = () => Promise.resolve({ data: null, error: null });
  // Make the chain thenable so `await chain` resolves to `result`
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);

  return chain;
}

function createSupabaseMock(tableData: Record<string, { data: unknown; error: unknown }>) {
  const supabase = {
    from: (table: string) => {
      const defaultResult = tableData[table] || { data: null, error: null };
      return thenableChain(defaultResult);
    },
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const USER_A = {
  id: 'user-a',
  name: 'Alice',
  location_lat: 6.25,
  location_lng: -75.57,
  sports: ['running', 'yoga'],
  gender: 'female',
};

const USER_B = {
  id: 'user-b',
  name: 'Bob',
  location_lat: 6.251,
  location_lng: -75.571,
  sports: ['running', 'cycling'],
  gender: 'male',
};

const PREF_A = {
  user_id: 'user-a',
  preferred_sports: ['running', 'yoga'],
  availability: [{ day: 'monday', start: '08:00', end: '10:00' }],
  gender_preference: 'any',
  max_distance_km: 10,
};

const PREF_B = {
  user_id: 'user-b',
  preferred_sports: ['running', 'cycling'],
  availability: [{ day: 'monday', start: '09:00', end: '11:00' }],
  gender_preference: 'any',
  max_distance_km: 10,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/smart-match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the cron secret is missing or wrong', async () => {
    const noHeader = await GET(makeRequest());
    expect(noHeader.status).toBe(401);
    const noHeaderBody = await noHeader.json();
    expect(noHeaderBody.error).toBe('Unauthorized');

    const wrongSecret = await GET(makeRequest('wrong-secret'));
    expect(wrongSecret.status).toBe(401);
  });

  it('returns processed: 0 when no users have preferences', async () => {
    const supabase = createSupabaseMock({
      user_training_preferences: { data: [], error: null },
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase as never);

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    const body = await res.json();
    // LR-05 changed the response shape: `{ success }` → `{ ok, route, duration_ms, ... }`.
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.matches_created).toBe(0);
  });

  it('processes matching users and creates matches', async () => {
    const supabase = createSupabaseMock({
      user_training_preferences: { data: [PREF_A, PREF_B], error: null },
      users: { data: [USER_A, USER_B], error: null },
      blocked_users: { data: [], error: null },
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase as never);

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.matches_created).toBeGreaterThan(0);
  });

  it('creates 0 matches when users have no sport overlap', async () => {
    const userC = { ...USER_A, id: 'user-c', sports: ['swimming'] };
    const userD = { ...USER_B, id: 'user-d', sports: ['tennis'] };

    const prefC = {
      user_id: 'user-c',
      preferred_sports: ['swimming'],
      availability: [{ day: 'monday', start: '08:00', end: '10:00' }],
      gender_preference: 'any',
      max_distance_km: 10,
    };
    const prefD = {
      user_id: 'user-d',
      preferred_sports: ['tennis'],
      availability: [{ day: 'monday', start: '08:00', end: '10:00' }],
      gender_preference: 'any',
      max_distance_km: 10,
    };

    // First prefs call returns both, but the overlaps call returns empty
    // because swimming and tennis don't overlap.
    let prefsCallCount = 0;
    const supabase = {
      from: (table: string) => {
        if (table === 'user_training_preferences') {
          prefsCallCount++;
          if (prefsCallCount === 1) {
            // Initial batch fetch
            return thenableChain({ data: [prefC, prefD], error: null });
          }
          // Second call: overlaps query returns empty (no sport overlap)
          return thenableChain({ data: [], error: null });
        }
        if (table === 'users') {
          return thenableChain({ data: [userC, userD], error: null });
        }
        if (table === 'blocked_users') {
          return thenableChain({ data: [], error: null });
        }
        return thenableChain({ data: null, error: null });
      },
    };

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase as never);

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.matches_created).toBe(0);
  });
});

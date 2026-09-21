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
function thenableChain(result: { data: unknown; error: unknown }, upserts: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  // Recorded and APPLIED at await time. If the mock ignored .not(), a test
  // asserting "no instructor is matched" would pass whether or not the route
  // filters -- the fixture would simply never contain one by the time it was
  // scored. Honouring the predicate is what makes those tests non-vacuous by
  // construction.
  const notFilters: Array<[string, string, unknown]> = [];

  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.overlaps = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.not = (col: string, op: string, val: unknown) => {
    notFilters.push([col, op, val]);
    return chain;
  };
  chain.single = () => Promise.resolve(result);
  // upsert for smart_matches -- payloads captured so a test can assert WHO was
  // matched, not merely how many matches happened.
  chain.upsert = (payload: unknown) => {
    upserts.push(payload);
    return {
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'match-1' }, error: null }),
      }),
    };
  };
  chain.insert = () => Promise.resolve({ data: null, error: null });

  /** `not(col, 'is', true)` is SQL `col IS NOT TRUE`: true is dropped, false
   *  and NULL/undefined are KEPT. Getting this backwards would make the tests
   *  agree with a `= false` implementation, which is the bug they exist for. */
  const applyNot = (rows: unknown) => {
    if (!Array.isArray(rows) || notFilters.length === 0) return rows;
    return rows.filter((row) =>
      notFilters.every(([col, op, val]) => {
        if (op === 'is' && val === true) return (row as Record<string, unknown>)[col] !== true;
        return true;
      })
    );
  };

  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ ...result, data: applyNot(result.data) }).then(onFulfilled, onRejected);

  return chain;
}

function createSupabaseMock(tableData: Record<string, { data: unknown; error: unknown }>, upserts: unknown[] = []) {
  const supabase = {
    from: (table: string) => {
      const defaultResult = tableData[table] || { data: null, error: null };
      return thenableChain(defaultResult, upserts);
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

/** An instructor who would score perfectly against USER_A: same spot, same
 *  sport. If the rule is not enforced they WILL be matched, which is what
 *  makes the absence assertions below meaningful. */
const INSTRUCTOR_C = {
  id: 'instructor-c',
  name: 'Carla',
  location_lat: 6.2505,
  location_lng: -75.5705,
  sports: ['running'],
  gender: 'female',
  is_instructor: true,
};

/** Most athletes have never touched the toggle, so their column is NULL. If
 *  the filter were `= false` this user would vanish from the pool. */
const USER_D_NULL_TOGGLE = {
  id: 'user-d',
  name: 'Dani',
  location_lat: 6.2502,
  location_lng: -75.5702,
  sports: ['running'],
  gender: 'male',
  is_instructor: null,
};

const PREF_C = {
  user_id: 'instructor-c',
  preferred_sports: ['running'],
  availability: [{ day: 'monday', start: '08:00', end: '10:00' }],
  gender_preference: 'any',
  max_distance_km: 10,
};

const PREF_D = {
  user_id: 'user-d',
  preferred_sports: ['running'],
  availability: [{ day: 'monday', start: '08:00', end: '10:00' }],
  gender_preference: 'any',
  max_distance_km: 10,
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

  // -------------------------------------------------------------------------
  // Instructors are never training partners.
  //
  // Every assertion here is an ABSENCE -- "the instructor is not in the
  // result" -- and an absence passes when the cron matches nobody at all. So
  // the presence arm runs FIRST and the rest depend on it. Same ordering as
  // migration 181's rehearsal, for the same reason.
  // -------------------------------------------------------------------------
  describe('instructors are never training partners', () => {
    it('PRESENCE: the pairing still produces matches between two athletes', async () => {
      const upserts: unknown[] = [];
      const supabase = createSupabaseMock(
        {
          user_training_preferences: { data: [PREF_A, PREF_B], error: null },
          users: { data: [USER_A, USER_B], error: null },
          blocked_users: { data: [], error: null },
          smart_matches: { data: [], error: null },
        },
        upserts
      );
      (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase as never);

      const body = await (await GET(makeRequest('test-cron-secret'))).json();
      expect(
        body.matches_created,
        'no matches at all, so every absence assertion below would pass vacuously'
      ).toBeGreaterThan(0);
      expect(upserts.length).toBeGreaterThan(0);
    });

    it('an instructor is never PROPOSED to an athlete', async () => {
      const upserts: unknown[] = [];
      const supabase = createSupabaseMock(
        {
          // The instructor has preferences and would score perfectly: same
          // place, same sport, overlapping availability.
          user_training_preferences: { data: [PREF_A, PREF_B, PREF_C], error: null },
          users: { data: [USER_A, USER_B, INSTRUCTOR_C], error: null },
          blocked_users: { data: [], error: null },
          smart_matches: { data: [], error: null },
        },
        upserts
      );
      (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase as never);

      const body = await (await GET(makeRequest('test-cron-secret'))).json();
      expect(body.matches_created, 'presence: matches were still made').toBeGreaterThan(0);

      const matched = JSON.stringify(upserts);
      expect(matched, 'the instructor was proposed as a training partner').not.toContain('instructor-c');
    });

    it('an instructor never RECEIVES a proposal', async () => {
      const upserts: unknown[] = [];
      const supabase = createSupabaseMock(
        {
          user_training_preferences: { data: [PREF_C, PREF_A, PREF_B], error: null },
          users: { data: [INSTRUCTOR_C, USER_A, USER_B], error: null },
          blocked_users: { data: [], error: null },
          smart_matches: { data: [], error: null },
        },
        upserts
      );
      (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase as never);

      const body = await (await GET(makeRequest('test-cron-secret'))).json();
      expect(body.matches_created, 'presence: matches were still made').toBeGreaterThan(0);

      // The subject of every upserted match must not be the instructor.
      for (const u of upserts) {
        expect(JSON.stringify(u)).not.toContain('instructor-c');
      }
    });

    /** The `= false` trap. An athlete who never touched the toggle has
     *  is_instructor NULL, and `eq(false)` is NULL for that row -- so the
     *  obvious spelling would drop most of the athlete population while
     *  looking like a stricter filter. */
    it('an athlete with is_instructor NULL is still matched', async () => {
      const upserts: unknown[] = [];
      const supabase = createSupabaseMock(
        {
          user_training_preferences: { data: [PREF_A, PREF_D], error: null },
          users: { data: [USER_A, USER_D_NULL_TOGGLE], error: null },
          blocked_users: { data: [], error: null },
          smart_matches: { data: [], error: null },
        },
        upserts
      );
      (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase as never);

      const body = await (await GET(makeRequest('test-cron-secret'))).json();
      expect(body.matches_created).toBeGreaterThan(0);
      expect(
        JSON.stringify(upserts),
        'the NULL-toggle athlete was dropped, which is what eq(false) would do'
      ).toContain('user-d');
    });
  });
});

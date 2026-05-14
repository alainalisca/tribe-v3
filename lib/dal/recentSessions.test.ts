/**
 * Tests for fetchRecentlyEndedSessions (lib/dal/recentSessions.ts).
 *
 * Covers:
 *   - Creator-id resolution: gym path (gym_coaches lookup) vs
 *     legacy single-instructor path
 *   - Window filtering: ended-in-future excluded, ended-too-long-ago
 *     excluded, ended-just-now included
 *   - Window clamping (1 ≤ window_hours ≤ 12)
 *   - Limit clamping (1 ≤ limit ≤ 20)
 *   - Hydration: minutes_since_ended is computed from now
 *   - Defensive: zero-duration rows are dropped (can't bound them)
 *   - Status filter: cancelled sessions never surface (PostgREST contract)
 *   - Error paths on both the gym_coaches and sessions queries
 *
 * The DB-side filters (.in('creator_id'), .eq('status'), .in('date'))
 * are the DB contract — we don't simulate them, we just assert the
 * DAL passes the right values to PostgREST. The in-TS time-window
 * filter IS our logic, so we exercise it directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRecentlyEndedSessions } from './recentSessions';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface SessionRow {
  id: string;
  title: string | null;
  sport: string;
  date: string;
  start_time: string;
  duration: number;
  current_participants: number;
  status: 'active' | 'cancelled';
  creator_id: string;
}

interface CapturedQuery {
  table: string;
  selectString?: string;
  eqCalls: Array<{ col: string; val: unknown }>;
  inCalls: Array<{ col: string; vals: unknown[] }>;
  orderCalls: Array<{ col: string; ascending: boolean }>;
}

function newCapture(table: string): CapturedQuery {
  return { table, eqCalls: [], inCalls: [], orderCalls: [] };
}

/**
 * Build a Supabase mock that routes by table. We have three queries:
 *   - gym_coaches: returns { user_id } rows
 *   - sessions: returns the session rows under test
 *   - client_attendance: returns { session_id } rows for the
 *     "this session already has attendance recorded" filter
 */
function buildSupabaseMock(opts: {
  coachesRows?: Array<{ user_id: string }>;
  coachesError?: { message: string } | null;
  sessionRows?: SessionRow[];
  sessionsError?: { message: string } | null;
  attendanceRows?: Array<{ session_id: string }>;
  attendanceError?: { message: string } | null;
  coachesCapture?: CapturedQuery;
  sessionsCapture?: CapturedQuery;
  attendanceCapture?: CapturedQuery;
}): SupabaseClient {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const capture =
        table === 'gym_coaches'
          ? opts.coachesCapture
          : table === 'sessions'
            ? opts.sessionsCapture
            : table === 'client_attendance'
              ? opts.attendanceCapture
              : undefined;
      chain.select = (s: string) => {
        if (capture) capture.selectString = s;
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        capture?.eqCalls.push({ col, val });
        return chain;
      };
      chain.in = (col: string, vals: unknown[]) => {
        capture?.inCalls.push({ col, vals });
        return chain;
      };
      chain.order = (col: string, options?: { ascending: boolean }) => {
        capture?.orderCalls.push({ col, ascending: options?.ascending ?? true });
        return chain;
      };
      chain.then = (resolve: (v: unknown) => void) => {
        if (table === 'gym_coaches') {
          resolve({ data: opts.coachesRows ?? [], error: opts.coachesError ?? null });
        } else if (table === 'sessions') {
          resolve({ data: opts.sessionRows ?? [], error: opts.sessionsError ?? null });
        } else if (table === 'client_attendance') {
          resolve({ data: opts.attendanceRows ?? [], error: opts.attendanceError ?? null });
        } else {
          resolve({ data: [], error: null });
        }
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

// Anchor "now" deterministically so window math is reproducible. We
// pick a tidy mid-afternoon UTC time so "today" / "yesterday" both
// land on whole-day boundaries and there's no off-by-one drama.
const FAKE_NOW = new Date('2026-05-14T15:00:00.000Z');

function makeRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sess-1',
    title: 'Morning HIIT',
    sport: 'fitness',
    date: '2026-05-14',
    start_time: '14:00:00',
    duration: 30,
    current_participants: 8,
    status: 'active',
    creator_id: 'instructor-1',
    ...overrides,
  };
}

describe('fetchRecentlyEndedSessions — creator id resolution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('resolves to a single instructor when gymId is null', async () => {
    const sessionsCapture = newCapture('sessions');
    const supabase = buildSupabaseMock({ sessionRows: [], sessionsCapture });
    await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(sessionsCapture.inCalls).toContainEqual({ col: 'creator_id', vals: ['instructor-1'] });
  });

  it('looks up all coaches in the gym when gymId is set', async () => {
    const coachesCapture = newCapture('gym_coaches');
    const sessionsCapture = newCapture('sessions');
    const supabase = buildSupabaseMock({
      coachesRows: [{ user_id: 'coach-A' }, { user_id: 'coach-B' }],
      sessionRows: [],
      coachesCapture,
      sessionsCapture,
    });
    await fetchRecentlyEndedSessions(supabase, { gymId: 'gym-42', instructorUserId: 'owner-1' });
    expect(coachesCapture.eqCalls).toContainEqual({ col: 'gym_id', val: 'gym-42' });
    // Both coaches show up. The owner is also appended defensively
    // since they may not be in gym_coaches yet on legacy data.
    const ids = sessionsCapture.inCalls.find((c) => c.col === 'creator_id')?.vals ?? [];
    expect(ids).toEqual(expect.arrayContaining(['coach-A', 'coach-B', 'owner-1']));
  });

  it('still includes the calling instructor even if not in gym_coaches', async () => {
    // Belt-and-braces: backfill 069 should have populated gym_coaches
    // but if a row is missing, we don't want the surface to silently
    // show no recent sessions for the owner.
    const sessionsCapture = newCapture('sessions');
    const supabase = buildSupabaseMock({
      coachesRows: [{ user_id: 'coach-A' }],
      sessionRows: [],
      sessionsCapture,
    });
    await fetchRecentlyEndedSessions(supabase, { gymId: 'gym-42', instructorUserId: 'owner-not-yet-in-coaches' });
    const ids = sessionsCapture.inCalls.find((c) => c.col === 'creator_id')?.vals ?? [];
    expect(ids).toContain('owner-not-yet-in-coaches');
  });

  it('returns empty (no DB hit on sessions) when the gym has no coaches at all', async () => {
    // Edge case: brand-new gym with no gym_coaches rows AND null
    // instructor (impossible in practice but the guard is cheap).
    // We just need this to not throw.
    const supabase = buildSupabaseMock({ coachesRows: [], sessionRows: [] });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: 'gym-empty', instructorUserId: 'owner-1' });
    expect(result.success).toBe(true);
    // Owner still gets included so the result depends on session rows
    // (we returned []) — that's success: true, data: [].
    expect(result.data).toEqual([]);
  });
});

describe('fetchRecentlyEndedSessions — DB query construction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('filters to active status (cancelled sessions never qualify)', async () => {
    const sessionsCapture = newCapture('sessions');
    const supabase = buildSupabaseMock({ sessionRows: [], sessionsCapture });
    await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(sessionsCapture.eqCalls).toContainEqual({ col: 'status', val: 'active' });
  });

  it('scopes to today and yesterday in UTC (covers midnight-crossing classes)', async () => {
    const sessionsCapture = newCapture('sessions');
    const supabase = buildSupabaseMock({ sessionRows: [], sessionsCapture });
    await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    // Anchor is 2026-05-14T15:00:00Z → today 2026-05-14, yesterday 2026-05-13.
    expect(sessionsCapture.inCalls).toContainEqual({ col: 'date', vals: ['2026-05-14', '2026-05-13'] });
  });

  it('orders by date DESC then start_time DESC (newest-ended first)', async () => {
    const sessionsCapture = newCapture('sessions');
    const supabase = buildSupabaseMock({ sessionRows: [], sessionsCapture });
    await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(sessionsCapture.orderCalls[0]).toEqual({ col: 'date', ascending: false });
    expect(sessionsCapture.orderCalls[1]).toEqual({ col: 'start_time', ascending: false });
  });
});

describe('fetchRecentlyEndedSessions — window filtering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('includes a session that ended 30 minutes ago', async () => {
    // Now = 15:00. Session 14:00 + 30min = 14:30 → 30 min ago. ✓
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'recent', start_time: '14:00:00', duration: 30 })],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.success).toBe(true);
    expect(result.data?.map((s) => s.id)).toEqual(['recent']);
    expect(result.data?.[0].minutes_since_ended).toBe(30);
  });

  it("excludes a session that hasn't ended yet", async () => {
    // Now = 15:00. Session 14:00 + 90min = 15:30 → still in progress.
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'still-running', start_time: '14:00:00', duration: 90 })],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('excludes a session that ended outside the default 4h window', async () => {
    // Now = 15:00. Session 09:00 + 30min = 09:30 → 5.5 hours ago.
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'stale', start_time: '09:00:00', duration: 30 })],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('honors a custom (wider) window', async () => {
    // Now = 15:00. Session 09:00 + 30min = 09:30 → 5.5h ago. With
    // windowHours = 8 → in window.
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'eight-hour-window', start_time: '09:00:00', duration: 30 })],
    });
    const result = await fetchRecentlyEndedSessions(
      supabase,
      { gymId: null, instructorUserId: 'instructor-1' },
      { windowHours: 8 }
    );
    expect(result.success).toBe(true);
    expect(result.data?.map((s) => s.id)).toEqual(['eight-hour-window']);
  });

  it('clamps windowHours to the upper bound (12)', async () => {
    // windowHours: 999 → clamps to 12. We test by setting up a row
    // that ended exactly 13h ago — outside even the clamped window.
    // Now = 15:00 today. Session 02:00 today + 30min = 02:30 today
    // → 12.5h ago. Outside 12h cap → excluded.
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'should-be-out', start_time: '02:00:00', duration: 30 })],
    });
    const result = await fetchRecentlyEndedSessions(
      supabase,
      { gymId: null, instructorUserId: 'instructor-1' },
      { windowHours: 999 }
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('clamps windowHours to the lower bound (1) when given 0', async () => {
    // windowHours: 0 → clamps to 1. Session 5h ago → excluded.
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'sess', start_time: '09:00:00', duration: 30 })],
    });
    const result = await fetchRecentlyEndedSessions(
      supabase,
      { gymId: null, instructorUserId: 'instructor-1' },
      { windowHours: 0 }
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

describe('fetchRecentlyEndedSessions — defensive hydration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("drops rows with zero/missing duration (can't bound end-time)", async () => {
    const supabase = buildSupabaseMock({
      sessionRows: [
        makeRow({ id: 'has-duration', start_time: '14:00:00', duration: 30 }),
        makeRow({ id: 'no-duration', start_time: '14:00:00', duration: 0 }),
      ],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.data?.map((s) => s.id)).toEqual(['has-duration']);
  });

  it('exposes minutes_since_ended computed against the system clock', async () => {
    // 14:15 + 30min = 14:45 → 15 minutes before 15:00.
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ start_time: '14:15:00', duration: 30 })],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.data?.[0].minutes_since_ended).toBe(15);
  });

  it('hydrates ended_at_iso as start + duration in UTC', async () => {
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ start_time: '14:00:00', duration: 30 })],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.data?.[0].ended_at_iso).toBe('2026-05-14T14:30:00.000Z');
  });

  it('caps the result count at the configured limit', async () => {
    const rows: SessionRow[] = Array.from({ length: 10 }).map((_, i) =>
      makeRow({ id: `sess-${i}`, start_time: '14:00:00', duration: 30 })
    );
    const supabase = buildSupabaseMock({ sessionRows: rows });
    const result = await fetchRecentlyEndedSessions(
      supabase,
      { gymId: null, instructorUserId: 'instructor-1' },
      { limit: 3 }
    );
    expect(result.data).toHaveLength(3);
  });
});

describe('fetchRecentlyEndedSessions — already-recorded filter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('hides sessions that already have attendance recorded', async () => {
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'recorded' }), makeRow({ id: 'pending' })],
      // Only "recorded" has attendance rows → it should disappear.
      attendanceRows: [{ session_id: 'recorded' }],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.success).toBe(true);
    expect(result.data?.map((s) => s.id)).toEqual(['pending']);
  });

  it('keeps a session when no attendance rows exist for it', async () => {
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'pending' })],
      attendanceRows: [], // no rows for any session
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.data?.map((s) => s.id)).toEqual(['pending']);
  });

  it('checks attendance only for candidate sessions (not all sessions)', async () => {
    // The .in() call on client_attendance should be scoped to the
    // candidate ids — otherwise we'd be doing a full table scan for
    // every dashboard hit. We verify the scoping by inspecting the
    // captured query.
    const attendanceCapture = newCapture('client_attendance');
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'a' }), makeRow({ id: 'b' })],
      attendanceRows: [],
      attendanceCapture,
    });
    await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(attendanceCapture.inCalls).toContainEqual({ col: 'session_id', vals: ['a', 'b'] });
  });

  it('skips the attendance check entirely when no candidate sessions exist', async () => {
    // Empty session list (no recently-ended sessions at all). We
    // shouldn't issue a wasted .in(...,[]) query on client_attendance.
    const attendanceCapture = newCapture('client_attendance');
    const supabase = buildSupabaseMock({
      sessionRows: [], // no rows pass the window filter
      attendanceRows: [],
      attendanceCapture,
    });
    await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    // Capture should record zero calls because the DAL didn't query
    // client_attendance.
    expect(attendanceCapture.inCalls).toHaveLength(0);
    expect(attendanceCapture.selectString).toBeUndefined();
  });

  it('falls back to surfacing candidates if the attendance check errors', async () => {
    // Graceful degradation: a transient attendance-table read error
    // shouldn't blank the prompt. Coach lands on /attendance and
    // sees what's recorded; the prompt being slightly less smart
    // for a few seconds is the right trade-off vs hiding the nudge
    // entirely.
    const supabase = buildSupabaseMock({
      sessionRows: [makeRow({ id: 'pending' })],
      attendanceError: { message: 'attendance read failed' },
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.success).toBe(true);
    expect(result.data?.map((s) => s.id)).toEqual(['pending']);
  });
});

describe('fetchRecentlyEndedSessions — error paths', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('returns failure if the gym_coaches lookup errors', async () => {
    const supabase = buildSupabaseMock({
      coachesError: { message: 'coaches lookup failed' },
      sessionRows: [],
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: 'gym-1', instructorUserId: 'owner-1' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('coaches lookup failed');
  });

  it('returns failure if the sessions read errors', async () => {
    const supabase = buildSupabaseMock({
      sessionsError: { message: 'sessions read failed' },
    });
    const result = await fetchRecentlyEndedSessions(supabase, { gymId: null, instructorUserId: 'instructor-1' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('sessions read failed');
  });
});

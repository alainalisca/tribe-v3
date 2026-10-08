/**
 * GET /api/admin/data?tab=origen (T-GROW1 part F).
 *
 * TWO THINGS, and the second is the one worth the file.
 *
 * THE GATE. admin_attribution_summary returns every lead, contact and attendance
 * count in the app across every partner. requireApiAdmin() is the only thing
 * between that and any caller, and migration 213's grant to service_role alone
 * is what makes this route the ONLY way to reach it. A gate that stopped working
 * would not break the panel -- Al still sees his numbers -- so nothing about the
 * product would look wrong. The assertion that matters is that the read is never
 * REACHED, because a 403 returned after the query ran has already loaded every
 * partner's numbers into a process that throws them away.
 *
 * THE WINDOW. The period is a query string, and it decides which rows are
 * counted. A malformed one must not blank the screen and must not silently widen
 * the window: "all time" and "30 days" are different answers to the question Al
 * is about to put in front of a gym. And the instant is computed SERVER side from
 * a closed set, never taken from the caller -- a client-supplied `since` would be
 * a caller-controlled predicate on a cross-partner aggregate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/adminApi', () => ({ requireApiAdmin: vi.fn() }));
vi.mock('@/lib/dal/admin', () => ({
  fetchAdminStatsRaw: vi.fn(),
  fetchAdminUsersWithCounts: vi.fn(),
  fetchAdminReports: vi.fn(),
  fetchAdminFeedback: vi.fn(),
  fetchAdminBugs: vi.fn(),
  fetchAdminMessages: vi.fn(),
  ADMIN_USER_FILTERS: ['all'],
  ADMIN_USER_SORTS: ['recent'],
}));
vi.mock('@/lib/dal/adminLeads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dal/adminLeads')>('@/lib/dal/adminLeads');
  return { ...actual, fetchAdminLeads: vi.fn() };
});
vi.mock('@/lib/dal/attributionSummary', () => ({ fetchAttributionSummary: vi.fn() }));

import { GET } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { fetchAttributionSummary } from '@/lib/dal/attributionSummary';

const SERVICE = { from: vi.fn() } as never;
const NOW = Date.parse('2026-10-08T12:00:00.000Z');

function request(qs: string): NextRequest {
  return new NextRequest(`https://tribe-v3.vercel.app/api/admin/data?${qs}`);
}

function since(): string | null {
  return vi.mocked(fetchAttributionSummary).mock.calls[0][1];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: SERVICE } as never);
  vi.mocked(fetchAttributionSummary).mockResolvedValue({ success: true, data: [] });
});

describe('GET /api/admin/data?tab=origen', () => {
  it('returns the summary rows for an admin', async () => {
    const rows = [
      {
        src: 'runclub',
        code: 'RC-01',
        utm_campaign: null,
        attr_ref: null,
        visits: 9,
        leads: 2,
        contacted: 1,
        attended: 1,
      },
    ];
    vi.mocked(fetchAttributionSummary).mockResolvedValue({ success: true, data: rows });
    const res = await GET(request('tab=origen&days=30'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows });
  });

  it('NEVER REACHES the read when the caller is not an admin', async () => {
    const forbidden = new Response(null, { status: 403 });
    vi.mocked(requireApiAdmin).mockResolvedValue({ ok: false, response: forbidden } as never);
    const res = await GET(request('tab=origen&days=30'));
    expect(res.status).toBe(403);
    // Not merely refused: not reached. A 403 after the query ran has already
    // loaded every partner's numbers.
    expect(fetchAttributionSummary).not.toHaveBeenCalled();
  });

  it('computes the window server side from the range, not from the caller', async () => {
    await GET(request('tab=origen&days=7'));
    expect(since()).toBe('2026-10-01T12:00:00.000Z');
  });

  it('accepts all four ranges and only those', async () => {
    const cases: Array<[string, string | null]> = [
      ['7', '2026-10-01T12:00:00.000Z'],
      ['30', '2026-09-08T12:00:00.000Z'],
      ['90', '2026-07-10T12:00:00.000Z'],
      ['all', null],
    ];
    for (const [days, expected] of cases) {
      vi.clearAllMocks();
      vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: SERVICE } as never);
      vi.mocked(fetchAttributionSummary).mockResolvedValue({ success: true, data: [] });
      await GET(request(`tab=origen&days=${days}`));
      expect(since(), `days=${days}`).toBe(expected);
    }
  });

  it('falls back to 30 days on a malformed range rather than blanking or widening', async () => {
    // Widening is the dangerous direction: silently answering "all time" when 30
    // was asked for puts a bigger number in front of a gym than the question
    // deserved. Blanking is merely useless.
    // '7.5' and '7abc' are here because Number.parseInt accepted both as 7,
    // which this arm caught; 'constructor' because `in` on an object literal
    // walks the prototype chain and would have admitted it.
    for (const days of ['', 'x', '0', '-7', '365', '7.5', '7abc', ' 7', '0x7', 'ALL', 'null', 'constructor']) {
      vi.clearAllMocks();
      vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: SERVICE } as never);
      vi.mocked(fetchAttributionSummary).mockResolvedValue({ success: true, data: [] });
      await GET(request(`tab=origen&days=${days}`));
      expect(since(), `days=${days}`).toBe('2026-09-08T12:00:00.000Z');
    }
  });

  it('falls back to 30 days when the range is absent entirely', async () => {
    await GET(request('tab=origen'));
    expect(since()).toBe('2026-09-08T12:00:00.000Z');
  });

  it('ignores a caller-supplied since', async () => {
    // There is no `since` parameter and there must not be: it would be a
    // caller-controlled predicate on a cross-partner aggregate.
    await GET(request('tab=origen&days=7&since=1970-01-01T00:00:00.000Z'));
    expect(since()).toBe('2026-10-01T12:00:00.000Z');
  });

  it('answers 500 without leaking the DAL error when the read fails', async () => {
    vi.mocked(fetchAttributionSummary).mockResolvedValue({ success: false, error: 'permission denied for function' });
    const res = await GET(request('tab=origen&days=30'));
    expect(res.status).toBe(500);
    const body = await res.json();
    // The reason is logged, never returned: a Postgres error names objects and
    // roles, and this response is readable by whoever got through the gate.
    expect(JSON.stringify(body)).not.toContain('permission denied');
  });
});

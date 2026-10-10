/**
 * GET /api/admin/data?tab=referidos (T-GROW2 C).
 *
 * The read handles every referred person's contact fields (for the self-
 * referral guard), so requireApiAdmin() is the whole gate, and the window must
 * be the SAME closed-set range the origen tab parses (one helper, both cases).
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
vi.mock('@/lib/dal/referralSummary', () => ({ fetchReferralSummary: vi.fn() }));

import { GET } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { fetchReferralSummary } from '@/lib/dal/referralSummary';
import { fetchAttributionSummary } from '@/lib/dal/attributionSummary';

const SERVICE = { from: vi.fn() } as never;
const NOW = Date.parse('2026-10-08T12:00:00.000Z');

function request(qs: string): NextRequest {
  return new NextRequest(`https://tribe-v3.vercel.app/api/admin/data?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: SERVICE } as never);
  vi.mocked(fetchReferralSummary).mockResolvedValue({ success: true, data: [] });
  vi.mocked(fetchAttributionSummary).mockResolvedValue({ success: true, data: [] });
});

describe('GET /api/admin/data?tab=referidos', () => {
  it('returns the referral rows for an admin, read with the service client', async () => {
    const rows = [{ code: 'KQ7M2Z', kind: 'lead', referrer: 'Ana', leads: 1, attended: 1, signups: 0, selfExcluded: 0 }];
    vi.mocked(fetchReferralSummary).mockResolvedValue({ success: true, data: rows as never });
    const res = await GET(request('tab=referidos&days=30'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows });
    expect(vi.mocked(fetchReferralSummary).mock.calls[0][0]).toBe(SERVICE);
  });

  it('NEVER REACHES the read when the caller is not an admin', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    const res = await GET(request('tab=referidos&days=30'));
    expect(res.status).toBe(403);
    expect(fetchReferralSummary).not.toHaveBeenCalled();
  });

  it('uses the same window as origen for the same days value', async () => {
    for (const days of ['7', '30', '90', 'all', 'constructor', '7.5']) {
      vi.clearAllMocks();
      vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: SERVICE } as never);
      vi.mocked(fetchReferralSummary).mockResolvedValue({ success: true, data: [] });
      vi.mocked(fetchAttributionSummary).mockResolvedValue({ success: true, data: [] });
      await GET(request(`tab=referidos&days=${days}`));
      await GET(request(`tab=origen&days=${days}`));
      expect(vi.mocked(fetchReferralSummary).mock.calls[0][1], `days=${days}`).toBe(
        vi.mocked(fetchAttributionSummary).mock.calls[0][1]
      );
    }
  });

  it('a failed read is a 500, not an empty table that reads as "nobody referred anyone"', async () => {
    vi.mocked(fetchReferralSummary).mockResolvedValue({ success: false, error: 'db' });
    const res = await GET(request('tab=referidos&days=30'));
    expect(res.status).toBe(500);
  });
});

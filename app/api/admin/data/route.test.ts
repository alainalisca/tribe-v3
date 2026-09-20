/**
 * GET /api/admin/data?tab=leads (T-LEAD2 part B).
 *
 * TWO THINGS ONLY, and both are the kind that fail silently.
 *
 * THE GATE. This route reads pass_leads and public.users under service role,
 * which is every lead's phone number and email plus every account's address.
 * requireApiAdmin() is the only thing between that and any caller. A gate that
 * stops working does not break the admin panel -- Al still sees his leads -- so
 * nothing about the product would look wrong. The assertion that matters is
 * that the read is not merely refused but NEVER REACHED: a 403 returned after
 * the query ran has already loaded the rows into a process that then throws
 * them away.
 *
 * THE OFFSET. Page two is a query string. A malformed one must land on page
 * one rather than blanking the list, a negative one must not run backwards off
 * the start, and "all" is a sentinel that must never be handed to the database
 * as a partner id. None of these produce an error; they produce a wrong page,
 * which reads as "there are no more leads".
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
  return {
    ...actual,
    fetchAdminLeads: vi.fn(),
  };
});

import { GET } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { fetchAdminLeads, ADMIN_LEADS_ALL_PARTNERS, ADMIN_LEADS_PAGE_SIZE } from '@/lib/dal/adminLeads';
import { NextResponse } from 'next/server';

const PAGE = {
  rows: [],
  total: 0,
  tiles: { last7: 0, uncontacted: 0, total: 0 },
  partners: [],
};

/** The service client requireApiAdmin hands back. Never used by these tests. */
const SERVICE = { from: vi.fn() } as never;

function admin() {
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: SERVICE, userId: 'admin-1' } as never);
}

function notAdmin() {
  vi.mocked(requireApiAdmin).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
  } as never);
}

function call(query: string): Promise<Response> {
  return GET(new NextRequest(`https://tribe.test/api/admin/data?${query}`));
}

/** The query fetchAdminLeads was asked for, or null if it was never called. */
function asked(): { partnerId?: string; offset?: number } | null {
  const mock = vi.mocked(fetchAdminLeads);
  if (mock.mock.calls.length === 0) return null;
  return mock.mock.calls[0][1] ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAdminLeads).mockResolvedValue({ success: true, data: PAGE });
});

describe('the gate', () => {
  it('refuses a caller who is not an admin', async () => {
    notAdmin();
    const res = await call('tab=leads');
    expect(res.status).toBe(403);
  });

  it('never reaches the leads read for a non-admin', async () => {
    notAdmin();
    await call('tab=leads&partner=all&offset=0');

    // The point of the gate is that the rows are never loaded, not that they
    // are loaded and withheld. Asserting on the 403 alone would pass against a
    // route that queried first and checked afterwards.
    expect(fetchAdminLeads).not.toHaveBeenCalled();
  });

  it('serves an admin', async () => {
    admin();
    const res = await call('tab=leads');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: PAGE });
  });

  it('rejects a tab it does not know rather than guessing one', async () => {
    admin();
    const res = await call('tab=pass_leads');
    expect(res.status).toBe(400);
    expect(fetchAdminLeads).not.toHaveBeenCalled();
  });
});

describe('the partner filter', () => {
  it('passes a partner id through', async () => {
    admin();
    await call('tab=leads&partner=p-bullbox');
    expect(asked()?.partnerId).toBe('p-bullbox');
  });

  it('keeps "all" as the sentinel and never sends it as an id', async () => {
    admin();
    await call(`tab=leads&partner=${ADMIN_LEADS_ALL_PARTNERS}`);
    expect(asked()?.partnerId).toBe(ADMIN_LEADS_ALL_PARTNERS);
  });

  it('treats a missing partner as all partners', async () => {
    admin();
    await call('tab=leads');
    expect(asked()?.partnerId).toBe(ADMIN_LEADS_ALL_PARTNERS);
  });

  it('treats an empty partner as all partners rather than as an id of nothing', async () => {
    admin();
    await call('tab=leads&partner=');
    // partner_id = '' is not a uuid; PostgREST answers 22P02 and the admin
    // sees a load error on a query string that merely had a stray equals sign.
    expect(asked()?.partnerId).toBe(ADMIN_LEADS_ALL_PARTNERS);
  });
});

describe('the offset', () => {
  it('starts at the first page when no offset is given', async () => {
    admin();
    await call('tab=leads');
    expect(asked()?.offset).toBe(0);
  });

  it('passes a page boundary through unchanged', async () => {
    admin();
    await call(`tab=leads&offset=${ADMIN_LEADS_PAGE_SIZE}`);
    expect(asked()?.offset).toBe(ADMIN_LEADS_PAGE_SIZE);
  });

  it('snaps an off-boundary offset down to the page it falls in', async () => {
    admin();
    await call('tab=leads&offset=73');
    // 73 is inside page two. Reading rows 73 to 122 would show a window
    // straddling two pages while the pager says "51-100 de N".
    expect(asked()?.offset).toBe(ADMIN_LEADS_PAGE_SIZE);
  });

  it('falls back to the first page for a value that is not a number', async () => {
    admin();
    await call('tab=leads&offset=banana');
    expect(asked()?.offset).toBe(0);
  });

  it('falls back to the first page for a negative offset', async () => {
    admin();
    await call('tab=leads&offset=-50');
    // range(-50, -1) is not an error in PostgREST, it is a different window.
    expect(asked()?.offset).toBe(0);
  });

  it('falls back to the first page for an empty offset', async () => {
    admin();
    await call('tab=leads&offset=');
    expect(asked()?.offset).toBe(0);
  });
});

describe('a failed read', () => {
  it('reports the failure rather than answering with an empty page', async () => {
    admin();
    vi.mocked(fetchAdminLeads).mockResolvedValue({ success: false, error: 'permission denied' });

    const res = await call('tab=leads');
    expect(res.status).toBe(500);

    // The raw database message never reaches the browser; the admin gets a
    // load error and the reason goes to the log.
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('load_failed');
    expect(body.error).not.toContain('permission denied');
  });
});

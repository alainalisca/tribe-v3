import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { logError } from '@/lib/logger';
import {
  fetchAdminStatsRaw,
  fetchAdminUsersWithCounts,
  fetchAdminReports,
  fetchAdminFeedback,
  fetchAdminBugs,
  fetchAdminMessages,
  ADMIN_USER_FILTERS,
  ADMIN_USER_SORTS,
  type AdminUserFilter,
  type AdminUserSort,
} from '@/lib/dal/admin';
import { fetchAdminLeads, ADMIN_LEADS_ALL_PARTNERS, ADMIN_LEADS_PAGE_SIZE } from '@/lib/dal/adminLeads';

/**
 * @description Service-role admin list data (users, reports, feedback, bugs,
 *   messages). These reads include user emails and is_admin, which the browser
 *   client can no longer select (migrations 113 + the T-SEC5 email revoke), so
 *   they run here under service-role AFTER an is_app_admin() gate.
 * @method GET
 * @auth Admin only. requireApiAdmin() verifies is_app_admin() and fails closed
 *   (403) on missing auth / non-admin / error BEFORE any data is read.
 * @query tab - one of: stats | users | reports | feedback | bugs | messages | leads
 * @query partner - leads only: a featured_partners id, or "all"
 * @query offset - leads only: row offset, 50 per page
 */
export async function GET(request: NextRequest) {
  // GATE FIRST — nothing is read until the caller is a confirmed admin.
  const gate = await requireApiAdmin();
  if (!gate.ok) return gate.response;

  const tab = request.nextUrl.searchParams.get('tab');
  const { service } = gate;

  try {
    let result;
    switch (tab) {
      case 'stats':
        // RLS-H3: this reads ALL participants' user_ids (cross-user aggregate for
        // the dashboard). The narrow sp_select_own policy would silently return
        // only the admin's own rows on a browser client, so it runs here under
        // service-role behind the is_app_admin() gate.
        result = await fetchAdminStatsRaw(service);
        break;
      case 'users': {
        // ADMIN-01: search/filter/sort are applied in the DAL query, not on the
        // returned page. Unknown values fall back to the defaults rather than
        // erroring -- a bad querystring should not blank the admin's list.
        const sp = request.nextUrl.searchParams;
        const filter = sp.get('filter');
        const sort = sp.get('sort');
        result = await fetchAdminUsersWithCounts(service, {
          search: sp.get('search') ?? '',
          filter: (ADMIN_USER_FILTERS as readonly string[]).includes(filter ?? '')
            ? (filter as AdminUserFilter)
            : 'all',
          sort: (ADMIN_USER_SORTS as readonly string[]).includes(sort ?? '') ? (sort as AdminUserSort) : 'newest',
        });
        break;
      }
      case 'reports':
        result = await fetchAdminReports(service);
        break;
      case 'feedback':
        result = await fetchAdminFeedback(service);
        break;
      case 'bugs':
        result = await fetchAdminBugs(service);
        break;
      case 'messages':
        result = await fetchAdminMessages(service);
        break;
      case 'leads': {
        // T-LEAD2. pass_leads is readable by an admin's own browser client
        // under migration 173's policy, but the Cuenta column matches against
        // public.users.email, which T-SEC5 revoked from every client role. That
        // one column is the whole reason this read is here rather than in the
        // page, and it is why the partner dashboard does NOT come through this
        // route -- see lib/dal/adminLeads.ts.
        const sp = request.nextUrl.searchParams;
        const partner = sp.get('partner');
        // A malformed offset falls back to the first page rather than erroring:
        // a bad querystring should not blank the admin's list, the same rule
        // the users tab applies to its filter and sort.
        const rawOffset = Number.parseInt(sp.get('offset') ?? '', 10);
        const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
        result = await fetchAdminLeads(service, {
          partnerId: partner && partner !== ADMIN_LEADS_ALL_PARTNERS ? partner : ADMIN_LEADS_ALL_PARTNERS,
          offset: Math.floor(offset / ADMIN_LEADS_PAGE_SIZE) * ADMIN_LEADS_PAGE_SIZE,
        });
        break;
      }
      default:
        return NextResponse.json({ error: 'unknown_tab' }, { status: 400 });
    }

    if (!result.success) {
      logError(result.error, { action: 'adminData', tab });
      return NextResponse.json({ error: 'load_failed' }, { status: 500 });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    logError(error, { action: 'adminData', tab });
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

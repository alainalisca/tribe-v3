import { NextResponse } from 'next/server';
import { isValidCronAuth } from '@/lib/auth/cron';
import { log, logError } from '@/lib/logger';
import {
  childSessionExists,
  createChildSession,
  RECURRING_PARENT_COLUMNS,
  type RecurringParentSession,
} from '@/lib/dal/sessions';
import { enrollSubscribersInChildSession } from '@/lib/dal/sessionSubscriptions';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { computeRecurrenceDates } from '@/lib/recurrence';

/** Number of days ahead to generate child sessions */
const LOOKAHEAD_DAYS = 7;

/**
 * @description Generates child session instances for active recurring parent sessions.
 *   Looks 7 days ahead and creates any missing child sessions. Idempotent — safe to run multiple times.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, parentsProcessed: number, childrenCreated: number, errors: number }}
 */
export async function GET(request: Request) {
  // LR-05: structured run logging.
  const route = 'cron:recurring-sessions';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    const authHeader = request.headers.get('authorization');
    if (!isValidCronAuth(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Service-role for the READ as well as the writes below. A cron carries no
    // cookie, so the cookie client runs as `anon` — and migration 137 revoked
    // anon's SELECT on sessions.payment_instructions, which select('*') expands
    // to include. The result was a 42501 that failed the whole job. The writes
    // at the bottom of this file were already moved to service-role for the
    // same class of reason; the read was left behind.
    const serviceClient = getServiceRoleClient();

    // 1. Fetch all active recurring parent sessions.
    // Explicit columns, never select('*'): the wildcard is what turned one
    // revoked column into a total failure, and it will do so again the next
    // time a column is locked down. RECURRING_PARENT_COLUMNS is kept in step
    // with RecurringParentSession, which createChildSession consumes, so a new
    // field cannot be read without being selected.
    const { data: parents, error: fetchError } = await serviceClient
      .from('sessions')
      .select(RECURRING_PARENT_COLUMNS)
      .eq('is_recurring', true)
      .eq('status', 'active')
      .is('recurring_parent_id', null);

    if (fetchError) {
      logError(fetchError, { route: '/api/cron/recurring-sessions', action: 'fetch_parents' });
      return NextResponse.json({ error: 'Failed to fetch recurring parents' }, { status: 500 });
    }

    const parentSessions = (parents || []) as unknown as RecurringParentSession[];
    let childrenCreated = 0;
    let subscribersEnrolled = 0;
    let errorCount = 0;

    // NOTE: serviceClient (created above) is used for every write too. The
    // sessions INSERT policy is `auth.uid() = creator_id`, and a cron has no
    // auth user, so anon inserts were silently RLS-blocked — which is why 0
    // recurring children had ever been created before that was fixed.

    // 2. For each parent, compute upcoming dates and create missing children
    for (const parent of parentSessions) {
      const nextDates = computeRecurrenceDates(parent, new Date(), LOOKAHEAD_DAYS);

      for (const date of nextDates) {
        try {
          // Check if child already exists for this date (idempotency)
          const existsResult = await childSessionExists(serviceClient, parent.id, date);
          if (!existsResult.success) {
            logError(existsResult.error, {
              route: '/api/cron/recurring-sessions',
              action: 'check_exists',
              parentId: parent.id,
              date,
            });
            errorCount++;
            continue;
          }

          if (existsResult.data) {
            // Child already exists, skip
            continue;
          }

          // Create child session (service role — see note above; the anon
          // client's insert is RLS-blocked in a cron).
          const createResult = await createChildSession(serviceClient, parent, date);
          if (!createResult.success) {
            logError(createResult.error, {
              route: '/api/cron/recurring-sessions',
              action: 'create_child',
              parentId: parent.id,
              date,
            });
            errorCount++;
            continue;
          }

          childrenCreated++;

          // Auto-enroll the parent series' active subscribers into the new
          // child occurrence. This is the feature the "Subscribe" button
          // promises ("you'll be automatically added to future sessions") —
          // it was never wired up before. Non-fatal: an enrollment failure
          // logs but doesn't fail the child creation.
          const childId = createResult.data;
          if (childId) {
            const enrollResult = await enrollSubscribersInChildSession(serviceClient, parent.id, childId);
            if (enrollResult.success) {
              subscribersEnrolled += enrollResult.data ?? 0;
            } else {
              logError(enrollResult.error, {
                route: '/api/cron/recurring-sessions',
                action: 'enroll_subscribers',
                parentId: parent.id,
                childId,
              });
            }
          }
        } catch (err) {
          logError(err, {
            route: '/api/cron/recurring-sessions',
            action: 'process_date',
            parentId: parent.id,
            date,
          });
          errorCount++;
        }
      }
    }

    const duration_ms = Date.now() - startedAt;
    log('info', 'cron_complete', {
      action: 'cron_complete',
      route,
      duration_ms,
      parentsProcessed: parentSessions.length,
      childrenCreated,
      subscribersEnrolled,
      errors: errorCount,
    });
    return NextResponse.json({
      ok: true,
      route,
      duration_ms,
      parentsProcessed: parentSessions.length,
      childrenCreated,
      subscribersEnrolled,
      errors: errorCount,
    });
  } catch (error: unknown) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { action: 'cron_failed', route, duration_ms });
    return NextResponse.json({ ok: false, route, error: 'Internal server error' }, { status: 500 });
  }
}

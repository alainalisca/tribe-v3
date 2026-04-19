import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { childSessionExists, createChildSession } from '@/lib/dal/sessions';
import type { Session } from '@/lib/database.types';

/** Number of days ahead to generate child sessions */
const LOOKAHEAD_DAYS = 7;

/**
 * Compute the next occurrence dates for a recurring session within a lookahead window.
 * Returns an array of ISO date strings (YYYY-MM-DD).
 */
function computeNextDates(parent: Session, lookaheadDays: number): string[] {
  const pattern = parent.recurrence_pattern;
  if (!pattern) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endWindow = new Date(today);
  endWindow.setDate(endWindow.getDate() + lookaheadDays);

  // If recurrence_end_date is set and it's before today, no more occurrences
  if (parent.recurrence_end_date) {
    const recEnd = new Date(parent.recurrence_end_date + 'T23:59:59');
    if (recEnd < today) return [];
    // Cap the window at the recurrence end date
    if (recEnd < endWindow) {
      endWindow.setTime(recEnd.getTime());
    }
  }

  const originalDate = new Date(parent.date + 'T00:00:00');
  const dates: string[] = [];

  if (pattern === 'weekly') {
    // Same day of week, every week starting from the original date
    const cursor = new Date(originalDate);
    while (cursor <= endWindow) {
      if (cursor > today) {
        dates.push(toISODate(cursor));
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (pattern === 'biweekly') {
    // Same day of week, every 2 weeks from original date
    const cursor = new Date(originalDate);
    while (cursor <= endWindow) {
      if (cursor > today) {
        dates.push(toISODate(cursor));
      }
      cursor.setDate(cursor.getDate() + 14);
    }
  } else if (pattern === 'monthly') {
    // Same day of month
    const dayOfMonth = originalDate.getDate();
    const cursor = new Date(originalDate);
    while (cursor <= endWindow) {
      if (cursor > today) {
        dates.push(toISODate(cursor));
      }
      // Move to next month, keeping the same day
      cursor.setMonth(cursor.getMonth() + 1);
      // Handle months with fewer days (e.g., Jan 31 -> Feb 28)
      cursor.setDate(Math.min(dayOfMonth, daysInMonth(cursor.getFullYear(), cursor.getMonth())));
    }
  }

  return dates;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * @description Generates child session instances for active recurring parent sessions.
 *   Looks 7 days ahead and creates any missing child sessions. Idempotent — safe to run multiple times.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, parentsProcessed: number, childrenCreated: number, errors: number }}
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // 1. Fetch all active recurring parent sessions
    const { data: parents, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .eq('is_recurring', true)
      .eq('status', 'active')
      .is('recurring_parent_id', null);

    if (fetchError) {
      logError(fetchError, { route: '/api/cron/recurring-sessions', action: 'fetch_parents' });
      return NextResponse.json({ error: 'Failed to fetch recurring parents' }, { status: 500 });
    }

    const parentSessions = (parents || []) as Session[];
    let childrenCreated = 0;
    let errorCount = 0;

    // 2. For each parent, compute upcoming dates and create missing children
    for (const parent of parentSessions) {
      const nextDates = computeNextDates(parent, LOOKAHEAD_DAYS);

      for (const date of nextDates) {
        try {
          // Check if child already exists for this date (idempotency)
          const existsResult = await childSessionExists(supabase, parent.id, date);
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

          // Create child session
          const createResult = await createChildSession(supabase, parent, date);
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

    return NextResponse.json({
      success: true,
      parentsProcessed: parentSessions.length,
      childrenCreated,
      errors: errorCount,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/cron/recurring-sessions', action: 'recurring_sessions_cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

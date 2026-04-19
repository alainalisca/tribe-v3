import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { generateNudgesForUser } from '@/lib/nudges/behavioral-engine';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { createNotification } from '@/lib/dal/notifications';

/**
 * Runs the behavioral nudge engine over active users and sends the single
 * highest-priority candidate per user (respecting anti-spam + quiet hours +
 * preferences). Meant to run every 2-4 hours.
 */

const ANTI_SPAM_WINDOW_HOURS = 48;
const QUIET_START_HOUR = 22; // 10pm local (Colombia default)
const QUIET_END_HOUR = 8;
const MAX_UNREAD_BEFORE_PAUSE = 5;

function isColombiaQuietHour(): boolean {
  const now = new Date();
  // Colombia is UTC-5
  const colombia = new Date(now.getTime() - 5 * 3600 * 1000);
  const hour = colombia.getUTCHours();
  if (QUIET_START_HOUR > QUIET_END_HOUR) {
    return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  }
  return hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR;
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isColombiaQuietHour()) {
      return NextResponse.json({ success: true, skipped: 'quiet_hours' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Active users: logged in within last 30 days.
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: activeUsers, error: usersErr } = await supabase
      .from('users')
      .select('id, last_active_at')
      .gte('last_active_at', since)
      .limit(500);
    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    let sent = 0;
    let skipped = 0;
    const cutoff = new Date(Date.now() - ANTI_SPAM_WINDOW_HOURS * 3600 * 1000).toISOString();

    for (const userRow of (activeUsers as Array<{ id: string }> | null) || []) {
      const userId = userRow.id;

      // Anti-spam: max 1 behavioral nudge per 48 hours.
      const { count: recent } = await supabase
        .from('nudge_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('sent_at', cutoff);
      if ((recent ?? 0) > 0) {
        skipped += 1;
        continue;
      }

      // Anti-spam: pause if user has too many unread notifications.
      const { count: unread } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .is('read_at', null);
      if ((unread ?? 0) > MAX_UNREAD_BEFORE_PAUSE) {
        skipped += 1;
        continue;
      }

      const candidates = await generateNudgesForUser(supabase, userId);
      if (candidates.length === 0) {
        skipped += 1;
        continue;
      }
      const best = candidates[0];

      // Respect per-category preferences for in-app creation + push delivery.
      const inAppOk = await shouldSendNotification(supabase, userId, best.nudgeType, 'in_app');
      if (!inAppOk) {
        skipped += 1;
        continue;
      }

      // Log the nudge first (so anti-spam catches it next run).
      await supabase.from('nudge_log').insert({
        user_id: userId,
        nudge_type: best.nudgeType,
        message: best.message,
        action_url: best.actionUrl,
      });

      // Create the in-app notification.
      await createNotification(supabase, {
        recipient_id: userId,
        actor_id: null,
        type: best.nudgeType,
        entity_type: 'nudge',
        entity_id: null,
        message: best.message,
      });

      sent += 1;
    }

    return NextResponse.json({ success: true, sent, skipped });
  } catch (error) {
    logError(error, { action: 'behavioral-nudges-cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

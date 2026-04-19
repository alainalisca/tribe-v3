import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { getCurrentSpotlight, selectNextSpotlight, createSpotlight, endSpotlight } from '@/lib/dal/spotlight';
import { createNotification } from '@/lib/dal/notifications';

/**
 * Weekly rotation: expire the current spotlight if it's past, and pick a new
 * instructor algorithmically. Protected by CRON_SECRET. Intended to run every
 * Monday at 00:00 (scheduled in vercel.json or equivalent).
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    // 1. End current spotlight if expired
    const currentRes = await getCurrentSpotlight(supabase);
    let expired = false;
    if (currentRes.success && currentRes.data) {
      if (currentRes.data.end_date < todayIso) {
        await endSpotlight(supabase, currentRes.data.id);
        expired = true;
      } else {
        // Still running, don't rotate
        return NextResponse.json({
          success: true,
          rotated: false,
          reason: 'current spotlight is still active',
          current_end: currentRes.data.end_date,
        });
      }
    }

    // 2. Select next instructor
    const nextRes = await selectNextSpotlight(supabase);
    if (!nextRes.success) {
      return NextResponse.json({ error: nextRes.error }, { status: 500 });
    }
    if (!nextRes.data) {
      return NextResponse.json({
        success: true,
        rotated: false,
        expired,
        reason: 'no eligible instructors',
      });
    }

    // 3. Create the new spotlight for the next 7 days
    const endDate = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const createRes = await createSpotlight(supabase, nextRes.data.instructor_id, todayIso, endDate, 'algorithmic');
    if (!createRes.success) {
      return NextResponse.json({ error: createRes.error }, { status: 500 });
    }

    // 4. Notify the selected instructor
    await createNotification(supabase, {
      recipient_id: nextRes.data.instructor_id,
      actor_id: null,
      type: 'spotlight_selected',
      entity_type: 'spotlight',
      entity_id: createRes.data?.id ?? null,
      message: "Congratulations! You've been selected as Instructor of the Week!",
    });

    return NextResponse.json({
      success: true,
      rotated: true,
      expired,
      instructor_id: nextRes.data.instructor_id,
      spotlight_id: createRes.data?.id,
      start_date: todayIso,
      end_date: endDate,
    });
  } catch (error) {
    logError(error, { action: 'spotlight-rotation-cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

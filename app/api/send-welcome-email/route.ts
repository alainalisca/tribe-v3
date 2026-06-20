import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { fetchUsersNeedingWelcomeEmail, markWelcomeEmailSent } from '@/lib/dal/users';
import { sendWelcomeEmail } from '@/lib/welcome-email';

/**
 * @description Sends the one-time welcome onboarding email to users who have not yet received it, then marks each one as sent. Runs as a cron sweep.
 * @method POST
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @param {void} request.body - No request body expected; users needing the welcome email are fetched automatically.
 * @returns {{ success: boolean, sent: number, failed: number }} Count of welcome emails sent and failures left for the next sweep.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const usersResult = await fetchUsersNeedingWelcomeEmail(supabase);
    if (!usersResult.success) {
      return NextResponse.json({ error: usersResult.error || 'Failed to fetch users' }, { status: 500 });
    }

    const users = usersResult.data || [];

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const result = await sendWelcomeEmail({
          email: user.email,
          name: user.name,
          language: user.preferred_language ?? 'en',
        });

        if (result.success) {
          // Only mark as sent once the email actually went out — failures are
          // left untouched so the next sweep retries them.
          await markWelcomeEmailSent(supabase, user.id);
          sent++;
        } else {
          logError(new Error(result.error || 'Welcome email send failed'), {
            route: '/api/send-welcome-email',
            action: 'send_welcome_email',
            userId: user.id,
          });
          failed++;
        }
      } catch (error: unknown) {
        logError(error, { route: '/api/send-welcome-email', action: 'send_welcome_email', userId: user.id });
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/send-welcome-email', action: 'welcome_email_sweep' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

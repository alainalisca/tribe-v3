import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isValidCronAuth } from '@/lib/auth/cron';
import { logError } from '@/lib/logger';
import { fetchUsersNeedingWelcomeEmail, markWelcomeEmailSent } from '@/lib/dal/users';
import { sendWelcomeEmail } from '@/lib/welcome-email';

/**
 * @description Cron sweep that sends the one-time welcome onboarding email to users who have not received it yet. A user is only marked as sent when the email actually succeeds, so failures are retried on the next sweep.
 * @method POST
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header (fails closed).
 * @param {void} request.body - No request body expected; eligible users are fetched automatically.
 * @returns {{ success: boolean, sent: number, failed: number }} Count of emails sent and failed this sweep.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!isValidCronAuth(request.headers.get('authorization'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Cron has no user session — use the service-role client.
    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const usersResult = await fetchUsersNeedingWelcomeEmail(supabase);
    const users = usersResult.data ?? [];

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const result = await sendWelcomeEmail({
        email: user.email,
        name: user.name,
        language: user.preferred_language ?? 'en',
      });

      if (result.success) {
        // Only stamp on a confirmed send — a failure is left unmarked so the
        // next sweep picks it up again.
        await markWelcomeEmailSent(supabase, user.id);
        sent++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({ success: true, sent, failed });
  } catch (error: unknown) {
    logError(error, { route: '/api/send-welcome-email', action: 'send_welcome_email' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
